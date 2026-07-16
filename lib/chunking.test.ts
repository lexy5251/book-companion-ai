import assert from "node:assert/strict";
import test from "node:test";
import { chunkChapterText } from "./chunking.ts";

test("creates ordered, overlapping chunks with reconstructable offsets", () => {
  const sentence =
    "The mind adapts and converts to its own purposes the obstacle to our acting. ";
  const text = sentence.repeat(60).trim();
  const targetChars = 100 * 4;
  const chunks = chunkChapterText(text, {
    targetTokens: 100,
    overlapRatio: 0.2,
    charsPerToken: 4,
  });

  assert.ok(chunks.length > 1);
  chunks.forEach((chunk, index) => {
    assert.equal(chunk.chunkIndex, index);
    assert.equal(
      text.slice(chunk.charStart, chunk.charEnd).trim(),
      chunk.text,
    );
    assert.ok(chunk.text.length <= targetChars * 1.5);
    assert.equal(chunk.estimatedTokens, Math.ceil(chunk.text.length / 4));

    if (index > 0) {
      assert.ok(chunk.charStart > chunks[index - 1].charStart);
      assert.ok(chunk.charStart < chunks[index - 1].charEnd);
    }
  });
  assert.ok(chunks[0].charStart <= 5);
  assert.ok(chunks[chunks.length - 1].charEnd >= text.length - 5);
});

test("handles empty and short text", () => {
  assert.deepEqual(chunkChapterText("   "), []);
  const chunks = chunkChapterText("Just one short line.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, "Just one short line.");
});

test("bounds punctuation-free text", () => {
  const chunks = chunkChapterText("word ".repeat(2000).trim(), {
    targetTokens: 100,
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 100 * 4 * 1.2));
});

test("bounds a single token with no whitespace", () => {
  const chunks = chunkChapterText("x".repeat(5000), {
    targetTokens: 100,
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.text.length <= 100 * 4 * 1.2));
});

test("rejects invalid chunking options", () => {
  assert.throws(
    () => chunkChapterText("text", { targetTokens: 0 }),
    RangeError,
  );
  assert.throws(
    () => chunkChapterText("text", { overlapRatio: 1 }),
    RangeError,
  );
  assert.throws(
    () => chunkChapterText("text", { charsPerToken: 0 }),
    RangeError,
  );
  assert.throws(
    () =>
      chunkChapterText("text", { targetTokens: 0.1, charsPerToken: 1 }),
    RangeError,
  );
});
