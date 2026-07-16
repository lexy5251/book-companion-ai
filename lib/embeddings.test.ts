import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBEDDING_DIMENSIONS,
  embedTexts,
  type EmbeddingClient,
} from "./embeddings.ts";

function vector(marker = 0): number[] {
  const result = Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  result[0] = marker;
  return result;
}

test("returns no vectors or API calls for empty input", async () => {
  let called = false;
  const client: EmbeddingClient = {
    async create() {
      called = true;
      return { data: [] };
    },
  };

  assert.deepEqual(await embedTexts([], client), []);
  assert.equal(called, false);
});

test("batches inputs and restores response order", async () => {
  const batchSizes: number[] = [];
  const client: EmbeddingClient = {
    async create(params) {
      batchSizes.push(params.input.length);
      assert.equal(params.dimensions, EMBEDDING_DIMENSIONS);
      return {
        data: params.input
          .map((_, index) => ({ index, embedding: vector(index) }))
          .reverse(),
      };
    },
  };

  const vectors = await embedTexts(
    Array.from({ length: 450 }, (_, index) => `text ${index}`),
    client,
  );

  assert.deepEqual(batchSizes, [200, 200, 50]);
  assert.equal(vectors.length, 450);
  assert.equal(vectors[0][0], 0);
  assert.equal(vectors[199][0], 199);
  assert.equal(vectors[200][0], 0);
  assert.equal(vectors[449][0], 49);
});

test("rejects missing, malformed, and non-finite vectors", async () => {
  const missing: EmbeddingClient = {
    async create() {
      return { data: [] };
    },
  };
  await assert.rejects(() => embedTexts(["text"], missing));

  const wrongSize: EmbeddingClient = {
    async create() {
      return { data: [{ index: 0, embedding: [1, 2, 3] }] };
    },
  };
  await assert.rejects(() => embedTexts(["text"], wrongSize));

  const nonFinite: EmbeddingClient = {
    async create() {
      const embedding = vector();
      embedding[10] = Number.NaN;
      return { data: [{ index: 0, embedding }] };
    },
  };
  await assert.rejects(() => embedTexts(["text"], nonFinite));
});
