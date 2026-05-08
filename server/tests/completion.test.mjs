import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import { constructPrefixSuffix, streamSse } from "../dist/completion.js";

const config = {
  options: {
    maxPromptTokens: 100,
    prefixPercentage: 0.5,
    maxSuffixPercentage: 0.2,
  },
};

test("constructPrefixSuffix splits text at UTF-16 position", () => {
  const result = constructPrefixSuffix(
    {
      filepath: "file:///tmp/app.ts",
      text: "const a = 1;\nconst b = 2;",
      pos: { line: 1, character: 6 },
      workspaceDirs: ["file:///tmp"],
    },
    config,
  );
  assert.equal(result.prefix, "const a = 1;\nconst ");
  assert.equal(result.suffix, "b = 2;");
});

test("constructPrefixSuffix includes context snippets", () => {
  const result = constructPrefixSuffix(
    {
      filepath: "file:///tmp/app.ts",
      text: "console.",
      pos: { line: 0, character: 8 },
      workspaceDirs: ["file:///tmp"],
      lspSnippets: [{ filepath: "file:///tmp/lib.ts", content: "export const value = 1;" }],
    },
    config,
  );
  assert.match(result.prunedPrefix, /related file: lib\.ts/);
  assert.match(result.prunedPrefix, /current file: app\.ts/);
});

test("streamSse parses split SSE frames", async () => {
  const encoder = new TextEncoder();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"text":"abc"}]}\n'));
        controller.enqueue(encoder.encode('\ndata: {"choices":[{"text":"def"}]}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }),
  );
  const chunks = [];
  for await (const event of streamSse(response)) {
    chunks.push(event.choices[0].text);
  }
  assert.deepEqual(chunks, ["abc", "def"]);
});
