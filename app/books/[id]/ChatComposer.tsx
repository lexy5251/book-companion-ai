"use client";

import { useEffect, useRef, useState } from "react";

// The question sent when a passage is highlighted but no question is typed —
// "just explain this" is the most common highlight intent.
const DEFAULT_HIGHLIGHT_QUESTION = "Explain this passage in plain terms.";

type ChatComposerProps = {
  pending: boolean;
  attachedHighlight: string | null;
  onClearHighlight: () => void;
  onSubmit: (question: string, highlight?: string) => void;
};

export default function ChatComposer({
  pending,
  attachedHighlight,
  onClearHighlight,
  onSubmit,
}: ChatComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  // With a passage attached, an empty box still sends ("explain this"); without
  // one, a typed question is required.
  const canSend = (trimmed.length > 0 || attachedHighlight !== null) && !pending;

  // Focus the box when the reader attaches a passage, so they can type straight
  // away (or just hit Enter to explain it).
  useEffect(() => {
    if (attachedHighlight) textareaRef.current?.focus();
  }, [attachedHighlight]);

  function submit() {
    if (!canSend) return;
    const question = trimmed.length > 0 ? trimmed : DEFAULT_HIGHLIGHT_QUESTION;
    onSubmit(question, attachedHighlight ?? undefined);
    onClearHighlight();
    setValue("");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline for multi-line questions.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      className="flex-none border-t border-zinc-200 p-3 dark:border-zinc-800"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {attachedHighlight && (
        <AttachedPassage text={attachedHighlight} onClear={onClearHighlight} />
      )}

      <div className="flex items-end gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 focus-within:border-blue-500 dark:border-zinc-700 dark:bg-zinc-950">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            attachedHighlight
              ? "Ask about the highlighted passage…"
              : "Ask about this book…"
          }
          aria-label="Ask a question about this book"
          className="max-h-32 flex-1 resize-none bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send question"
          className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-zinc-900 text-zinc-50 transition-opacity disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <SendIcon />
        </button>
      </div>
      <p className="mx-1 mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        Highlight text in the book to ask about a passage ·{" "}
        <kbd className="rounded border border-zinc-300 px-1 text-[0.66rem] dark:border-zinc-700">
          Enter
        </kbd>{" "}
        to send
      </p>
    </form>
  );
}

// The passage the reader selected, shown above the input until they send or
// dismiss it. Sending includes its full text as the `highlight` parameter.
function AttachedPassage({
  text,
  onClear,
}: {
  text: string;
  onClear: () => void;
}) {
  return (
    <div className="mb-2 flex items-start gap-2 rounded-lg border-l-[3px] border-blue-500 bg-blue-50 py-1.5 pl-2.5 pr-1.5 dark:bg-blue-400/10">
      <p className="line-clamp-3 flex-1 text-xs italic leading-snug text-zinc-500 dark:text-zinc-400">
        “{text}”
      </p>
      <button
        type="button"
        onClick={onClear}
        aria-label="Remove highlighted passage"
        className="flex-none rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}
