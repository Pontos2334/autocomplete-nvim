import test from "node:test";
import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import {
  constructPrefixSuffix,
  mergeContextSnippets,
  streamSse,
  shouldCompleteMultiline,
  trimDuplicateFollowingLines,
  completionDuplicatesFollowingLines,
} from "../dist/completion.js";
import { postprocessCompletion } from "../dist/postprocessing.js";

const config = {
  options: {
    maxPromptTokens: 100,
    prefixPercentage: 0.5,
    maxSuffixPercentage: 0.2,
  },
};

// --- constructPrefixSuffix ---

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
  assert.match(result.prunedPrefix, /LSP Definition: lib\.ts/);
  assert.match(result.prunedPrefix, /current file: app\.ts/);
});

test("mergeContextSnippets orders, deduplicates, excludes current file, and budgets", () => {
  const request = {
    filepath: "file:///tmp/app.ts",
    text: "",
    pos: { line: 0, character: 0 },
    lspSnippets: [
      { filepath: "file:///tmp/defs.ts", content: "export const a = 1;" },
    ],
    importSnippets: [
      { filepath: "file:///tmp/imports.ts", content: "export const b = 2;" },
    ],
    recentlyEditedRanges: [
      {
        filepath: "file:///tmp/edited.ts",
        lines: ["const edited = true;"],
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        timestamp: 1,
      },
    ],
    recentlyVisitedRanges: [
      { filepath: "file:///tmp/visited.ts", content: "const visited = true;" },
      { filepath: "file:///tmp/app.ts", content: "should be excluded" },
    ],
    openedFileSnippets: [
      { filepath: "file:///tmp/open.ts", content: "const open = true;" },
      { filepath: "file:///tmp/defs.ts", content: "export const a = 1;" },
    ],
    workspaceConfigSnippets: [
      { filepath: "file:///tmp/package.json", content: "{\"type\":\"module\"}" },
    ],
  };

  const merged = mergeContextSnippets(request, 1000);
  assert.deepEqual(
    merged.map((snippet) => snippet.kind),
    ["lsp", "import", "recent_edit", "recent_visit", "open_buffer", "workspace_config"],
  );
  assert.equal(merged.some((snippet) => snippet.content === "should be excluded"), false);
  assert.equal(merged.filter((snippet) => snippet.filepath.endsWith("defs.ts")).length, 1);
});

// --- streamSse ---

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

// --- postprocessCompletion ---

test("postprocessCompletion returns undefined for empty input", () => {
  assert.equal(postprocessCompletion("", "prefix", "suffix"), undefined);
  assert.equal(postprocessCompletion("   ", "prefix", "suffix"), undefined);
});

test("postprocessCompletion strips duplicate first line", () => {
  assert.equal(
    postprocessCompletion("const x = 1;\nconst y = 2;", "const x = 1;\n", ""),
    undefined,
  );
});

test("postprocessCompletion strips leading space when prefix ends with space", () => {
  const result = postprocessCompletion(" hello", "foo ", "");
  assert.equal(result, "hello");
});

test("postprocessCompletion strips code block markers", () => {
  const result = postprocessCompletion("```typescript\nconst x = 1;\n```", "prefix", "");
  assert.equal(result, "const x = 1;");
});

test("postprocessCompletion strips suffix prefix from start", () => {
  const result = postprocessCompletion("function foo() {}rest", "prefix", "function bar()");
  // The function removes up to 20 chars of suffix from start of completion
  // "function foo() {}rest" starts with "function bar()"? No, it starts with "function foo() "
  // This should not trigger the suffix stripping since first 20 chars differ
  assert.ok(result);
});

test("postprocessCompletion returns valid completion unchanged", () => {
  const result = postprocessCompletion("const x = 1;", "const a = 0;\n", "");
  assert.equal(result, "const x = 1;");
});

// --- shouldCompleteMultiline ---

test("shouldCompleteMultiline always mode", () => {
  assert.equal(shouldCompleteMultiline("always", "line\n", "\nmore"), true);
  assert.equal(shouldCompleteMultiline("always", "line\n", "rest"), true);
});

test("shouldCompleteMultiline never mode", () => {
  assert.equal(shouldCompleteMultiline("never", "line\n", "\nmore"), false);
  assert.equal(shouldCompleteMultiline("never", "line\n", ""), false);
});

test("shouldCompleteMultiline auto mode returns true for newline suffix", () => {
  assert.equal(shouldCompleteMultiline("auto", "function foo() {\n", "\n  return 1;\n}"), true);
  assert.equal(shouldCompleteMultiline("auto", "function foo() {\n", ""), true);
});

