const EPUB_EXTENSION = ".epub";
const EPUB_MIME_TYPE = "application/epub+zip";

export const EPUB_ACCEPT = `${EPUB_EXTENSION},${EPUB_MIME_TYPE}`;
export const MAX_EPUB_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(0)} KB`;

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function getEpubValidationError(file: File): string | null {
  const hasEpubExtension = file.name.toLowerCase().endsWith(EPUB_EXTENSION);
  const hasEpubMimeType = file.type === EPUB_MIME_TYPE;

  if (!hasEpubExtension && !hasEpubMimeType) {
    return "That doesn't look like an EPUB. Please choose a .epub file.";
  }

  if (file.size > MAX_EPUB_BYTES) {
    return `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_EPUB_BYTES)}.`;
  }

  return null;
}
