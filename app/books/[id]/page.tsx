import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sanitizeChapterHtml } from "@/lib/sanitize-html";
import ReaderShell from "./ReaderShell";
import { ReaderSettingsProvider } from "./ReaderSettingsProvider";

// Chapter titles are often null because epub2 can leave spine-item titles
// undefined. Fall back to the same "Chapter N" label the citations use
// (lib/prompt.ts), 1-indexed, so the reader and answers agree.
export function chapterLabel(chapter: {
  title: string | null;
  chapterIndex: number;
}): string {
  return chapter.title?.trim() || `Chapter ${chapter.chapterIndex + 1}`;
}

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ c?: string }>;
};

// Book.id is a Postgres uuid column, so Prisma throws (500) rather than
// returning null when the path segment isn't valid UUID syntax. Treat a
// malformed id as "no such book" (404).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadBook(id: string) {
  if (!UUID_RE.test(id)) return null;
  return prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      author: true,
      chapters: {
        orderBy: { chapterIndex: "asc" },
        select: { id: true, chapterIndex: true, title: true },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const book = await loadBook(id);
  return { title: book ? `${book.title} · Reader` : "Reader · Book Companion AI" };
}

export default async function BookReaderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const book = await loadBook(id);
  if (!book || book.chapters.length === 0) notFound();

  // `?c=N` selects the chapter by its position in the ordered list. Clamp so a
  // missing/garbage/out-of-range value lands on the first chapter rather than
  // erroring.
  const { c } = await searchParams;
  const requested = Number.parseInt(c ?? "", 10);
  const position =
    Number.isInteger(requested) &&
    requested >= 0 &&
    requested < book.chapters.length
      ? requested
      : 0;

  const current = book.chapters[position];
  const chapter = await prisma.chapter.findUnique({
    where: { id: current.id },
    select: { contentHtml: true },
  });
  if (!chapter) notFound();

  const html = sanitizeChapterHtml(chapter.contentHtml);

  return (
    <ReaderSettingsProvider>
      <ReaderShell
        bookId={book.id}
        bookTitle={book.title}
        bookAuthor={book.author}
        chapters={book.chapters.map((ch, position) => ({
          position,
          label: chapterLabel(ch),
        }))}
        currentPosition={position}
        chapterHtml={html}
      />
    </ReaderSettingsProvider>
  );
}
