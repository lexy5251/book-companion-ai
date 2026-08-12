import type { CitationView } from "@/lib/citations";

export type ChatRequest = {
  bookId: string;
  question: string;
  highlight?: string;
};

type ChatResponse = {
  answer: string;
  citations: CitationView[];
};

// One restored question→answer turn from the book's saved conversation. Mirrors
// the server's `ChatHistoryExchange` (lib/chat-store.ts); kept as its own type
// here so the client bundle never imports the server-only store module.
export type ChatHistoryExchange = {
  id: string;
  question: string;
  highlight?: string;
  answer: string;
  citations: CitationView[];
};

export class ChatApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatApiError";
  }
}

export async function sendChatQuestion(
  request: ChatRequest,
): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ChatApiError(
      getErrorMessage(data) ??
        "Something went wrong answering that. Please try again.",
    );
  }

  if (!isChatResponse(data)) {
    throw new ChatApiError("The server returned an invalid chat response.");
  }

  return data;
}

export async function fetchChatHistory(
  bookId: string,
): Promise<ChatHistoryExchange[]> {
  const response = await fetch(
    `/api/books/${encodeURIComponent(bookId)}/history`,
  );

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ChatApiError(
      getErrorMessage(data) ?? "Couldn't load earlier messages.",
    );
  }

  if (!isHistoryResponse(data)) {
    throw new ChatApiError("The server returned an invalid history response.");
  }

  return data.exchanges;
}

function isHistoryResponse(
  value: unknown,
): value is { exchanges: ChatHistoryExchange[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.exchanges) &&
    value.exchanges.every(isHistoryExchange)
  );
}

function isHistoryExchange(value: unknown): value is ChatHistoryExchange {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.question === "string" &&
    (value.highlight === undefined || typeof value.highlight === "string") &&
    typeof value.answer === "string" &&
    Array.isArray(value.citations) &&
    value.citations.every(isCitationView)
  );
}

function isChatResponse(value: unknown): value is ChatResponse {
  if (!isRecord(value)) return false;
  return (
    typeof value.answer === "string" &&
    Array.isArray(value.citations) &&
    value.citations.every(isCitationView)
  );
}

function isCitationView(value: unknown): value is CitationView {
  if (!isRecord(value)) return false;
  return (
    typeof value.n === "number" &&
    typeof value.chunkId === "string" &&
    typeof value.chapterId === "string" &&
    typeof value.chapterIndex === "number" &&
    (value.chapterTitle === null || typeof value.chapterTitle === "string") &&
    typeof value.chunkIndex === "number" &&
    typeof value.score === "number" &&
    typeof value.excerpt === "string"
  );
}

function getErrorMessage(value: unknown): string | null {
  return isRecord(value) && typeof value.error === "string"
    ? value.error
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
