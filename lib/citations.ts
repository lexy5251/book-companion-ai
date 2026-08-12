import type { RetrievedChunk } from "@/lib/retrieval";

/** A citation as returned to the client and persisted to the DB. */
export type CitationView = {
  /** The `[n]` marker the model used, 1-based into the retrieved sources. */
  n: number;
  chunkId: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string | null;
  chunkIndex: number;
  /** Cosine similarity (1 - distance); higher = closer. */
  score: number;
  /** The cited passage text, denormalized for display without a join. */
  excerpt: string;
};

/**
 * Extract the distinct source numbers a model cited via `[n]` markers, in order
 * of first appearance. Handles `[1]`, `[1][2]`, and `[1, 2]`. Keeps only numbers
 * in `[1, sourceCount]` — a citation can only point at a passage we actually
 * retrieved, so any out-of-range (hallucinated) number is dropped.
 */
export function parseCitationRefs(answer: string, sourceCount: number): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  const bracket = /\[([\d\s,]+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = bracket.exec(answer)) !== null) {
    for (const part of match[1].split(",")) {
      const n = Number(part.trim());
      if (!Number.isInteger(n) || n < 1 || n > sourceCount || seen.has(n)) {
        continue;
      }
      seen.add(n);
      order.push(n);
    }
  }
  return order;
}

/**
 * Order citation objects by the first appearance of their `[n]` markers in an
 * answer. Citations not referenced in the answer are preserved at the end in
 * their original order rather than being silently dropped.
 */
export function orderCitationsByAppearance(
  answer: string,
  citations: CitationView[],
): CitationView[] {
  const highestCitationNumber = citations.reduce(
    (highest, citation) => Math.max(highest, citation.n),
    0,
  );
  const citationNumbersByAppearance = parseCitationRefs(
    answer,
    highestCitationNumber,
  );
  const citationsByNumber = new Map(
    citations.map((citation) => [citation.n, citation]),
  );

  const orderedCitations: CitationView[] = [];
  for (const citationNumber of citationNumbersByAppearance) {
    const citation = citationsByNumber.get(citationNumber);
    if (citation) {
      orderedCitations.push(citation);
      citationsByNumber.delete(citationNumber);
    }
  }

  for (const citation of citations) {
    if (citationsByNumber.has(citation.n)) orderedCitations.push(citation);
  }

  return orderedCitations;
}

/**
 * Map cited source numbers back to the chunks they reference, producing the
 * citation objects for the response (and for persistence). Pure — no DB — so it
 * works even if the history write later fails.
 */
export function buildCitations(
  chunks: RetrievedChunk[],
  citedNumbers: number[],
): CitationView[] {
  const out: CitationView[] = [];
  for (const n of citedNumbers) {
    const c = chunks[n - 1];
    if (!c) continue;
    out.push({
      n,
      chunkId: c.id,
      chapterId: c.chapterId,
      chapterIndex: c.chapterIndex,
      chapterTitle: c.chapterTitle,
      chunkIndex: c.chunkIndex,
      score: Number((1 - c.distance).toFixed(4)),
      excerpt: c.text,
    });
  }
  return out;
}
