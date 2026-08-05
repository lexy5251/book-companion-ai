import ChatPanel from "./ChatPanel";
import ChapterNavigation from "./ChapterNavigation";
import { SelectionProvider } from "./SelectionProvider";
import SelectionListener from "./SelectionListener";
import TableOfContents from "./TableOfContents";
import type { ChapterLink } from "./reader-utils";

type ReaderShellProps = {
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  chapters: ChapterLink[];
  currentPosition: number;
  chapterHtml: string;
};

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

  return (
    // Three columns on wide screens (TOC · reading · chat). At `lg` the chat
    // drops to a full-width row below the reader; below `lg` everything stacks.
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-6">
      <SelectionProvider>
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[14rem_minmax(0,1fr)_22rem]">
          {/* Sidebar: a static column on large screens, a collapsible drawer on
              small screens. Pure HTML <details> keeps this a server component. */}
          <aside>
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
                <div className="mt-2">
                  <TableOfContents
                    bookId={bookId}
                    chapters={chapters}
                    currentPosition={currentPosition}
                  />
                </div>
              </details>

              <div className="hidden lg:block">
                <TableOfContents
                  bookId={bookId}
                  chapters={chapters}
                  currentPosition={currentPosition}
                />
              </div>
            </div>
          </aside>

          {/* Reading column. SelectionListener watches for highlighted passages
              in the article and surfaces the "Ask about this" popover. */}
          <main className="min-w-0">
            <SelectionListener>
              <article
                className="reader-prose"
                dangerouslySetInnerHTML={{ __html: chapterHtml }}
              />
            </SelectionListener>

            <ChapterNavigation
              bookId={bookId}
              current={current}
              currentPosition={currentPosition}
              chapterCount={chapters.length}
              previousChapter={prev}
              nextChapter={next}
            />
          </main>

          <div className="lg:col-span-2 xl:col-span-1">
            <ChatPanel bookId={bookId} />
          </div>
        </div>
      </SelectionProvider>
    </div>
  );
}
