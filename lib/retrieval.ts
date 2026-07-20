import { prisma } from "@/lib/prisma";

/** Default number of chunks to retrieve for a question. The notes' Phase 4
 *  sketch uses LIMIT 5; this is the dial the eval harness (Phase 5, E1) tunes. */
export const DEFAULT_TOP_K = 5;

/** One chunk returned by similarity search, with the fields the prompt builder
 *  and citation writer need. `distance` is pgvector cosine distance (0 = identical,
 *  2 = opposite); smaller is more similar. */
export type RetrievedChunk = {
  id: string;
  chapterId: string;
  chapterTitle: string | null;
  chapterIndex: number;
  chunkIndex: number;
  chapterChunkIndex: number;
  text: string;
  distance: number;
};

/** Format a vector for pgvector's text input: `[0.1,0.2,...]`. Mirrors the
 *  writer in chunk-store.ts — kept local so read/write stay independent. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Retrieve the top-`k` chunks of a book most similar to `queryVector`, using the
 * HNSW cosine index (`<=>`). Scoped to `bookId` so one book's search never
 * bleeds into another's. Results are ordered nearest-first.
 *
 * The `embedding` column is `Unsupported(...)` in Prisma, so this uses a raw
 * query; `bookId` and the vector are passed as bind params (never interpolated).
 */
export async function retrieveChunks(
  bookId: string,
  queryVector: number[],
  k: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  const vectorLiteral = toVectorLiteral(queryVector);

  // The same `$1::vector` param is referenced in both SELECT and ORDER BY so the
  // planner can use the HNSW index for the ordering.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      chapterId: string;
      chapterTitle: string | null;
      chapterIndex: number;
      chunkIndex: number;
      chapterChunkIndex: number;
      text: string;
      distance: number;
    }>
  >(
    `SELECT c.id,
            c."chapterId"          AS "chapterId",
            ch.title               AS "chapterTitle",
            ch."chapterIndex"      AS "chapterIndex",
            c."chunkIndex"         AS "chunkIndex",
            c."chapterChunkIndex"  AS "chapterChunkIndex",
            c.text,
            (c.embedding <=> $1::vector) AS distance
     FROM "Chunk" c
     JOIN "Chapter" ch ON ch.id = c."chapterId"
     WHERE c."bookId" = $2::uuid
     ORDER BY c.embedding <=> $1::vector
     LIMIT $3`,
    vectorLiteral,
    bookId,
    k,
  );

  // Postgres `double precision` can arrive as a string via the driver; coerce
  // distance to a number so callers get a consistent numeric type.
  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}
