// Naive, dependency-free chapter chunker for the embedding pipeline.
// Splits a chapter's plain text into ~500-token, sentence-aligned chunks with
// ~15% overlap. Token counts are ESTIMATED from character length (~4 chars per
// token) — "start naive" per the project notes. Swap in a real tokenizer
// (e.g. tiktoken) later if precise sizing becomes necessary. The three knobs
// (targetTokens / overlapRatio / charsPerToken) are all parameters.

export type TextChunk = {
  /** Position within the chapter, 0-based. Book-level indexing is assigned
   *  later when chunks are persisted across all chapters. */
  chunkIndex: number;
  text: string;
  /** Offset into the source text, inclusive. */
  charStart: number;
  /** Offset into the source text, exclusive. */
  charEnd: number;
  estimatedTokens: number;
};

export type ChunkOptions = {
  /** Desired chunk size in tokens (default 500). */
  targetTokens?: number;
  /** Fraction of a chunk repeated at the start of the next one (default 0.15). */
  overlapRatio?: number;
  /** Characters-per-token estimate divisor (default 4). */
  charsPerToken?: number;
};

const DEFAULTS = {
  targetTokens: 500,
  overlapRatio: 0.15,
  charsPerToken: 4,
};

function validateChunkOptions(
  targetTokens: number,
  overlapRatio: number,
  charsPerToken: number,
): void {
  if (!Number.isFinite(targetTokens) || targetTokens <= 0) {
    throw new RangeError("targetTokens must be a positive finite number");
  }
  if (
    !Number.isFinite(overlapRatio) ||
    overlapRatio < 0 ||
    overlapRatio >= 1
  ) {
    throw new RangeError(
      "overlapRatio must be between 0 (inclusive) and 1 (exclusive)",
    );
  }
  if (!Number.isFinite(charsPerToken) || charsPerToken <= 0) {
    throw new RangeError("charsPerToken must be a positive finite number");
  }
}

type Span = { start: number; end: number }; // half-open [start, end) into the text

/**
 * Split text into sentence spans over the ORIGINAL string, preserving offsets.
 * Any sentence longer than `maxChars` is split at whitespace when possible,
 * or at the hard character limit when necessary, so a single span cannot blow
 * past the chunk target.
 */
function sentenceSpans(text: string, maxChars: number): Span[] {
  const spans: Span[] = [];
  const sentenceEnd = /[.!?]+(?=\s|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const push = (start: number, end: number) => {
    // Trim surrounding whitespace off the span.
    let s = start;
    let e = end;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e <= s) return;

    if (e - s <= maxChars) {
      spans.push({ start: s, end: e });
      return;
    }

    // Hard-split an over-long span, preferring the last whitespace before the
    // limit. If there is no whitespace (for example, a giant URL or malformed
    // EPUB text), split at the hard limit so the size guarantee still holds.
    let segStart = s;
    while (e - segStart > maxChars) {
      const hardEnd = segStart + maxChars;
      let breakAt = hardEnd;
      for (let i = hardEnd; i > segStart; i--) {
        if (/\s/.test(text[i - 1])) {
          breakAt = i - 1;
          break;
        }
      }

      // Avoid an empty span when whitespace appears at the segment start.
      if (breakAt === segStart) breakAt = hardEnd;
      spans.push({ start: segStart, end: breakAt });
      segStart = breakAt;
      while (segStart < e && /\s/.test(text[segStart])) segStart++;
    }
    if (segStart < e) spans.push({ start: segStart, end: e });
  };

  while ((match = sentenceEnd.exec(text)) !== null) {
    const end = match.index + match[0].length;
    push(cursor, end);
    cursor = end;
  }
  if (cursor < text.length) push(cursor, text.length);

  return spans;
}

/**
 * Chunk a single chapter's plain text into overlapping, ~target-sized pieces.
 * Returns [] for empty/whitespace-only input.
 */
export function chunkChapterText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const { targetTokens, overlapRatio, charsPerToken } = {
    ...DEFAULTS,
    ...options,
  };
  validateChunkOptions(targetTokens, overlapRatio, charsPerToken);

  const targetChars = Math.floor(targetTokens * charsPerToken);
  if (!Number.isFinite(targetChars) || targetChars < 1) {
    throw new RangeError("chunk target must be at least one character");
  }
  const overlapChars = Math.floor(targetChars * overlapRatio);
  const maxSpanChars = Math.floor(targetChars * 1.2);

  if (!text.trim()) return [];
  const spans = sentenceSpans(text, maxSpanChars);
  if (spans.length === 0) return [];

  const spanLen = (s: Span) => s.end - s.start;
  const chunks: TextChunk[] = [];
  let i = 0;
  let chunkIndex = 0;

  while (i < spans.length) {
    // Greedily accumulate whole sentences up to the target size.
    let j = i;
    let count = 0;
    while (j < spans.length) {
      const len = spanLen(spans[j]);
      if (count > 0 && count + len > targetChars) break;
      count += len + 1; // +1 approximates the joining whitespace
      j++;
    }

    const charStart = spans[i].start;
    const charEnd = spans[j - 1].end;
    const chunkText = text.slice(charStart, charEnd).trim();
    chunks.push({
      chunkIndex: chunkIndex++,
      text: chunkText,
      charStart,
      charEnd,
      estimatedTokens: Math.ceil(chunkText.length / charsPerToken),
    });

    if (j >= spans.length) break;

    // Walk back from j to leave ~overlapChars of shared tail. `k > i + 1`
    // guarantees the next chunk starts strictly after i (no infinite loop).
    let k = j;
    let overlap = 0;
    while (k > i + 1 && overlap < overlapChars) {
      k--;
      overlap += spanLen(spans[k]);
    }
    i = k;
  }

  return chunks;
}