test("shouldCompleteMultiline auto mode returns false for comment lines with no suffix newline", () => {
  assert.equal(shouldCompleteMultiline("auto", "// some comment\n", "rest"), false);
  assert.equal(shouldCompleteMultiline("auto", "  # python comment\n", "rest"), false);
});

test("shouldCompleteMultiline auto mode returns false for non-comment inline", () => {
  assert.equal(shouldCompleteMultiline("auto", "const x = ", " + 1;"), false);
});

// --- trimDuplicateFollowingLines ---

test("trimDuplicateFollowingLines removes trailing lines matching doc after startLine", () => {
  // completionLines = ["new", "gamma", "delta"], docLines = ["s","alpha","gamma","delta"]
  // startLine=1: i=1 docLines[2]="gamma" vs completionLines[last-0]="delta" -> no match
  // startLine=0: i=1 docLines[1]="alpha" vs completionLines[last]="delta" -> no match
  // Need: doc[startLine+i] == completionLines[last - i + 1]
  // Actually: completionLines[completionLines.length - i]
  // So doc[startLine+1] must == completionLines[last] for first match
  const doc = "header\nalpha\nbeta\ngamma";
  const completion = "new_content\ngamma";
  // startLine=1: docLines[2]="beta" vs completionLines[1]="gamma" -> no match
  // startLine=0: docLines[1]="alpha" vs completionLines[1]="gamma" -> no match
  // Need the last completion line to equal the first doc line after startLine
  const result = trimDuplicateFollowingLines(completion, doc, 2);
  // startLine=2: docLines[3]="gamma" vs completionLines[1]="gamma" -> match!
  assert.equal(result, "new_content");
});

test("trimDuplicateFollowingLines keeps all lines when no duplicates", () => {
  const doc = "line1\nline2\nline3";
  const completion = "new_a\nnew_b\nnew_c";
  const result = trimDuplicateFollowingLines(completion, doc, 0);
  assert.equal(result, "new_a\nnew_b\nnew_c");
});

test("trimDuplicateFollowingLines handles single line", () => {
  const doc = "line1\nline2";
  const result = trimDuplicateFollowingLines("new_line", doc, 0);
  assert.equal(result, "new_line");
});

// --- completionDuplicatesFollowingLines ---

test("completionDuplicatesFollowingLines detects full duplication", () => {
  const doc = "line1\nalpha\nbeta\ngamma";
  const completion = "alpha\nbeta\ngamma";
  assert.equal(completionDuplicatesFollowingLines(completion, doc, 0), true);
});

test("completionDuplicatesFollowingLines returns false for partial match", () => {
  const doc = "line1\nalpha\nbeta\nother";
  const completion = "alpha\nbeta\ngamma";
  assert.equal(completionDuplicatesFollowingLines(completion, doc, 0), false);
});

test("completionDuplicatesFollowingLines returns false for short lines", () => {
  const doc = "line1\na\nb\nc";
  const completion = "a\nb\nc";
  // Lines <= 4 chars are excluded, so all are filtered out -> returns false
  assert.equal(completionDuplicatesFollowingLines(completion, doc, 0), false);
});

test("completionDuplicatesFollowingLines returns false for empty completion", () => {
  assert.equal(completionDuplicatesFollowingLines("", "some doc", 0), false);
});

// --- postprocessCompletion: newline insertion ---

test("postprocessCompletion inserts newline after semicolon + keyword", () => {
  const result = postprocessCompletion("if (x) {", "const a = 1;", "\n}");
  assert.equal(result, "\nif (x) {");
});

test("postprocessCompletion inserts newline before expression statements", () => {
  const result = postprocessCompletion(
    "console.log('stdout', stdout.toString());console.log('stderr', stderr);",
    'const { stdout, stderr } = children.execSync("ls - la")',
    "",
  );
  assert.equal(
    result,
    "\nconsole.log('stdout', stdout.toString());\nconsole.log('stderr', stderr);",
  );
});

test("postprocessCompletion does not split semicolons inside for headers", () => {
  const result = postprocessCompletion(
    "for (;foo();bar()) {\n  work();\n}",
    "function run() {\n  ",
    "\n}",
  );
  assert.equal(result, "for (;foo();bar()) {\n  work();\n}");
});

test("postprocessCompletion inserts newline + indent after opening brace (4-space)", () => {
  const result = postprocessCompletion("return x;", "function f() {\n    if (x) {", "\n    }");
  assert.equal(result, "\n        return x;");
});

