import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { embedTexts } from "@/lib/embeddings";
import {
  retrieveChunks,
  DEFAULT_TOP_K,
  type RetrievedChunk,
} from "@/lib/retrieval";
import { buildChatMessages, type ChatMode } from "@/lib/prompt";
import {
  generateAnswer,
  type GeneratedAnswer,
} from "@/lib/generate-answer";
import {
  parseCitationRefs,
  buildCitations,
  type CitationView,
} from "@/lib/citations";
import { persistChatTurn } from "@/lib/chat-store";

const MAX_QUESTION_CHARS = 2000;
const MAX_HIGHLIGHT_CHARS = 10000;

type ChatRequest = {
  bookId: string;
  question: string;
  highlight?: string;
};

type OperationResult<T> = { value: T } | { error: NextResponse };

function validateChatRequest(
  body: Record<string, unknown>,
): { request: ChatRequest } | { error: string } {
  const { bookId, question, highlight } = body;

  if (typeof bookId !== "string" || bookId.trim() === "") {
    return { error: "`bookId` is required." };
  }

  if (typeof question !== "string" || question.trim() === "") {
    return { error: "`question` is required." };
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return {
      error: `\`question\` must be ${MAX_QUESTION_CHARS} characters or fewer.`,
    };
  }

  if (highlight !== undefined) {
    if (typeof highlight !== "string" || highlight.trim() === "") {
      return {
        error: "`highlight`, when provided, must be a non-empty string.",
      };
    }
    if (highlight.length > MAX_HIGHLIGHT_CHARS) {
      return {
        error: `\`highlight\` must be ${MAX_HIGHLIGHT_CHARS} characters or fewer.`,
      };
    }
  }

  return {
    request: {
      bookId: bookId.trim(),
      question: question.trim(),
      highlight: highlight === undefined ? undefined : highlight.trim(),
    },
  };
}

function parseChatRequest(
  body: unknown,
): { request: ChatRequest } | { error: NextResponse } {
  const fail = (message: string) => ({
    error: NextResponse.json({ error: message }, { status: 400 }),
  });

  if (typeof body !== "object" || body === null) {
    return fail("Expected a JSON object body.");
  }

  const validated = validateChatRequest(body as Record<string, unknown>);
  return "error" in validated ? fail(validated.error) : validated;
}

async function checkBookIsReady(bookId: string): Promise<NextResponse | null> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, status: true },
  });

  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }
  if (book.status !== "READY") {
    return NextResponse.json(
      { error: "This book is still being prepared. Try again shortly." },
      { status: 409 },
    );
  }

  return null;
}

async function embedQuestion(
  question: string,
  highlight?: string,
): Promise<OperationResult<number[]>> {
  const queryText = highlight ? `${highlight}\n\n${question}` : question;

  try {
    const [queryVector] = await embedTexts([queryText]);
    return { value: queryVector };
  } catch (error) {
    console.error("[chat] question embedding failed", error);
    return {
      error: NextResponse.json(
        { error: "Could not process the question right now. Please try again." },
        { status: 502 },
      ),
    };
  }
}

async function findRelevantChunks(
  bookId: string,
  queryVector: number[],
): Promise<OperationResult<RetrievedChunk[]>> {
  try {
    const chunks = await retrieveChunks(bookId, queryVector, DEFAULT_TOP_K);
    if (chunks.length === 0) {
      console.error(`[chat] no chunks found for READY book ${bookId}`);
      return {
        error: NextResponse.json(
          { error: "This book has no searchable content." },
          { status: 500 },
        ),
      };
    }
    return { value: chunks };
  } catch (error) {
    console.error("[chat] chunk retrieval failed", error);
    return {
      error: NextResponse.json(
        { error: "Could not search this book right now. Please try again." },
        { status: 500 },
      ),
    };
  }
}

async function generateChatAnswer(
  request: ChatRequest,
  chunks: RetrievedChunk[],
  mode: ChatMode,
): Promise<OperationResult<GeneratedAnswer>> {
  const messages = buildChatMessages({
    question: request.question,
    highlight: request.highlight,
    chunks,
    mode,
  });

  try {
    return { value: await generateAnswer(messages) };
  } catch (error) {
    console.error("[chat] answer generation failed", error);
    return {
      error: NextResponse.json(
        { error: "Could not generate an answer right now. Please try again." },
        { status: 502 },
      ),
    };
  }
}

async function saveChatTurn(
  request: ChatRequest,
  mode: ChatMode,
  generated: GeneratedAnswer,
  citations: CitationView[],
): Promise<{ threadId: string | null; messageId: string | null }> {
  try {
    const persisted = await persistChatTurn({
      ...request,
      answer: generated.answer,
      mode,
      model: generated.model,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      citations,
    });
    return {
      threadId: persisted.threadId,
      messageId: persisted.assistantMessageId,
    };
  } catch (error) {
    console.error("[chat] failed to persist chat turn", error);
    return { threadId: null, messageId: null };
  }
}

async function processChatRequest(request: ChatRequest): Promise<NextResponse> {
  const { bookId, question, highlight } = request;

  const bookError = await checkBookIsReady(bookId);
  if (bookError) return bookError;

  const mode: ChatMode = highlight ? "HIGHLIGHT" : "FREEFORM";

  const embedded = await embedQuestion(question, highlight);
  if ("error" in embedded) return embedded.error;

  const retrieved = await findRelevantChunks(bookId, embedded.value);
  if ("error" in retrieved) return retrieved.error;

  const answered = await generateChatAnswer(request, retrieved.value, mode);
  if ("error" in answered) return answered.error;

  const citedNumbers = parseCitationRefs(
    answered.value.answer,
    retrieved.value.length,
  );
  const citations = buildCitations(retrieved.value, citedNumbers);
  const { threadId, messageId } = await saveChatTurn(
    request,
    mode,
    answered.value,
    citations,
  );

  return NextResponse.json({
    answer: answered.value.answer,
    mode,
    citations,
    threadId,
    messageId,
    persisted: threadId !== null,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseChatRequest(body);
  if ("error" in parsed) return parsed.error;

  return processChatRequest(parsed.request);
}
