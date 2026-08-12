import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ChatMode } from "@/lib/prompt";
import {
  orderCitationsByAppearance,
  type CitationView,
} from "@/lib/citations";

export type PersistChatTurnInput = {
  bookId: string;
  question: string;
  answer: string;
  mode: ChatMode;
  highlight?: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  citations: CitationView[];
};

export type PersistTurnResult = {
  threadId: string;
  userMessageId: string;
  assistantMessageId: string;
};

/** Truncate a question into a short thread title. */
function toThreadTitle(question: string): string {
  const trimmed = question.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
}

/** Reuse the book's first thread, or create it when the first question arrives. */
async function findOrCreateThread(
  tx: Prisma.TransactionClient,
  bookId: string,
  firstQuestion: string,
): Promise<{ id: string }> {
  const existingThread = await tx.chatThread.findFirst({
    where: { bookId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existingThread) return existingThread;

  return tx.chatThread.create({
    data: { bookId, title: toThreadTitle(firstQuestion) },
    select: { id: true },
  });
}

/**
 * Persist one chat turn: the user's question and the assistant's answer (as two
 * ChatMessage rows on the book's thread), plus a Citation row per cited passage.
 * One thread per book for MVP (get-or-create). Runs in a transaction so a turn
 * is stored whole or not at all. `userId` is null until auth (Level 2).
 */
export async function persistChatTurn(
  opts: PersistChatTurnInput,
): Promise<PersistTurnResult> {
  const {
    bookId,
    question,
    answer,
    mode,
    highlight,
    model,
    inputTokens,
    outputTokens,
    citations,
  } = opts;

  return prisma.$transaction(async (tx) => {
    const thread = await findOrCreateThread(tx, bookId, question);

    const userMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "USER",
        questionMode: mode,
        content: question,
        highlightedText: highlight ?? null,
      },
      select: { id: true },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "ASSISTANT",
        content: answer,
        model,
        inputTokens,
        outputTokens,
      },
      select: { id: true },
    });

    // One Citation per cited passage. `rank` stores the source's `[n]` marker
    // number (its 1-based position in the retrieved list), NOT the loop index —
    // that's what lets `loadChatHistory` map a restored answer's `[n]` markers
    // back to their chunks. `citations` is deduped, so the marker numbers are
    // distinct, satisfying the (messageId, rank) and (messageId, chunkId)
    // unique constraints.
    if (citations.length > 0) {
      await tx.citation.createMany({
        data: citations.map((citation) => ({
          messageId: assistantMessage.id,
          chunkId: citation.chunkId,
          rank: citation.n,
          score: citation.score,
          excerpt: citation.excerpt,
        })),
      });
    }

    return {
      threadId: thread.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    };
  });
}

/** One restored question→answer turn, shaped for the chat panel to render. */
export type ChatHistoryExchange = {
  /** The user message's id — stable and unique, reused as the React key. */
  id: string;
  question: string;
  highlight?: string;
  answer: string;
  citations: CitationView[];
};

// A persisted citation joined to the chapter it points at, as selected below.
type PersistedCitation = {
  rank: number;
  score: number | null;
  excerpt: string | null;
  chunk: {
    id: string;
    chunkIndex: number;
    chapter: { id: string; chapterIndex: number; title: string | null };
  };
};

type PersistedMessage = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  highlightedText: string | null;
  citations: PersistedCitation[];
};

/**
 * Load the book's saved conversation as ordered question→answer exchanges, so
 * the chat panel can restore history when it opens. One thread per book (mirrors
 * `persistChatTurn`); returns `[]` when the book has never been asked a question.
 */
export async function loadChatHistory(
  bookId: string,
): Promise<ChatHistoryExchange[]> {
  const thread = await prisma.chatThread.findFirst({
    where: { bookId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!thread) return [];

  const messages = await prisma.chatMessage.findMany({
    where: { threadId: thread.id, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      role: true,
      content: true,
      highlightedText: true,
      citations: {
        select: {
          rank: true,
          score: true,
          excerpt: true,
          chunk: {
            select: {
              id: true,
              chunkIndex: true,
              chapter: {
                select: { id: true, chapterIndex: true, title: true },
              },
            },
          },
        },
      },
    },
  });

  return pairMessagesIntoExchanges(messages);
}

/**
 * Pair each user message with its assistant answer. A turn writes both rows in
 * one transaction, so they share a `createdAt` and can't be reliably ordered
 * against each other. Instead we split by role — user and assistant messages are
 * each ordered correctly across turns (distinct `createdAt`) — and zip by index.
 */
function pairMessagesIntoExchanges(
  messages: PersistedMessage[],
): ChatHistoryExchange[] {
  const userMessages = messages.filter((message) => message.role === "USER");
  const assistantMessages = messages.filter(
    (message) => message.role === "ASSISTANT",
  );

  const exchanges: ChatHistoryExchange[] = [];
  const completeTurnCount = Math.min(
    userMessages.length,
    assistantMessages.length,
  );

  for (let index = 0; index < completeTurnCount; index += 1) {
    const userMessage = userMessages[index];
    const assistantMessage = assistantMessages[index];

    exchanges.push({
      id: userMessage.id,
      question: userMessage.content,
      highlight: userMessage.highlightedText ?? undefined,
      answer: assistantMessage.content,
      citations: mapPersistedCitationsToViews(
        assistantMessage.content,
        assistantMessage.citations,
      ),
    });
  }

  return exchanges;
}

/** Convert database citation records into the shape returned to the client. */
function mapPersistedCitationsToViews(
  answer: string,
  persistedCitations: PersistedCitation[],
): CitationView[] {
  const citationViews: CitationView[] = persistedCitations.map((citation) => ({
    n: citation.rank,
    chunkId: citation.chunk.id,
    chapterId: citation.chunk.chapter.id,
    chapterIndex: citation.chunk.chapter.chapterIndex,
    chapterTitle: citation.chunk.chapter.title,
    chunkIndex: citation.chunk.chunkIndex,
    score: citation.score ?? 0,
    excerpt: citation.excerpt ?? "",
  }));

  return orderCitationsByAppearance(answer, citationViews);
}
