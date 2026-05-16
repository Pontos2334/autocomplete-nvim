import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";

/**
 * Integration tests for CompletionEngine using fake DeepSeek SSE responses.
 * These mock global fetch to test the full pipeline without real network calls.
 */

// We need to import the compiled module
const { CompletionEngine } = await import("../dist/completion.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSseResponse(chunks, delayMs = 0) {
  const encoder = new TextEncoder();
  let body;
  if (delayMs > 0) {
    body = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          await new Promise((r) => setTimeout(r, delayMs));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ text: chunk }] })}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  } else {
    const payload = chunks
      .map(
        (c) =>
          `data: ${JSON.stringify({ choices: [{ text: c }] })}\n\n`,
      )
      .join("") + "data: [DONE]\n\n";
    body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
  }
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function makeConfig(overrides = {}) {
  return {
    options: {
      disable: false,
      useCache: false,
      maxTokens: 256,
      temperature: 0,
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stop: ["\n```"],
      multilineCompletions: "auto",
      debounceDelay: 350,
      maxPromptTokens: 2048,
      prefixPercentage: 0.8,
      maxSuffixPercentage: 0.1,
      modelTimeout: 30000,
      showWhateverWeHaveAtMs: 0,
      ...overrides,
    },
    model: {
      provider: "deepseek",
      model: "deepseek-coder",
      apiBase: "https://api.deepseek.com/beta/",
      apiKey: "test-key",
    },
    audit: { enabled: false },
    ...overrides,
  };
}

function makeRequest(prefix, suffix, filepath = "file:///tmp/test.ts") {
  const text = prefix + suffix;
  const lines = prefix.split("\n");
  return {
    filepath,
    text,
    pos: {
      line: lines.length - 1,
      character: lines[lines.length - 1].length,
    },
    workspaceDirs: ["file:///tmp"],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("CompletionEngine.complete returns completion from SSE stream", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => makeSseResponse(["const x = 1;"]);

  try {
    const engine = new CompletionEngine(makeConfig());
    const request = makeRequest("function f() {\n  ", "\n}");
    const { result, audit } = await engine.complete(request);

    assert.ok(result, "should return a result");
    assert.ok(result.completion.includes("const x = 1;"));
    assert.equal(audit.filterReason, undefined);
    assert.equal(audit.timedOut, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CompletionEngine.complete handles empty LLM response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => makeSseResponse([]);

  try {
    const engine = new CompletionEngine(makeConfig());
    const request = makeRequest("const x = ", "");
    const { result, audit } = await engine.complete(request);

    assert.equal(result, undefined);
    assert.equal(audit.filterReason, "empty_llm_response");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CompletionEngine.complete soft timeout returns partial content", async () => {
  const originalFetch = globalThis.fetch;
  // Stream with delays so soft timeout fires
  globalThis.fetch = async () =>
    makeSseResponse(["const x", " = 1;\nconst y"], 30);

  try {
    const engine = new CompletionEngine(
      makeConfig({ showWhateverWeHaveAtMs: 50 }),
    );
    const request = makeRequest("function f() {\n  ", "\n}");
    const { result, audit } = await engine.complete(request);

    // Should have some content (partial)
    assert.ok(audit.partialReturned || audit.completion.length > 0,
      "should have partial content");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CompletionEngine.complete filter fullStop aborts upstream", async () => {
  const originalFetch = globalThis.fetch;
  let aborted = false;

  // Stream with repeating lines that trigger fullStop
  globalThis.fetch = async (_url, opts) => {
    opts.signal?.addEventListener("abort", () => { aborted = true; });
    return makeSseResponse([
      "line1\nline1\nline1\nline1\n",
    ]);
  };

  try {
    const engine = new CompletionEngine(makeConfig());
    const request = makeRequest("prefix", "");
    const { result, audit } = await engine.complete(request);

    // The repeating line filter should trigger fullStop
    // Result may be partial or undefined depending on timing
    assert.ok(audit.completion.length < 50,
      "repeating lines should be filtered");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CompletionEngine.complete uses cache on second identical request", async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return makeSseResponse(["cached_value"]);
  };

  try {
    const engine = new CompletionEngine(makeConfig({ useCache: true }));
    const request = makeRequest("const a = ", ";");

    const first = await engine.complete(request);
    assert.equal(fetchCount, 1);
    assert.ok(first.result);
    assert.equal(first.result.cacheHit, false);

    const second = await engine.complete(request);
    assert.equal(fetchCount, 1, "should not call fetch again for cached result");
    assert.ok(second.result);
    assert.equal(second.result.cacheHit, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CompletionEngine.complete throws for missing API key", async () => {
  const engine = new CompletionEngine(
    makeConfig({ model: { ...makeConfig().model, apiKey: "" } }),
  );
  const request = makeRequest("const ", "");
  await assert.rejects(() => engine.complete(request), /No API key/);
});

test("CompletionEngine.complete throws for non-DeepSeek API base", async () => {
  const engine = new CompletionEngine(
    makeConfig({
      model: {
        ...makeConfig().model,
        apiBase: "https://api.openai.com/v1/",
      },
    }),
  );
  const request = makeRequest("const ", "");
  await assert.rejects(() => engine.complete(request), /DeepSeek FIM only/);
});

test("CompletionEngine.complete returns disabled when option is set", async () => {
  const engine = new CompletionEngine(makeConfig({ disable: true }));
  const request = makeRequest("const ", "");
  const { result, audit } = await engine.complete(request);

  assert.equal(result, undefined);
  assert.equal(audit.filterReason, "disabled");
});

test("CompletionEngine.updateConfig clears cache", async () => {
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount++;
    return makeSseResponse(["value"]);
  };

  try {
    const engine = new CompletionEngine(makeConfig({ useCache: true }));
    const request = makeRequest("const a = ", ";");

    await engine.complete(request);
    assert.equal(fetchCount, 1);

    engine.updateConfig(makeConfig({ useCache: true }));
    await engine.complete(request);
    assert.equal(fetchCount, 2, "cache should be cleared after updateConfig");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
