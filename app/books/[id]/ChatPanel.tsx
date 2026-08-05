"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChatAnswer from "./ChatAnswer";
import { ChatApiError, sendChatQuestion } from "./chat-client";
import ChatComposer from "./ChatComposer";
import { useSelectionContext } from "./SelectionProvider";
import type { CitationView } from "@/lib/citations";

// One question→answer exchange in the visible thread. `status` drives whether
// we show a spinner, the answer, or an error under the question. `highlight` is
// set when the question was asked about a passage the reader selected.
type ChatExchange = {
  id: string;
  question: string;
  highlight?: string;
  status: "pending" | "done" | "error";
  answer?: string;
  citations?: CitationView[];
  error?: string;
};

// A stable-enough client id for an exchange without pulling in a uuid dep. Only used
// as a React key, never persisted.
let exchangeCounter = 0;
function nextExchangeId(): string {
  exchangeCounter += 1;
  return `exchange-${exchangeCounter}`;
}

export default function ChatPanel({ bookId }: { bookId: string }) {
  const [exchanges, setExchanges] = useState<ChatExchange[]>([]);
  const [pending, setPending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { attachedHighlight, clearHighlight } = useSelectionContext();

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [exchanges]);

  // When a passage is attached (from the reader's "Ask about this"), bring the
  // panel into view — matters on narrow screens where it sits below the reader.
  useEffect(() => {
    if (attachedHighlight) {
      rootRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [attachedHighlight]);

  const updateExchange = useCallback(
    (id: string, patch: Partial<ChatExchange>) => {
      setExchanges((prev) =>
        prev.map((exchange) =>
          exchange.id === id ? { ...exchange, ...patch } : exchange,
        ),
      );
    },
    [],
  );

  const ask = useCallback(
    async (question: string, highlight?: string) => {
      const id = nextExchangeId();
      setExchanges((prev) => [
        ...prev,
        { id, question, highlight, status: "pending" },
      ]);
      setPending(true);

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
      } finally {
        setPending(false);
      }
    },
    [bookId, updateExchange],
  );

  return (
    <div
      ref={rootRef}
      className="flex h-[32rem] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white xl:sticky xl:top-8 xl:h-[calc(100vh-7rem)] dark:border-zinc-800 dark:bg-zinc-950"
    >
      <ChatHeader />
      <div
        ref={threadRef}
        aria-live="polite"
        className="flex flex-1 flex-col gap-6 overflow-y-auto p-4"
      >
        {exchanges.length === 0 ? (
          <EmptyHint />
        ) : (
          exchanges.map((exchange) => (
            <ChatExchangeItem key={exchange.id} exchange={exchange} />
          ))
        )}
      </div>
      <ChatComposer
        pending={pending}
        attachedHighlight={attachedHighlight}
        onClearHighlight={clearHighlight}
        onSubmit={ask}
      />
    </div>
  );
}

function ChatHeader() {
  return (
    <header className="flex flex-none flex-col gap-0.5 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
        Ask this book
      </span>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">
        Answers are grounded in the text, with citations you can check.
      </span>
    </header>
  );
}

function EmptyHint() {
  return (
    <p className="m-auto max-w-[30ch] text-center text-sm leading-relaxed text-zinc-400 dark:text-zinc-500">
      Ask a question about the whole book, or highlight a passage in the text to
      ask about it directly.
    </p>
  );
}

function ChatExchangeItem({ exchange }: { exchange: ChatExchange }) {
  return (
    <div className="flex flex-col gap-2">
      {exchange.highlight && <HighlightQuote text={exchange.highlight} />}
      <QuestionBubble text={exchange.question} />

      {exchange.status === "pending" && <PendingAnswer />}
      {exchange.status === "error" && <ErrorAnswer message={exchange.error} />}
      {exchange.status === "done" && exchange.answer !== undefined && (
        <ChatAnswer
          answer={exchange.answer}
          citations={exchange.citations ?? []}
        />
      )}
    </div>
  );
}

// The passage a highlight-triggered question was asked about, shown above the
// question in the thread.
function HighlightQuote({ text }: { text: string }) {
  return (
    <blockquote className="max-w-[88%] self-end rounded border-l-[3px] border-blue-500 bg-blue-50 px-3 py-2 text-sm italic leading-snug text-zinc-500 dark:bg-blue-400/10 dark:text-zinc-400">
      <span className="line-clamp-4">{text}</span>
    </blockquote>
  );
}

function QuestionBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[88%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-zinc-100 px-3 py-2 text-sm leading-relaxed text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
      {text}
    </div>
  );
}

function PendingAnswer() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500">
      <span className="flex gap-1">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      <span>Reading the book…</span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-current"
      style={{ animationDelay: delay }}
    />
  );
}

function ErrorAnswer({ message }: { message?: string }) {
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      {message ?? "Something went wrong. Please try again."}
    </p>
  );
}
