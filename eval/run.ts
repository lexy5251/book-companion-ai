/**
 * Evaluates book question-answering with a fixed set of in-book and
 * out-of-book questions. It checks retrieval, answer quality, citations, and
 * whether unsupported questions are refused, then prints a pass/fail result.
 *
 * This is NOT a CI gate. Rerun it whenever chunking, k, embeddings, or the
 * prompt change. Env knobs:
 *   EVAL_BOOK_ID      pin a specific Meditations book (default: newest matching READY book)
 *   EVAL_TOP_K        retrieval k (default: pipeline DEFAULT_TOP_K)
 *   OPENAI_CHAT_MODEL answer model (read by lib/generate-answer.ts)
 *   EVAL_JUDGE_MODEL  judge model (default: gpt-4o-mini)
 *   EVAL_LIMIT        run only the first N questions (smoke test)
 *   EVAL_CONCURRENCY  parallel pipeline calls (default: 4)
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TOP_K } from "@/lib/retrieval";
import { CHAT_MODEL } from "@/lib/generate-answer";
import {
  EXPECTED_BOOK_TITLE,
  QUESTIONS,
  validateQuestions,
  type EvalQuestion,
} from "./questions.ts";
import { runPipeline, type PipelineResult } from "./pipeline.ts";
import { judgeAnswer, judgeRefusal, JUDGE_MODEL } from "./judge.ts";

// ---- Evaluation thresholds (tunable via env) ----
const E1_MIN_RECALL = Number(process.env.EVAL_E1_MIN_RECALL ?? 0.7);
const E2_MIN_MEAN = Number(process.env.EVAL_E2_MIN_MEAN ?? 3.5);
const E2_MIN_INDIVIDUAL = Number(process.env.EVAL_E2_MIN_INDIVIDUAL ?? 2);
const E3_MIN_MEAN = Number(process.env.EVAL_E3_MIN_MEAN ?? 3.5);
const E5_MIN_REFUSAL = Number(process.env.EVAL_E5_MIN_REFUSAL ?? 1.0);

const TOP_K = Number(process.env.EVAL_TOP_K ?? DEFAULT_TOP_K);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);

/** Run `worker` over `items` with bounded concurrency, preserving order. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function isExpectedBook(title: string): boolean {
  return title.toLocaleLowerCase().includes(EXPECTED_BOOK_TITLE.toLocaleLowerCase());
}

async function resolveBookId(): Promise<{ id: string; title: string }> {
  if (process.env.EVAL_BOOK_ID) {
    const book = await prisma.book.findUnique({
      where: { id: process.env.EVAL_BOOK_ID },
      select: { id: true, title: true, status: true },
    });
    if (!book) throw new Error(`EVAL_BOOK_ID ${process.env.EVAL_BOOK_ID} not found`);
    if (book.status !== "READY") throw new Error(`Book ${book.title} is not READY (${book.status})`);
    if (!isExpectedBook(book.title)) {
      throw new Error(`Book ${book.title} is not the expected ${EXPECTED_BOOK_TITLE} book`);
    }
    return { id: book.id, title: book.title };
  }
  const books = await prisma.book.findMany({
    where: { status: "READY" },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, title: true },
  });
  const book = books.find((candidate) => isExpectedBook(candidate.title));
  if (!book) throw new Error(`No READY ${EXPECTED_BOOK_TITLE} book found. Upload and embed it first.`);
  return book;
}

function normalizeForAnchorMatch(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Resolve text anchors to current chunk indexes without using embeddings. */
async function resolveGoldChunkIndexes(
  bookId: string,
  questions: readonly EvalQuestion[],
): Promise<Map<string, number[]>> {
  const chunks = await prisma.chunk.findMany({
    where: { bookId },
    select: { chunkIndex: true, text: true },
  });
  const normalizedChunks = chunks.map((chunk) => ({
    chunkIndex: chunk.chunkIndex,
    text: normalizeForAnchorMatch(chunk.text),
  }));
  const resolved = new Map<string, number[]>();

  for (const q of questions) {
    const indexes = new Set<number>();
    for (const anchor of q.goldAnchors) {
      const normalizedAnchor = normalizeForAnchorMatch(anchor);
      for (const chunk of normalizedChunks) {
        if (chunk.text.includes(normalizedAnchor)) indexes.add(chunk.chunkIndex);
      }
    }

    const goldChunkIndexes = [...indexes].sort((a, b) => a - b);
    if (q.expected === "answer" && goldChunkIndexes.length === 0) {
      throw new Error(
        `No gold chunk found for ${q.id}. Check its text anchors against the ingested ${EXPECTED_BOOK_TITLE} book.`,
      );
    }
    resolved.set(q.id, goldChunkIndexes);
  }

  return resolved;
}

