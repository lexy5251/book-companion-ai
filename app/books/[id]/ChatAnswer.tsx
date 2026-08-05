import type { ReactNode } from "react";
import type { CitationView } from "@/lib/citations";

// Same fallback label the reader (page.tsx) and prompt builder (lib/prompt.ts)
// use, so a citation chip reads identically to the chapter it points at.
function citationLabel(citation: CitationView): string {
  return citation.chapterTitle?.trim() || `Chapter ${citation.chapterIndex + 1}`;
}

export default function ChatAnswer({
  answer,
  citations,
}: {
  answer: string;
  citations: CitationView[];
}) {
  return (
    <div className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 flex-none place-items-center rounded-md bg-zinc-900 text-[0.6rem] font-bold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
          AI
        </span>
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Companion
        </span>
      </div>
      <AnswerBody answer={answer} />
      {citations.length > 0 && <SourceList citations={citations} />}
    </div>
  );
}

// Matches `[1]`, `[2][3]`, and `[1, 2]` — the citation markers the model emits
// (see lib/citations.ts). Splitting on it lets us render each number as a
// superscript inline with the answer text while preserving the model's own
// line breaks via `whitespace-pre-line`.
const CITATION_RE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function AnswerBody({ answer }: { answer: string }) {
  return (
    <div className="whitespace-pre-line">{renderWithCitations(answer)}</div>
  );
}

function renderWithCitations(answer: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = new RegExp(CITATION_RE);
  let lastIndex = 0;
  let markerKey = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(answer)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(answer.slice(lastIndex, match.index));
    }
    for (const raw of match[1].split(",")) {
      const num = raw.trim();
      if (num) nodes.push(<CitationMarker key={`m-${markerKey++}`} num={num} />);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < answer.length) nodes.push(answer.slice(lastIndex));
  return nodes;
}

function CitationMarker({ num }: { num: string }) {
  return (
    <sup className="px-0.5 align-super text-[0.65em] font-bold text-blue-600 dark:text-blue-400">
      {num}
    </sup>
  );
}

function SourceList({ citations }: { citations: CitationView[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        Sources
      </span>
      {citations.map((citation) => (
        <span
          key={citation.n}
          title={citation.excerpt}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 py-0.5 pl-0.5 pr-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
        >
          <span className="grid h-4 w-4 flex-none place-items-center rounded-full bg-zinc-900 text-[0.6rem] font-bold text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900">
            {citation.n}
          </span>
          {citationLabel(citation)}
        </span>
      ))}
    </div>
  );
}
