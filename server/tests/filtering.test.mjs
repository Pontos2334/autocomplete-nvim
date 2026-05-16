import test from "node:test";
import assert from "node:assert/strict";
import {
  stopAtStopTokens,
  stopAtStartOfSuffix,
} from "../dist/filtering/charStream.js";
import {
  streamLines,
  stopAtRepeatingLines,
  skipPrefixes,
  noDoubleNewLine,
  stopAtSimilarLine,
  streamWithNewLines,
} from "../dist/filtering/lineStream.js";
import { runFilterPipeline } from "../dist/filtering/StreamTransformPipeline.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* chunks(items) {
  for (const item of items) yield item;
}

async function collect(gen) {
  const out = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
}

async function collectChars(gen) {
  return (await collect(gen)).join("");
}

// ---------------------------------------------------------------------------
// charStream: stopAtStopTokens
// ---------------------------------------------------------------------------

test("stopAtStopTokens yields all chunks when no stop tokens", async () => {
  const result = await collectChars(stopAtStopTokens(chunks(["abc", "def"]), []));
  assert.equal(result, "abcdef");
});

test("stopAtStopTokens truncates at stop token within a chunk", async () => {
  const result = await collectChars(
    stopAtStopTokens(chunks(["hello\n```world"]), ["\n```"]),
  );
  assert.equal(result, "hello");
});

test("stopAtStopTokens handles stop token split across chunks", async () => {
  const result = await collectChars(
    stopAtStopTokens(chunks(["hello\n", "```world"]), ["\n```"]),
  );
  assert.equal(result, "hello");
});

test("stopAtStopTokens handles stop token at chunk boundary edge", async () => {
  const result = await collectChars(
    stopAtStopTokens(chunks(["abc", "def", "ghi"]), ["def"]),
  );
  assert.equal(result, "abc");
});

test("stopAtStopTokens yields everything when stop token never appears", async () => {
  const result = await collectChars(
    stopAtStopTokens(chunks(["foo", "bar", "baz"]), ["xyz"]),
  );
  assert.equal(result, "foobarbaz");
});

// ---------------------------------------------------------------------------
// charStream: stopAtStartOfSuffix
// ---------------------------------------------------------------------------

test("stopAtStartOfSuffix yields all when suffix is empty", async () => {
  const result = await collectChars(stopAtStartOfSuffix(chunks(["abc"]), ""));
  assert.equal(result, "abc");
});

test("stopAtStartOfSuffix stops when stream matches suffix start", async () => {
  // suffix is long enough for checkLength to catch the match in the while loop
  const suffix = "This is the suffix that follows the cursor position";
  const streamContent = "some code This is the suffix that follows";
  const result = await collectChars(
    stopAtStartOfSuffix(chunks([streamContent]), suffix),
  );
  assert.equal(result, "some code ");
});

test("stopAtStartOfSuffix handles suffix match split across chunks", async () => {
  const suffix = "suffix_start_of_the_long_suffix_match_continued_here";
  const result = await collectChars(
    stopAtStartOfSuffix(chunks(["ab", "suffix_start_of_the_long_suffix_match"]), suffix),
  );
  assert.equal(result, "ab");
});

test("stopAtStartOfSuffix yields all when no match", async () => {
  const result = await collectChars(
    stopAtStartOfSuffix(chunks(["hello world"]), "xyz"),
  );
  assert.equal(result, "hello world");
});

// ---------------------------------------------------------------------------
// lineStream: streamLines
// ---------------------------------------------------------------------------

test("streamLines splits characters into lines", async () => {
  const lines = await collect(streamLines(chunks(["a\nb\nc"])));
  assert.deepEqual(lines, ["a", "b", "c"]);
});

test("streamLines handles split newlines across chunks", async () => {
  const lines = await collect(streamLines(chunks(["hel", "lo\nwo", "rld"])));
  assert.deepEqual(lines, ["hello", "world"]);
});

test("streamLines yields final buffer as last line", async () => {
  const lines = await collect(streamLines(chunks(["a\nb"])));
  assert.deepEqual(lines, ["a", "b"]);
});

test("streamLines yields single line with no newlines", async () => {
  const lines = await collect(streamLines(chunks(["no newline"])));
  assert.deepEqual(lines, ["no newline"]);
});

// ---------------------------------------------------------------------------
// lineStream: stopAtRepeatingLines
// ---------------------------------------------------------------------------

test("stopAtRepeatingLines stops after 3 identical consecutive lines", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["aaa\naaa\naaa\nbbb"]));
  const lines = await collect(stopAtRepeatingLines(input, fullStop));
  assert.deepEqual(lines, ["aaa"]);
  assert.equal(stopped, true);
});

test("stopAtRepeatingLines passes through non-repeating lines", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["a\nb\nc\nd"]));
  const lines = await collect(stopAtRepeatingLines(input, fullStop));
  assert.deepEqual(lines, ["a", "b", "c", "d"]);
  assert.equal(stopped, false);
});

test("stopAtRepeatingLines handles exactly 2 repeats (does not stop, yields all)", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["x\nx\ndifferent"]));
  const lines = await collect(stopAtRepeatingLines(input, fullStop));
  // 2 repeats = repeatCount 2, which is < MAX_REPEATS (3), so lines pass through
  assert.deepEqual(lines, ["x", "different"]);
  assert.equal(stopped, false);
});

// ---------------------------------------------------------------------------
// lineStream: skipPrefixes
// ---------------------------------------------------------------------------

test("skipPrefixes removes <COMPLETION> from first line", async () => {
  const input = streamLines(chunks(["<COMPLETION>const x = 1;\nconst y = 2;"]));
  const lines = await collect(skipPrefixes(input));
  assert.deepEqual(lines, ["const x = 1;", "const y = 2;"]);
});

