import OpenAI from "openai";

// Embedding model for the RAG pipeline. 1536 dims — matches the
// `Chunk.embedding vector(1536)` column in the Prisma schema.
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

// Chunks per embedding request. The API accepts up to 2048 inputs (plus a
// total-token cap per request). ~500-token chunks × 200 ≈ 100k tokens/request
// — well within limits, and fewer round-trips. Smaller batches make retries on
// failure cheaper, so this is a safe middle ground; tune freely.
const MAX_BATCH = 200;

type EmbeddingResult = {
  index: number;
  embedding: number[];
};

export type EmbeddingClient = {
  create(params: {
    model: string;
    input: string[];
    dimensions: number;
  }): Promise<{ data: EmbeddingResult[] }>;
};

function createEmbeddingClient(): EmbeddingClient {
  const openai = new OpenAI(); // reads OPENAI_API_KEY from the environment
  return {
    create: (params) => openai.embeddings.create(params),
  };
}

/**
 * Embed an array of texts, returning one 1536-dim vector per input in the same
 * order. Batches requests; throws on API failure (after the SDK's built-in
 * retries) so the caller can decide how to recover.
 */
export async function embedTexts(
  texts: string[],
  client?: EmbeddingClient,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const embeddings = client ?? createEmbeddingClient();
  const vectors: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const response = await embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    // `data` mirrors the input order, but each item carries an `index`; sort by
    // it to be certain vectors line up with their source texts.
    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new Error(
        `Embedding API returned ${ordered.length} vectors for ${batch.length} inputs`,
      );
    }

    ordered.forEach((item, index) => {
      if (item.index !== index) {
        throw new Error(`Embedding API response is missing input index ${index}`);
      }
      if (
        item.embedding.length !== EMBEDDING_DIMENSIONS ||
        !item.embedding.every(Number.isFinite)
      ) {
        throw new Error(
          `Embedding API returned an invalid vector for input index ${index}`,
        );
      }
      vectors.push(item.embedding);
    });
  }

  return vectors;
}