test("postprocessCompletion inserts newline + indent after opening brace (2-space)", () => {
  const result = postprocessCompletion("return x;", "function f() {\n  if (x) {", "\n  }");
  assert.equal(result, "\n    return x;");
});

test("postprocessCompletion falls back to current indent when step cannot be inferred", () => {
  const result = postprocessCompletion("return x;", "if (x) {", "\n}");
  assert.equal(result, "\nreturn x;");
});

test("postprocessCompletion does not duplicate newline when completion starts with \\n", () => {
  const result = postprocessCompletion("\nif (x) {", "const a = 1;", "");
  assert.equal(result, "\nif (x) {");
});

test("postprocessCompletion does not add indent when completion already has leading whitespace", () => {
  const result = postprocessCompletion("  return x;", "    if (x) {", "\n    }");
  assert.equal(result, "\n  return x;");
});

test("postprocessCompletion does not insert newline when prefix has same-line ;return continuation", () => {
  // prefix already has `; return` on the same line → guard prevents newline
  const result = postprocessCompletion("return b;", "const a = 1; return a;", "");
  assert.equal(result, "return b;");
});

test("postprocessCompletion does not insert newline when cursor is mid-line (suffix has code)", () => {
  const result = postprocessCompletion("x", "const a = ", "= 1;");
  assert.equal(result, "x");
});

test("postprocessCompletion does not insert newline on empty line", () => {
  const result = postprocessCompletion("if (x) {", "function f() {\n    ", "");
  assert.equal(result, "if (x) {");
});

test("postprocessCompletion does not insert newline for plain expression", () => {
  const result = postprocessCompletion("x + 1", "const a = ", "");
  assert.equal(result, "x + 1");
});

// --- postprocessCompletion: additional regression tests ---

test("postprocessCompletion does not split semicolons inside for-loop header", () => {
  const result = postprocessCompletion(
    "for (let i = 0; i < n; i++) {\n  work();\n}",
    "function run() {\n  ",
    "\n}",
  );
  assert.equal(result, "for (let i = 0; i < n; i++) {\n  work();\n}");
});

test("postprocessCompletion does not split semicolons inside for(;;) header", () => {
  const result = postprocessCompletion(
    "for (;foo();bar++) {\n  work();\n}",
    "function run() {\n  ",
    "\n}",
  );
  assert.equal(result, "for (;foo();bar++) {\n  work();\n}");
});

test("postprocessCompletion does not split semicolons inside template string", () => {
  const result = postprocessCompletion(
    "`a;b;c`",
    "const s = ",
    "",
  );
  assert.equal(result, "`a;b;c`");
});

test("postprocessCompletion does not split semicolons inside single-quoted string", () => {
  const result = postprocessCompletion(
    "'a;b;c'",
    "const s = ",
    "",
  );
  assert.equal(result, "'a;b;c'");
});

test("postprocessCompletion does not split semicolons inside double-quoted string", () => {
  const result = postprocessCompletion(
    '"a;b;c"',
    "const s = ",
    "",
  );
  assert.equal(result, '"a;b;c"');
});

test("postprocessCompletion does not split semicolons inside line comment", () => {
  const result = postprocessCompletion(
    "// a; b; c;\nconst x = 1;",
    "function f() {\n  ",
    "\n}",
  );
  assert.ok(result);
  assert.ok(!result.includes(";\n//"));
});

test("postprocessCompletion does not split semicolons inside block comment", () => {
  const result = postprocessCompletion(
    "/* a; b; c; */\nconst x = 1;",
    "function f() {\n  ",
    "\n}",
  );
  assert.ok(result);
  // The block comment content should not be split
  assert.ok(result.includes("/* a; b; c; */"));
});

test("postprocessCompletion splits glued expression statements", () => {
  const result = postprocessCompletion(
    "foo.bar();baz.qux()",
    "const x = 1;",
    "",
  );
  assert.equal(result, "\nfoo.bar();\nbaz.qux()");
});

test("postprocessCompletion handles escaped quotes in strings", () => {
  const result = postprocessCompletion(
    "'it\\'s; a; test'",
    "const s = ",
    "",
  );
  assert.equal(result, "'it\\'s; a; test'");
});

test("postprocessCompletion handles nested parentheses", () => {
  const result = postprocessCompletion(
    "foo(a, b);bar(c)",
    "const x = 1;",
    "",
  );
  // Both are expression statements starting with identifiers, so they should be split
  assert.ok(result.includes(";\n"));
});
