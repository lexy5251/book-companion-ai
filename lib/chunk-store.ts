import { randomUUID } from "node:crypto";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { chunkChapterText } from "@/lib/chunking";
import { embedTexts } from "@/lib/embeddings";

export type ChapterForChunking = {
  /** Chapter row id (already persisted). */
  id: string;
  contentText: string;
};

// Rows per raw INSERT statement. Each row uses 10 bind params; Postgres caps a
// statement at 65535 params, so 500 rows (5000 params) stays well clear.
const INSERT_BATCH = 500;

/** Format a vector for pgvector's text input: `[0.1,0.2,...]`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Chunk every chapter, embed all chunks, and insert Chunk rows (with vectors)
 * for a book. Returns the number of chunks stored. Throws on embedding or DB
 * failure so the caller can roll back.
 */
export async function chunkEmbedAndStore(
  bookId: string,
  chapters: ChapterForChunking[],
): Promise<number> {
  // 1. Chunk every chapter, assigning a book-level index across all chapters
  //    (chapterChunkIndex is the per-chapter index from the chunker).
  const rows: {
    id: string;
    chapterId: string;
    chunkIndex: number;
    chapterChunkIndex: number;
    text: string;
    tokenCount: number;
    charStart: number;
    charEnd: number;
  }[] = [];

  let bookChunkIndex = 0;
  for (const chapter of chapters) {
    for (const chunk of chunkChapterText(chapter.contentText)) {
      rows.push({
        id: randomUUID(),
        chapterId: chapter.id,
        chunkIndex: bookChunkIndex++,
        chapterChunkIndex: chunk.chunkIndex,
        text: chunk.text,
        tokenCount: chunk.estimatedTokens,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
      });
    }
  }
  if (rows.length === 0) return 0;

  // 2. Embed all chunk texts (batched inside embedTexts), preserving order.
  const vectors = await embedTexts(rows.map((r) => r.text));

  // 3. Insert rows + vectors. Prisma can't write the `Unsupported` pgvector
  //    column through its model API, so use parameterized SQL fragments,
  //    batched inside one transaction.
  await prisma.$transaction(async (tx) => {
    for (let start = 0; start < rows.length; start += INSERT_BATCH) {
      const batch = rows.slice(start, start + INSERT_BATCH);
      const values = batch.map((r, i) => Prisma.sql`(
        ${r.id}::uuid,
        ${bookId}::uuid,
        ${r.chapterId}::uuid,
        ${r.chunkIndex},
        ${r.chapterChunkIndex},
        ${r.text},
        ${r.tokenCount},
        ${r.charStart},
        ${r.charEnd},
        ${toVectorLiteral(vectors[start + i])}::vector
      )`);

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "Chunk" (
          id,
          "bookId",
          "chapterId",
          "chunkIndex",
          "chapterChunkIndex",
          text,
          "tokenCount",
          "charStart",
          "charEnd",
          embedding
        ) VALUES ${Prisma.join(values)}
      `);
    }
  });

  return rows.length;
}