test("skipPrefixes does not affect later lines", async () => {
  const input = streamLines(chunks(["const x = 1;\n<COMPLETION>y"]));
  const lines = await collect(skipPrefixes(input));
  assert.deepEqual(lines, ["const x = 1;", "<COMPLETION>y"]);
});

test("skipPrefixes passes through lines without prefix", async () => {
  const input = streamLines(chunks(["hello\nworld"]));
  const lines = await collect(skipPrefixes(input));
  assert.deepEqual(lines, ["hello", "world"]);
});

// ---------------------------------------------------------------------------
// lineStream: noDoubleNewLine
// ---------------------------------------------------------------------------

test("noDoubleNewLine stops at blank line after content", async () => {
  const input = streamLines(chunks(["code here\n\nmore stuff"]));
  const lines = await collect(noDoubleNewLine(input));
  assert.deepEqual(lines, ["code here"]);
});

test("noDoubleNewLine passes through lines with no blank lines", async () => {
  const input = streamLines(chunks(["a\nb\nc"]));
  const lines = await collect(noDoubleNewLine(input));
  assert.deepEqual(lines, ["a", "b", "c"]);
});

test("noDoubleNewLine allows leading blank lines before content", async () => {
  const input = streamLines(chunks(["\n\ncode"]));
  const lines = await collect(noDoubleNewLine(input));
  assert.deepEqual(lines, ["", "", "code"]);
});

// ---------------------------------------------------------------------------
// lineStream: stopAtSimilarLine
// ---------------------------------------------------------------------------

test("stopAtSimilarLine stops at exact match", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["new line\n  const x = 1;"]));
  const lines = await collect(stopAtSimilarLine(input, "  const x = 1;", fullStop));
  assert.deepEqual(lines, ["new line"]);
  assert.equal(stopped, true);
});

test("stopAtSimilarLine stops at similar line (>90% char match)", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["alpha\n  const abc = 12345;"]));
  const lines = await collect(stopAtSimilarLine(input, "  const abc = 12345;", fullStop));
  assert.deepEqual(lines, ["alpha"]);
  assert.equal(stopped, true);
});

test("stopAtSimilarLine yields all when reference is empty", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["a\nb\nc"]));
  const lines = await collect(stopAtSimilarLine(input, "", fullStop));
  assert.deepEqual(lines, ["a", "b", "c"]);
  assert.equal(stopped, false);
});

test("stopAtSimilarLine does not fuzzy-match short lines", async () => {
  let stopped = false;
  const fullStop = () => { stopped = true; };
  const input = streamLines(chunks(["abcde\nuvw"]));
  // "uvw" (3 chars) is too short for fuzzy matching, but lineIsRepeated checks both a and b
  const lines = await collect(stopAtSimilarLine(input, "xyz", fullStop));
  assert.deepEqual(lines, ["abcde", "uvw"]);
  assert.equal(stopped, false);
});

// ---------------------------------------------------------------------------
// lineStream: streamWithNewLines
// ---------------------------------------------------------------------------

test("streamWithNewLines rejoins lines with newline chars", async () => {
  async function* lineGen() {
    yield "hello";
    yield "world";
    yield "end";
  }
  const result = await collectChars(streamWithNewLines(lineGen()));
  assert.equal(result, "hello\nworld\nend");
});

test("streamWithNewLines handles single line", async () => {
  async function* lineGen() {
    yield "only";
  }
  const result = await collectChars(streamWithNewLines(lineGen()));
  assert.equal(result, "only");
});

// ---------------------------------------------------------------------------
// Full pipeline: runFilterPipeline
// ---------------------------------------------------------------------------

test("runFilterPipeline passes clean completion through", async () => {
  const ctx = {
    prefix: "const a = ",
    suffix: "\nconst b = 2;",
    stopTokens: [],
    lineBelowCursor: "const b = 2;",
    fullStop: () => {},
  };
  const result = await collectChars(
    runFilterPipeline(chunks(["x = 1"]), ctx),
  );
  assert.equal(result, "x = 1");
});

test("runFilterPipeline stops at stop token in stream", async () => {
  const ctx = {
    prefix: "code",
    suffix: "",
    stopTokens: ["\n```"],
    lineBelowCursor: "",
    fullStop: () => {},
  };
  const result = await collectChars(
    runFilterPipeline(chunks(["const x = 1;\n```typescript\nmore"]), ctx),
  );
  assert.equal(result, "const x = 1;");
});

test("runFilterPipeline stops at double blank line", async () => {
  const ctx = {
    prefix: "code",
    suffix: "",
    stopTokens: [],
    lineBelowCursor: "",
    fullStop: () => {},
  };
  const result = await collectChars(
    runFilterPipeline(chunks(["line1\nline2\n\nline3"]), ctx),
  );
  assert.equal(result, "line1\nline2");
});

test("runFilterPipeline removes <COMPLETION> prefix", async () => {
  const ctx = {
    prefix: "code",
    suffix: "",
    stopTokens: [],
    lineBelowCursor: "",
    fullStop: () => {},
  };
  const result = await collectChars(
    runFilterPipeline(chunks(["<COMPLETION>const x = 1;"]), ctx),
  );
  assert.equal(result, "const x = 1;");
});

test("runFilterPipeline stops at repeating lines and calls fullStop", async () => {
  let stopped = false;
  const ctx = {
    prefix: "code",
    suffix: "",
    stopTokens: [],
    lineBelowCursor: "",
    fullStop: () => { stopped = true; },
  };
  const result = await collectChars(
    runFilterPipeline(chunks(["aaa\naaa\naaa\nbbb"]), ctx),
  );
  assert.equal(result, "aaa");
  assert.equal(stopped, true);
});
