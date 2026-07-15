import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { EPub } from "epub2";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 50 * 1024 * 1024; // keep in sync with the upload UI
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Rough plain-text extraction from chapter HTML — good enough for later
 *  chunking/search; the original HTML is kept in `contentHtml` for rendering. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ChapterInput = {
  chapterIndex: number;
  title: string | null;
  href: string | null;
  contentHtml: string;
  contentText: string;
};

export async function POST(req: NextRequest) {
  // --- Read + validate the uploaded file -----------------------------------
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was provided." }, { status: 400 });
  }
  const isEpub =
    file.name.toLowerCase().endsWith(".epub") ||
    file.type === "application/epub+zip";
  if (!isEpub) {
    return NextResponse.json(
      { error: "File must be an EPUB (.epub)." },
      { status: 415 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That file exceeds the 50 MB limit." },
      { status: 413 },
    );
  }

  // File is named by the book's UUID (not the user's filename) to avoid
  // collisions and path-injection; the original name is kept in the DB.
  const bookId = randomUUID();
  const storedName = `${bookId}.epub`;
  const absPath = path.join(UPLOAD_DIR, storedName);
  const relPath = path.posix.join("uploads", storedName); // portable, stored in DB

  // --- 1. Persist raw bytes to local disk ----------------------------------
  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
    await writeFile(absPath, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error("[upload] failed to write file", err);
    return NextResponse.json(
      { error: "Could not save the uploaded file." },
      { status: 500 },
    );
  }

  // --- 2. Parse the EPUB, extract metadata + chapters, 3. save rows --------
  try {
    const epub = await EPub.createAsync(absPath);

    const title =
      epub.metadata.title?.trim() || file.name.replace(/\.epub$/i, "");
    const author = epub.metadata.creator?.trim() || null;
    const language = epub.metadata.language?.trim() || null;
    const description = epub.metadata.description?.trim() || null;

    // `flow` is the spine — chapters in reading order.
    const chapters: ChapterInput[] = [];
    let chapterIndex = 0;
    for (const item of epub.flow) {
      if (!item.id) continue;
      let html: string;
      try {
        html = await epub.getChapterAsync(item.id);
      } catch (err) {
        // Skip an unreadable spine entry rather than fail the whole upload.
        console.warn(`[upload] could not read chapter ${item.id}`, err);
        continue;
      }
      const text = stripHtml(html);
      if (!text) continue; // skip empty items (cover, nav placeholders)
      chapters.push({
        chapterIndex,
        title: item.title?.trim() || null,
        href: item.href ?? null,
        contentHtml: html,
        contentText: text,
      });
      chapterIndex++;
    }

    if (chapters.length === 0) {
      throw new Error("No readable chapters found in EPUB.");
    }

    const book = await prisma.book.create({
      data: {
        id: bookId,
        title,
        author,
        language,
        description,
        sourceFileName: file.name,
        sourceFilePath: relPath,
        sourceMimeType: "application/epub+zip",
        // "READY" here means parsed & readable. The embedding pipeline
        // (Phase 3) will introduce PROCESSING before chat is available.
        status: "READY",
        chapters: { create: chapters },
      },
      select: { id: true },
    });

    return NextResponse.json(
      { bookId: book.id, title, author, chapterCount: chapters.length },
      { status: 201 },
    );
  } catch (err) {
    console.error("[upload] parse/save failed", err);
    // Roll back the orphaned file so we don't leave junk on disk.
    await unlink(absPath).catch(() => {});
    return NextResponse.json(
      { error: "Could not read this EPUB. It may be malformed or DRM-protected." },
      { status: 422 },
    );
  }
}