type Row = {
  q: EvalQuestion;
  result: PipelineResult;
  // E1
  goldHit: boolean | null; // null = not an E1 question (no gold)
  goldRank: number | null; // 1-based rank of best gold chunk in top-k, or null
  goldChunkIndexes: number[];
  retrievedIndexes: number[];
  // E4
  citationFaithful: boolean;
  citationViolations: string[];
  // E2/E3
  answerScore: number | null;
  answerRationale: string;
  // E5
  refused: boolean | null; // null = not an E5 question
  refusalRationale: string;
};

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

async function main() {
  validateQuestions(QUESTIONS);

  const selected = process.env.EVAL_LIMIT
    ? QUESTIONS.slice(0, Number(process.env.EVAL_LIMIT))
    : QUESTIONS;

  const book = await resolveBookId();
  const goldChunkIndexesByQuestion = await resolveGoldChunkIndexes(book.id, selected);

  console.log("═".repeat(72));
  console.log("Evaluation harness — retrieval and answer quality check");
  console.log("═".repeat(72));
  console.log(`Book:        ${book.title} (${book.id})`);
  console.log(`Questions:   ${selected.length}`);
  console.log(`Answer model: ${CHAT_MODEL}   Judge model: ${JUDGE_MODEL}   top-k: ${TOP_K}`);
  console.log("");

  // --- Stage 1: run the production pipeline for every question ---
  process.stdout.write(`Running pipeline on ${selected.length} questions...`);
  const results = await mapPool(selected, CONCURRENCY, (q) =>
    runPipeline({ bookId: book.id, question: q.question, highlight: q.highlight, k: TOP_K }),
  );
  console.log(" done.");

  // --- Stage 2: judge answers and refusals in parallel ---
  process.stdout.write("Judging answers and refusals...");
  const rows: Row[] = await mapPool(selected, CONCURRENCY, async (q, i): Promise<Row> => {
    const result = results[i];
    const retrievedIndexes = result.chunks.map((c) => c.chunkIndex);
    const goldChunkIndexes = goldChunkIndexesByQuestion.get(q.id) ?? [];

    // Retrieval recall against the independently resolved gold chunks.
    let goldHit: boolean | null = null;
    let goldRank: number | null = null;
    if (q.expected === "answer") {
      goldHit = false;
      for (let rank = 0; rank < result.chunks.length; rank++) {
        if (goldChunkIndexes.includes(result.chunks[rank].chunkIndex)) {
          goldHit = true;
          goldRank = rank + 1;
          break;
        }
      }
    }

    // E4 — every citation must reference a retrieved chunk, and n in range
    const retrievedIds = new Set(result.chunks.map((c) => c.id));
    const citationViolations: string[] = [];
    for (const c of result.citations) {
      if (!retrievedIds.has(c.chunkId)) {
        citationViolations.push(`chunkId ${c.chunkId} not in retrieved set`);
      }
      if (c.n < 1 || c.n > result.chunks.length) {
        citationViolations.push(`citation n=${c.n} out of range 1..${result.chunks.length}`);
      }
    }

    // Answer quality (skip for questions that should be refused).
    let answerScore: number | null = null;
    let answerRationale = "";
    if (q.expected === "answer") {
      const judged = await judgeAnswer({
        question: q.question,
        chunks: result.chunks,
        answer: result.answer,
        differentiator: q.differentiator,
      });
      answerScore = judged.score;
      answerRationale = judged.rationale;
    }

    // Refusal check for out-of-book questions.
    let refused: boolean | null = null;
    let refusalRationale = "";
    if (q.expected === "refusal") {
      const verdict = await judgeRefusal({ question: q.question, answer: result.answer });
      refused = verdict.refused;
      refusalRationale = verdict.rationale;
    }

    return {
      q,
      result,
      goldHit,
      goldRank,
      goldChunkIndexes,
      retrievedIndexes,
      citationFaithful: citationViolations.length === 0,
      citationViolations,
      answerScore,
      answerRationale,
      refused,
      refusalRationale,
    };
  });
  console.log(" done.\n");

  report(rows);
  await prisma.$disconnect();
}

