import test from "node:test";
import assert from "node:assert/strict";
import { ListenableGenerator } from "../dist/generation/ListenableGenerator.js";
import { GeneratorReuseManager } from "../dist/generation/GeneratorReuseManager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an async generator that yields the given chunks with optional delays. */
async function* chunkGenerator(chunks, delayMs = 0) {
  for (const chunk of chunks) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    yield chunk;
  }
}

/** Collect all chunks from an async generator into an array. */
async function collect(gen) {
  const out = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

// ---------------------------------------------------------------------------
// ListenableGenerator
// ---------------------------------------------------------------------------

test("ListenableGenerator tee() sees all chunks from the beginning", async () => {
  const raw = chunkGenerator(["a", "b", "c"]);
  const lg = new ListenableGenerator(raw);
  const tee = lg.tee();
  const chunks = await collect(tee);
  assert.deepEqual(chunks, ["a", "b", "c"]);
});

test("ListenableGenerator multiple tee() consumers each get all subsequent chunks", async () => {
  const raw = chunkGenerator(["x", "y", "z"], 5);
  const lg = new ListenableGenerator(raw);

  // First tee starts before any chunks arrive
  const tee1 = lg.tee();
  // Small delay so tee1 registers, then tee2 starts after first chunk might arrive
  await new Promise((r) => setTimeout(r, 8));
  const tee2 = lg.tee();

  const [result1, result2] = await Promise.all([
    collect(tee1),
    collect(tee2),
  ]);
  assert.deepEqual(result1, ["x", "y", "z"]);
  assert.deepEqual(result2, ["y", "z"]);
});

test("ListenableGenerator tee() created mid-stream gets remaining chunks", async () => {
  const raw = chunkGenerator(["aa", "bb", "cc"], 10);
  const lg = new ListenableGenerator(raw);

  // Consume first chunk via direct tee
  const earlyTee = lg.tee();
  const earlyIter = earlyTee[Symbol.asyncIterator]();
  await earlyIter.next(); // "aa"

  // Now create a new tee — it should start from current buffer position
  const lateTee = lg.tee();
  const lateResult = await collect(lateTee);
  // lateTee starts from index = buffer.length at creation time (after "aa" was pushed)
  assert.ok(lateResult.includes("bb"));
  assert.ok(lateResult.includes("cc"));
  // Should NOT include "aa" because tee starts from current buffer end
  assert.ok(!lateResult.includes("aa"));
});

test("ListenableGenerator cancel() stops all tees", async () => {
  const raw = chunkGenerator(["a", "b", "c"], 20);
  const lg = new ListenableGenerator(raw);
  const tee = lg.tee();

  // Cancel after a short delay
  setTimeout(() => lg.cancel(), 15);

  const chunks = await collect(tee);
  // Should have at most "a" (or nothing if cancel was fast enough)
  assert.ok(chunks.length <= 1);
});

test("ListenableGenerator isDone() reports true after generator finishes", async () => {
  const raw = chunkGenerator(["only"]);
  const lg = new ListenableGenerator(raw);
  assert.equal(lg.isDone(), false);
  // Consume fully
  await collect(lg.tee());
  assert.equal(lg.isDone(), true);
});

test("ListenableGenerator propagates errors from source generator", async () => {
  async function* failGen() {
    yield "before";
    throw new Error("boom");
  }
  const lg = new ListenableGenerator(failGen());
  const tee = lg.tee();
  await assert.rejects(() => collect(tee), { message: "boom" });
});

// ---------------------------------------------------------------------------
// GeneratorReuseManager
// ---------------------------------------------------------------------------

test("GeneratorReuseManager creates new generator when no active", async () => {
  const mgr = new GeneratorReuseManager();
  const gen = mgr.getGenerator("prefix", "suffix", "file.ts", () =>
    chunkGenerator(["hello"]),
  );
  const chunks = await collect(gen);
  assert.deepEqual(chunks, ["hello"]);
});

test("GeneratorReuseManager reuses when newPrefix extends originalPrefix + accumulated", async () => {
  const mgr = new GeneratorReuseManager();

  // Start first request with prefix "const "
  const raw = chunkGenerator(["x = 1;", " // comment"], 10);
  const gen1 = mgr.getGenerator("const ", "suffix", "file.ts", () => raw);

  // Let it accumulate some chunks
  const iter1 = gen1[Symbol.asyncIterator]();
  const first = await iter1.next(); // "x = 1;"
  assert.equal(first.value, "x = 1;");

  // Now user types more — prefix is now "const x"
  const gen2 = mgr.getGenerator("const x", "suffix", "file.ts", () =>
    chunkGenerator(["should not appear"]),
  );
  const info = mgr.getLastReuseInfo();
  assert.equal(info.reuseHit, true);
  assert.equal(info.reuseReason, "prefix_match");

  const chunks2 = await collect(gen2);
  // Reuse should skip "x" (already typed), yield "= 1;" then " // comment"
  const joined = chunks2.join("");
  assert.ok(joined.includes("= 1;"));
  assert.ok(joined.includes(" // comment"));
  // Should NOT include text from the rejected new generator
  assert.ok(!joined.includes("should not appear"));
});

test("GeneratorReuseManager exposes miss reasons", async () => {
  const mgr = new GeneratorReuseManager();
  const raw = chunkGenerator(["hello", "later"], 20);
  const gen1 = mgr.getGenerator("prefix", "suffix", "file.ts", () => raw);
  const iter1 = gen1[Symbol.asyncIterator]();
  await iter1.next();

  mgr.getGenerator("prefixx", "changed", "file.ts", () => chunkGenerator(["new"]));
  let info = mgr.getLastReuseInfo();
  assert.equal(info.reuseHit, false);
  assert.equal(info.reuseReason, "suffix_changed");

  mgr.getGenerator("prefix", "suffix", "other.ts", () => chunkGenerator(["new"]));
  info = mgr.getLastReuseInfo();
  assert.equal(info.reuseHit, false);
  assert.equal(info.reuseReason, "filepath_changed");

  await mgr.cancelActive();
});

test("GeneratorReuseManager cancelLease does not cancel newer reused lease", async () => {
  const mgr = new GeneratorReuseManager();
  const raw = chunkGenerator(["x = 1;", " // ok"], 10);
  const gen1 = mgr.getGenerator("const ", "suffix", "file.ts", () => raw);
  const iter1 = gen1[Symbol.asyncIterator]();
  await iter1.next();

  const oldLease = mgr.getLastReuseInfo().leaseId;
  const gen2 = mgr.getGenerator("const x", "suffix", "file.ts", () =>
    chunkGenerator(["should not appear"]),
  );
  await mgr.cancelLease(oldLease);

  const chunks2 = await collect(gen2);
  assert.ok(chunks2.join("").includes("= 1;"));
});

test("GeneratorReuseManager does not reuse when prefix is shorter (backspace)", async () => {
  const mgr = new GeneratorReuseManager();

  // Start with long prefix
  const raw = chunkGenerator(["hello"], 5);
  const gen1 = mgr.getGenerator("const abc", "suffix", "file.ts", () => raw);
  // Consume it
  await collect(gen1);

  // Now prefix is shorter (user backspaced)
  const newRaw = chunkGenerator(["world"]);
  const gen2 = mgr.getGenerator("const ab", "suffix", "file.ts", () => newRaw);
  const chunks = await collect(gen2);
  assert.deepEqual(chunks, ["world"]);
});

test("GeneratorReuseManager does not reuse when suffix differs", async () => {
  const mgr = new GeneratorReuseManager();

  const raw = chunkGenerator(["hello"], 5);
  const gen1 = mgr.getGenerator("prefix", "suffix1", "file.ts", () => raw);
  await collect(gen1);

  const newRaw = chunkGenerator(["world"]);
  const gen2 = mgr.getGenerator("prefixx", "suffix2", "file.ts", () => newRaw);
  const chunks = await collect(gen2);
  assert.deepEqual(chunks, ["world"]);
});

test("GeneratorReuseManager does not reuse when filepath differs", async () => {
  const mgr = new GeneratorReuseManager();

  const raw = chunkGenerator(["hello"], 5);
  const gen1 = mgr.getGenerator("prefix", "suffix", "a.ts", () => raw);
  await collect(gen1);

  const newRaw = chunkGenerator(["world"]);
  const gen2 = mgr.getGenerator("prefixx", "suffix", "b.ts", () => newRaw);
  const chunks = await collect(gen2);
  assert.deepEqual(chunks, ["world"]);
});

test("GeneratorReuseManager cancelActive stops the active generator", async () => {
  const mgr = new GeneratorReuseManager();

  const raw = chunkGenerator(["a", "b", "c"], 50);
  const gen = mgr.getGenerator("p", "s", "f.ts", () => raw);

  const iter = gen[Symbol.asyncIterator]();
  await iter.next(); // "a"

  await mgr.cancelActive();

  // The generator should stop — may yield at most one buffered chunk after cancel
  const all = [];
  for (;;) {
    const r = await iter.next();
    if (r.done) break;
    all.push(r.value);
  }
  // After cancel, we should not see "c" (the third chunk)
  assert.ok(!all.includes("c"), "should not see chunk from after cancel");
});

test("GeneratorReuseManager handles first chunk arriving synchronously", async () => {
  const mgr = new GeneratorReuseManager();

  // No delay — chunks arrive instantly
  const raw = chunkGenerator(["instant", "second"]);
  const gen = mgr.getGenerator("p", "s", "f.ts", () => raw);
  const chunks = await collect(gen);
  assert.deepEqual(chunks, ["instant", "second"]);
});
