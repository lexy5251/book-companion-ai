import Link from "next/link";
import { chapterHref, type ChapterLink } from "./reader-utils";

type ChapterNavigationProps = {
  bookId: string;
  current: ChapterLink;
  currentPosition: number;
  chapterCount: number;
  previousChapter: ChapterLink | null;
  nextChapter: ChapterLink | null;
};

export default function ChapterNavigation({
  bookId,
  current,
  currentPosition,
  chapterCount,
  previousChapter,
  nextChapter,
}: ChapterNavigationProps) {
  return (
    <nav
      aria-label="Chapter navigation"
      className="mt-12 flex items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
    >
      {previousChapter ? (
        <Link
          href={chapterHref(bookId, previousChapter.position)}
          rel="prev"
          className="group flex flex-col items-start rounded-md px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="text-xs text-zinc-400">← Previous</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {previousChapter.label}
          </span>
        </Link>
      ) : (
        <span />
      )}

      <span className="shrink-0 text-xs text-zinc-400">
        {current.label} · {currentPosition + 1} / {chapterCount}
      </span>

      {nextChapter ? (
        <Link
          href={chapterHref(bookId, nextChapter.position)}
          rel="next"
          className="group flex flex-col items-end rounded-md px-3 py-2 text-right hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="text-xs text-zinc-400">Next →</span>
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {nextChapter.label}
          </span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
