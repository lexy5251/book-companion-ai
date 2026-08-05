export type ChapterLink = { position: number; label: string };

export function chapterHref(bookId: string, position: number): string {
  // Chapter 0 is the canonical URL for a book, so keep it clean.
  return position === 0 ? `/books/${bookId}` : `/books/${bookId}?c=${position}`;
}
