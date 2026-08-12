import { NextResponse, type NextRequest } from "next/server";
import { loadChatHistory } from "@/lib/chat-store";

// Book.id is a Postgres uuid column, so a non-UUID path segment would make
// Prisma throw. Match the guard the reader page uses and treat a malformed id as
// "no history" rather than a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/books/[id]/history — the book's saved conversation as ordered
 * question→answer exchanges. The chat panel loads this on open so history
 * survives across sessions. Returns `{ exchanges: [] }` for an unknown book or
 * one that's never been asked a question.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ exchanges: [] });
  }

  try {
    const exchanges = await loadChatHistory(id);
    return NextResponse.json({ exchanges });
  } catch (error) {
    console.error("[history] failed to load chat history", error);
    return NextResponse.json(
      { error: "Could not load earlier messages right now." },
      { status: 500 },
    );
  }
}
