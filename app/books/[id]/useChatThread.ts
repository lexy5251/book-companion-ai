"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChatApiError,
  fetchChatHistory,
  sendChatQuestion,
  type ChatHistoryExchange,
} from "./chat-client";
import type { CitationView } from "@/lib/citations";

// One question→answer exchange in the visible thread. `status` drives whether
// we show a spinner, the answer, or an error under the question. `highlight` is
// set when the question was asked about a passage the reader selected.
export type ChatExchange = {
  id: string;
  question: string;
  highlight?: string;
  status: "pending" | "done" | "error";
  answer?: string;
  citations?: CitationView[];
  error?: string;
};

// Whether the book's saved conversation has finished loading on open.
export type HistoryState = "loading" | "ready" | "error";

type ChatThreadState = {
  bookId: string;
  exchanges: ChatExchange[];
  historyState: HistoryState;
};

// A stable-enough client id for an exchange without pulling in a uuid dep. Only
// used as a React key, never persisted.
let exchangeCounter = 0;

function nextExchangeId(): string {
  exchangeCounter += 1;
  return `exchange-${exchangeCounter}`;
}

// A restored turn from a past session — already answered, so it renders "done".
function restoredExchange(history: ChatHistoryExchange): ChatExchange {
  return {
    id: history.id,
    question: history.question,
    highlight: history.highlight,
    status: "done",
    answer: history.answer,
    citations: history.citations,
  };
}

export function useChatThread(bookId: string) {
  const [thread, setThread] = useState<ChatThreadState>(() => ({
    bookId,
    exchanges: [],
    historyState: "loading",
  }));
  const isCurrentBook = thread.bookId === bookId;
  const exchanges = isCurrentBook ? thread.exchanges : [];
  const historyState = isCurrentBook ? thread.historyState : "loading";

  // Load this book's saved conversation once, on open, so history survives across
  // sessions. Restored turns go in front of anything asked while the fetch was in
  // flight, keeping the thread chronological.
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const history = await fetchChatHistory(bookId);
        if (cancelled) return;

        setThread((current) => {
          if (current.bookId !== bookId) return current;
          return {
            ...current,
            exchanges: [...history.map(restoredExchange), ...current.exchanges],
            historyState: "ready",
          };
        });
      } catch {
        if (!cancelled) {
          setThread((current) =>
            current.bookId === bookId
              ? { ...current, historyState: "error" }
              : current,
          );
        }
      }
    }

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const appendExchange = useCallback(
    (exchange: ChatExchange) => {
      setThread((current) => ({
        bookId,
        exchanges:
          current.bookId === bookId
            ? [...current.exchanges, exchange]
            : [exchange],
        historyState:
          current.bookId === bookId ? current.historyState : "loading",
      }));
    },
    [bookId],
  );

  const updateExchange = useCallback(
    (id: string, patch: Partial<ChatExchange>) => {
      setThread((current) => {
        if (current.bookId !== bookId) return current;
        return {
          ...current,
          exchanges: current.exchanges.map((exchange) =>
            exchange.id === id ? { ...exchange, ...patch } : exchange,
          ),
        };
      });
    },
    [bookId],
  );

  const ask = useCallback(
    async (question: string, highlight?: string) => {
      const id = nextExchangeId();
      appendExchange({ id, question, highlight, status: "pending" });

      try {
        const data = await sendChatQuestion({
          bookId,
          question,
          ...(highlight ? { highlight } : {}),
        });

        updateExchange(id, {
          status: "done",
          answer: data.answer,
          citations: data.citations,
        });
      } catch (error) {
        updateExchange(id, {
          status: "error",
          error:
            error instanceof ChatApiError
              ? error.message
              : "Couldn't reach the server. Check your connection and retry.",
        });
      }
    },
    [appendExchange, bookId, updateExchange],
  );

  return {
    exchanges,
    historyState,
    pending: exchanges.some((exchange) => exchange.status === "pending"),
    ask,
  };
}