function report(rows: Row[]) {
  // ---- Per-question detail ----
  console.log("─".repeat(72));
  console.log("PER-QUESTION RESULTS");
  console.log("─".repeat(72));
  for (const r of rows) {
    const tags = [
      r.q.mode === "HIGHLIGHT" ? "HL" : null,
      r.q.differentiator ? "E3" : null,
      r.q.expected === "refusal" ? "REFUSAL" : null,
    ]
      .filter(Boolean)
      .join(",");
    console.log(`\n● ${r.q.id}${tags ? `  [${tags}]` : ""}`);
    console.log(`  Q: ${r.q.question}`);
    if (r.q.highlight) console.log(`  highlight: "${r.q.highlight}"`);
    console.log(`  retrieved chunk idx: [${r.retrievedIndexes.join(", ")}]`);
    if (r.goldHit !== null) {
      console.log(
        `  gold chunks ${r.goldChunkIndexes.join("/")} → ${
          r.goldHit ? `HIT (rank ${r.goldRank})` : "MISS"
        }`,
      );
    }
    console.log(
      `  E4 citations: ${r.result.citations.map((c) => c.n).join(",") || "none"} → ${
        r.citationFaithful ? "faithful" : `VIOLATION: ${r.citationViolations.join("; ")}`
      }`,
    );
    if (r.answerScore !== null) {
      console.log(`  E2 score: ${r.answerScore}/5 — ${r.answerRationale}`);
    }
    if (r.refused !== null) {
      console.log(`  E5 refused: ${r.refused ? "yes ✓" : "NO ✗"} — ${r.refusalRationale}`);
    }
    console.log(`  answer: ${r.result.answer.replace(/\s+/g, " ").slice(0, 300)}${r.result.answer.length > 300 ? "…" : ""}`);
  }

  // ---- Aggregate metrics ----
  const e1Rows = rows.filter((r) => r.goldHit !== null);
  const e1Recall = e1Rows.length ? e1Rows.filter((r) => r.goldHit).length / e1Rows.length : 1;

  const e4Faithful = rows.every((r) => r.citationFaithful);
  const e4Violations = rows.filter((r) => !r.citationFaithful);

  const e2Rows = rows.filter(
    (r) => r.answerScore !== null && r.q.expected === "answer" && !r.q.differentiator,
  );
  const e2Mean = e2Rows.length ? e2Rows.reduce((s, r) => s + (r.answerScore ?? 0), 0) / e2Rows.length : 0;
  const e2Min = e2Rows.length ? Math.min(...e2Rows.map((r) => r.answerScore ?? 0)) : 0;

  const e3Rows = rows.filter(
    (r) => r.answerScore !== null && r.q.expected === "answer" && r.q.differentiator,
  );
  const e3Mean = e3Rows.length ? e3Rows.reduce((s, r) => s + (r.answerScore ?? 0), 0) / e3Rows.length : 0;

  const e5Rows = rows.filter((r) => r.refused !== null);
  const e5Refusal = e5Rows.length ? e5Rows.filter((r) => r.refused).length / e5Rows.length : 1;

  const e1Pass = e1Recall >= E1_MIN_RECALL;
  const e2Pass = e2Mean >= E2_MIN_MEAN && e2Min >= E2_MIN_INDIVIDUAL;
  const e3Pass = e3Rows.length === 0 || e3Mean >= E3_MIN_MEAN;
  const e4Pass = e4Faithful;
  const e5Pass = e5Refusal >= E5_MIN_REFUSAL;
  const evaluationPassed = e1Pass && e2Pass && e3Pass && e4Pass && e5Pass;

  const mark = (ok: boolean) => (ok ? "PASS ✓" : "FAIL ✗");

  console.log("\n" + "═".repeat(72));
  console.log("SUMMARY");
  console.log("═".repeat(72));
  console.log(
    `E1 retrieval recall@${TOP_K}:   ${fmtPct(e1Recall)}  (≥ ${fmtPct(E1_MIN_RECALL)})   ${mark(e1Pass)}`,
  );
  console.log(
    `E2 answer quality:        mean ${e2Mean.toFixed(2)}/5, min ${e2Min}/5  (mean ≥ ${E2_MIN_MEAN}, min ≥ ${E2_MIN_INDIVIDUAL})   ${mark(e2Pass)}`,
  );
  console.log(
    `E3 differentiator:        mean ${e3Mean.toFixed(2)}/5  (≥ ${E3_MIN_MEAN})   ${mark(e3Pass)}`,
  );
  console.log(
    `E4 citation faithfulness: ${e4Faithful ? "100%" : `${e4Violations.length} violation(s)`}  (must be 100%)   ${mark(e4Pass)}`,
  );
  console.log(
    `E5 grounding/no-answer:   ${fmtPct(e5Refusal)} refused  (≥ ${fmtPct(E5_MIN_REFUSAL)})   ${mark(e5Pass)}`,
  );
  console.log("─".repeat(72));
  console.log(
    `\n  RESULT: ${evaluationPassed ? "✅ PASS — evaluation thresholds met" : "❌ FAIL — review retrieval, chunking, or prompts and rerun"}\n`,
  );

  if (!evaluationPassed) {
    console.log("Failing dimensions:");
    if (!e1Pass) console.log(`  • E1: ${e1Rows.filter((r) => !r.goldHit).map((r) => r.q.id).join(", ")} missed gold`);
    if (!e2Pass) console.log(`  • E2: mean/min below threshold — see low-scoring answers above`);
    if (!e3Pass) console.log(`  • E3: differentiator mean below threshold`);
    if (!e4Pass) console.log(`  • E4: ${e4Violations.map((r) => r.q.id).join(", ")} had citation violations`);
    if (!e5Pass) console.log(`  • E5: ${e5Rows.filter((r) => !r.refused).map((r) => r.q.id).join(", ")} did not refuse`);
    console.log("");
  }

  // Non-zero exit on failure so the harness can be scripted if ever desired.
  process.exitCode = evaluationPassed ? 0 : 1;
}

main().catch((err) => {
  console.error("\nEval harness failed:", err);
  process.exitCode = 2;
});
