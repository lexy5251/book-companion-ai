import Link from "next/link";
import { chapterHref, type ChapterLink } from "./reader-utils";

type TableOfContentsProps = {
  bookId: string;
  chapters: ChapterLink[];
  currentPosition: number;
};

export default function TableOfContents({
  bookId,
  chapters,
  currentPosition,
}: TableOfContentsProps) {
  return (
    <nav aria-label="Table of contents" className="text-sm">
      <ol className="space-y-0.5">
        {chapters.map((chapter) => {
          const active = chapter.position === currentPosition;

          return (
            <li key={chapter.position}>
              <Link
                href={chapterHref(bookId, chapter.position)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "block rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "block rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }
              >
                {chapter.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
