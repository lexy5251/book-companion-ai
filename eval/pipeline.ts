/**
 * Thin wrapper that runs the same RAG pipeline used by the chat route.
 *
 * This mirrors the happy path of `app/api/chat/route.ts` (embed → retrieve →
 * prompt → generate → parse citations) using the exact same lib modules, so the
 * eval measures the shipping pipeline — not a re-implementation. It deliberately
 * skips the route's HTTP concerns and DB persistence (an eval shouldn't write
 * chat history), and it exposes `k` as a parameter so retrieval settings can
 * be evaluated.
 */
import { embedTexts } from "@/lib/embeddings";
import {
  retrieveChunks,
  DEFAULT_TOP_K,
  type RetrievedChunk,
} from "@/lib/retrieval";
import { buildChatMessages, type ChatMode } from "@/lib/prompt";
import { generateAnswer } from "@/lib/generate-answer";
import {
  parseCitationRefs,
  buildCitations,
  type CitationView,
} from "@/lib/citations";

export type PipelineResult = {
  mode: ChatMode;
  answer: string;
  chunks: RetrievedChunk[];
  citations: CitationView[];
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function runPipeline(opts: {
  bookId: string;
  question: string;
  highlight?: string;
  k?: number;
}): Promise<PipelineResult> {
  const { bookId, question, highlight, k = DEFAULT_TOP_K } = opts;
  const mode: ChatMode = highlight ? "HIGHLIGHT" : "FREEFORM";

  // Same query construction as the route: fold the highlight into the embedded
  // text so retrieval is anchored on the selected passage.
  const queryText = highlight ? `${highlight}\n\n${question}` : question;
  const [queryVector] = await embedTexts([queryText]);

  const chunks = await retrieveChunks(bookId, queryVector, k);

  const messages = buildChatMessages({ question, highlight, chunks, mode });
  const generated = await generateAnswer(messages);

  const citedNumbers = parseCitationRefs(generated.answer, chunks.length);
  const citations = buildCitations(chunks, citedNumbers);

  return {
    mode,
    answer: generated.answer,
    chunks,
    citations,
    model: generated.model,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
  };
}
