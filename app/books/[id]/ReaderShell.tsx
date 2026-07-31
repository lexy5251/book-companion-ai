import Link from "next/link";

type ChapterLink = { position: number; label: string };

type ReaderShellProps = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  chapters: ChapterLink[];
  currentPosition: number;
  chapterHtml: string;
};

function chapterHref(bookId: string, position: number): string {
  // Chapter 0 is the canonical URL for a book, so keep it clean.
  return position === 0 ? `/books/${bookId}` : `/books/${bookId}?c=${position}`;
}

export default function ReaderShell({
  bookId,
  bookTitle,
  bookAuthor,
  chapters,
  currentPosition,
  chapterHtml,
}: ReaderShellProps) {
  const current = chapters[currentPosition];
  const prev = currentPosition > 0 ? chapters[currentPosition - 1] : null;
  const next =
    currentPosition < chapters.length - 1
      ? chapters[currentPosition + 1]
      : null;

  const toc = (
    <nav aria-label="Table of contents" className="text-sm">
      <ol className="space-y-0.5">
        {chapters.map((ch) => {
          const active = ch.position === currentPosition;
          return (
            <li key={ch.position}>
              <Link
                href={chapterHref(bookId, ch.position)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "block rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "block rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }
              >
                {ch.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 lg:flex-row lg:gap-10 lg:px-6">
      {/* Sidebar: a static column on large screens, a collapsible drawer on
          small screens. Pure HTML <details> keeps this a server component. */}
      <aside className="lg:w-64 lg:shrink-0">
        <div className="lg:sticky lg:top-8">
          <div className="mb-4">
            <h1 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {bookTitle}
            </h1>
            {bookAuthor && (
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {bookAuthor}
              </p>
            )}
          </div>

          <details className="group lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
              <span>Chapters</span>
              <span className="text-zinc-400 group-open:hidden">Show</span>
              <span className="hidden text-zinc-400 group-open:inline">
                Hide
              </span>
            </summary>
            <div className="mt-2">{toc}</div>
          </details>

          <div className="hidden lg:block">{toc}</div>
        </div>
      </aside>

      {/* Reading column. */}
      <main className="min-w-0 flex-1">
        <article
          className="reader-prose"
          dangerouslySetInnerHTML={{ __html: chapterHtml }}
        />

        <nav
          aria-label="Chapter navigation"
          className="mt-12 flex items-center justify-between gap-4 border-t border-zinc-200 pt-6 dark:border-zinc-800"
        >
          {prev ? (
            <Link
              href={chapterHref(bookId, prev.position)}
              rel="prev"
              className="group flex flex-col items-start rounded-md px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="text-xs text-zinc-400">← Previous</span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {prev.label}
              </span>
            </Link>
          ) : (
            <span />
          )}

          <span className="shrink-0 text-xs text-zinc-400">
            {current.label} · {currentPosition + 1} / {chapters.length}
          </span>

          {next ? (
            <Link
              href={chapterHref(bookId, next.position)}
              rel="next"
              className="group flex flex-col items-end rounded-md px-3 py-2 text-right hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="text-xs text-zinc-400">Next →</span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {next.label}
              </span>
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </main>
    </div>
  );
}
