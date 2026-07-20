import { prisma } from "@/lib/prisma";
import type { ChatMode } from "@/lib/prompt";
import type { CitationView } from "@/lib/citations";

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

/**
 * Persist one chat turn: the user's question and the assistant's answer (as two
 * ChatMessage rows on the book's thread), plus a Citation row per cited passage.
 * One thread per book for MVP (get-or-create). Runs in a transaction so a turn
 * is stored whole or not at all. `userId` is null until auth (Level 2).
 */
export async function persistChatTurn(opts: {
  bookId: string;
  question: string;
  answer: string;
  mode: ChatMode;
  highlight?: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  citations: CitationView[];
}): Promise<PersistTurnResult> {
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
    // One thread per book : reuse the oldest, or create it on first ask.
    let thread = await tx.chatThread.findFirst({
      where: { bookId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!thread) {
      thread = await tx.chatThread.create({
        data: { bookId, title: toThreadTitle(question) },
        select: { id: true },
      });
    }

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

    // One Citation per cited passage. `citations` is already deduped and
    // ordered, so `rank` is just its position (satisfies the (messageId, rank)
    // and (messageId, chunkId) unique constraints).
    if (citations.length > 0) {
      await tx.citation.createMany({
        data: citations.map((c, i) => ({
          messageId: assistantMessage.id,
          chunkId: c.chunkId,
          rank: i + 1,
          score: c.score,
          excerpt: c.excerpt,
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
