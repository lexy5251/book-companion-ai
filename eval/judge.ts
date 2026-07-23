/**
 * LLM-as-judge for answer quality and refusal detection.
 *
 * The judge is a separate call from the pipeline. Default is gpt-4o-mini so the
 * harness runs reliably on low-TPM API tiers; set `EVAL_JUDGE_MODEL=gpt-4o` for
 * a stronger, less self-biased grader if your rate limits allow. Either way the
 * harness prints full answers so judgment can be eyeballed, not trusted blindly.
 */
import OpenAI from "openai";
import type { RetrievedChunk } from "@/lib/retrieval";

export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "gpt-4o-mini";

// maxRetries above the SDK default (2): judge calls burst against per-minute
// token limits, and the SDK honors the 429 `retry-after` header, so a few extra
// retries let a run ride out a rate-limit window instead of aborting.
const openai = new OpenAI({ maxRetries: 8 }); // reads OPENAI_API_KEY from env

function passagesBlock(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
}

async function askJudgeJSON(system: string, user: string): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  return JSON.parse(raw) as Record<string, unknown>;
}

export type AnswerScore = { score: number; rationale: string };

/**
 * E2/E3 — score how well the answer serves a reader, given ONLY the retrieved
 * passages as ground truth. Rewards accuracy + grounding + plain-language help;
 * punishes ungrounded claims and unhelpful evasion.
 */
export async function judgeAnswer(opts: {
  question: string;
  chunks: RetrievedChunk[];
  answer: string;
  differentiator?: boolean;
}): Promise<AnswerScore> {
  const system = [
    "You are grading a reading-companion AI that answers questions about a book using retrieved passages.",
    "You are given the reader's question, the passages the AI was shown, and the AI's answer.",
    "Grade the answer on a 1-5 scale for how well it serves the reader:",
    "5 = accurate, fully grounded in the passages, and clearly helpful (explains in plain language).",
    "4 = accurate and grounded, minor gaps or slightly unclear.",
    "3 = partially helpful; thin, or minor unsupported claims.",
    "2 = weak: mostly unhelpful, or notable claims not supported by the passages.",
    "1 = wrong, or fabricates content not in the passages.",
    opts.differentiator
      ? "This is a 'dense nonfiction' question needing historical or terminological depth; reward genuine explanation of context/terms drawn from the passages."
      : "",
    'Respond as JSON: {"score": <1-5 integer>, "rationale": "<one sentence>"}.',
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `QUESTION: ${opts.question}`,
    "",
    "PASSAGES SHOWN TO THE AI:",
    passagesBlock(opts.chunks),
    "",
    `AI ANSWER: ${opts.answer}`,
  ].join("\n");

  const result = await askJudgeJSON(system, user);
  const score = Number(result.score);
  return {
    score: Number.isFinite(score) ? score : 0,
    rationale: String(result.rationale ?? ""),
  };
}

export type RefusalVerdict = { refused: boolean; rationale: string };

/**
 * E5 — decide whether the answer appropriately refuses/hedges (says the book
 * doesn't cover it) rather than confidently inventing an answer.
 */
export async function judgeRefusal(opts: {
  question: string;
  answer: string;
}): Promise<RefusalVerdict> {
  const system = [
    "You check whether a reading-companion AI correctly declined to answer a question whose answer is NOT in the book.",
    "A CORRECT refusal says (in effect) the passages/book don't contain the answer, or otherwise declines to provide book-grounded facts, without inventing an answer.",
    "An INCORRECT response confidently answers the question as if the book covered it, or invents specifics.",
    'Respond as JSON: {"refused": <true|false>, "rationale": "<one sentence>"}.',
  ].join("\n");

  const user = [`QUESTION: ${opts.question}`, "", `AI ANSWER: ${opts.answer}`].join("\n");

  const result = await askJudgeJSON(system, user);
  return {
    refused: Boolean(result.refused),
    rationale: String(result.rationale ?? ""),
  };
}
