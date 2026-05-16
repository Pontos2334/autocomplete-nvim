import * as path from "node:path";
import { diffWords } from "diff";
import type {
  AppConfig,
  CodeSnippet,
  CompletionRequest,
  CompletionResult,
  Position,
  Range,
} from "./types.js";

interface PrefixSuffix {
  prefix: string;
  suffix: string;
  prunedPrefix: string;
  prunedSuffix: string;
}

interface StreamState {
  timedOut: boolean;
  chunkCount: number;
}

export interface CompletionAuditDetails {
  prefix: string;
  suffix: string;
  prompt: string;
  completion: string;
  processedCompletion?: string;
  displayedCompletion?: string;
  completionOptions: Record<string, unknown>;
  isMultiline: boolean;
  chunkCount: number;
  filterReason?: string;
}

export class CompletionEngine {
  private config: AppConfig;
  private cache = new Map<string, string>();
  private static readonly MAX_CACHE_SIZE = 200;

  constructor(config: AppConfig) {
    this.config = config;
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
    this.cache.clear();
  }

  async complete(
    request: CompletionRequest,
    signal?: AbortSignal,
  ): Promise<{ result?: CompletionResult; audit: CompletionAuditDetails }> {
    const start = Date.now();
    const completionId = request.completionId ?? crypto.randomUUID();
    const ps = constructPrefixSuffix(request, this.config);
    const isMultiline = shouldCompleteMultiline(
      this.config.options.multilineCompletions,
      ps.prefix,
      ps.suffix,
    );
    const completionOptions = {
      model: this.config.model.model,
      maxTokens: this.config.options.maxTokens,
      temperature: this.config.options.temperature,
      topP: this.config.options.topP,
      frequencyPenalty: this.config.options.frequencyPenalty,
      presencePenalty: this.config.options.presencePenalty,
      stop: this.config.options.stop,
    };

    const audit: CompletionAuditDetails = {
      prefix: ps.prunedPrefix,
      suffix: ps.prunedSuffix,
      prompt: ps.prunedPrefix,
      completion: "",
      completionOptions,
      isMultiline,
      chunkCount: 0,
    };

    if (this.config.options.disable) {
      audit.filterReason = "disabled";
      return { audit };
    }
    if (!this.config.model.apiKey) {
      throw new Error(
        "No API key configured. Set model.apiKey in ~/.autocomplete-nvim/config.json or DEEPSEEK_API_KEY.",
      );
    }
    if (!supportsDeepSeekFim(this.config.model.apiBase)) {
      throw new Error(
        "MVP supports DeepSeek FIM only. Use apiBase https://api.deepseek.com/beta.",
      );
    }

    const cacheKey = `${request.filepath}\0${ps.prunedPrefix}\0${ps.prunedSuffix}`;
    let completion = this.config.options.useCache ? this.cache.get(cacheKey) : undefined;
    let cacheHit = Boolean(completion);
    const streamState: StreamState = { timedOut: false, chunkCount: 0 };

    if (!completion) {
      completion = await this.streamDeepSeekFim(ps.prunedPrefix, ps.prunedSuffix, completionOptions, streamState, signal);
      audit.chunkCount = streamState.chunkCount;
      audit.completion = completion;
      if (!completion) {
        audit.filterReason = "empty_llm_response";
        return { audit };
      }
      const processed = postprocessCompletion(completion, ps.prunedPrefix, ps.prunedSuffix);
      audit.processedCompletion = processed ?? "";
      if (!processed) {
        audit.filterReason = "postprocess_dropped";
        return { audit };
      }
      completion = processed;
      if (this.config.options.useCache && !streamState.timedOut) {
        if (this.cache.size >= CompletionEngine.MAX_CACHE_SIZE) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(cacheKey, completion);
      }
    } else {
      audit.completion = completion;
      audit.processedCompletion = completion;
    }

    const render = renderCompletion(completion, request, ps, isMultiline);
    if (!render) {
      audit.filterReason = "render_dropped";
      return { audit };
    }

    audit.displayedCompletion = render.completion;
    const result: CompletionResult = {
      completionId,
      completion: render.completion,
      range: render.range,
      isMultiline,
      cacheHit,
      timedOut: streamState.timedOut,
      latencyMs: Date.now() - start,
      modelProvider: this.config.model.provider,
      modelName: this.config.model.model,
    };
    return { result, audit };
  }

  accept(completionId: string): void {
    void completionId;
  }

  private async streamDeepSeekFim(
    prefix: string,
    suffix: string,
    options: Record<string, unknown>,
    state: StreamState,
    signal?: AbortSignal,
  ): Promise<string> {
    const endpoint = new URL("completions", ensureTrailingSlash(this.config.model.apiBase));
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, Math.max(1, this.config.options.modelTimeout));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          model: this.config.model.model,
          prompt: prefix,
          suffix,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          frequency_penalty: options.frequencyPenalty,
          presence_penalty: options.presencePenalty,
          stop: options.stop,
          stream: true,
        }),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.config.model.apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`FIM request failed: ${response.status} - ${text.slice(0, 300)}`);
      }

      let completion = "";
      for await (const event of streamSse(response)) {
        const text = event?.choices?.[0]?.text ?? "";
        if (text) {
          state.chunkCount++;
          completion += text;
        }
      }
      return completion;
    } catch (error: any) {
      if (state.timedOut || signal?.aborted || error?.name === "AbortError") {
        return "";
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

export function constructPrefixSuffix(
  request: CompletionRequest,
  config: AppConfig,
): PrefixSuffix {
  const prefix = getRangeInString(request.text, {
    start: { line: 0, character: 0 },
    end: request.pos,
  });
  const lines = request.text.split("\n");
  const suffix = getRangeInString(request.text, {
    start: request.pos,
    end: {
      line: Math.max(0, lines.length - 1),
      character: Number.MAX_SAFE_INTEGER,
    },
  });

  const snippets = [
    ...(request.lspSnippets ?? []),
    ...(request.recentlyVisitedRanges ?? []),
    ...(request.recentlyEditedRanges ?? []).map((range) => ({
      filepath: range.filepath,
      content: range.lines.join("\n"),
    })),
  ].filter((snippet) => snippet.filepath !== request.filepath);

  const prefixWithSnippets = snippets.length
    ? `${formatSnippets(snippets, request.workspaceDirs ?? [], request.filepath)}\n${prefix}`
    : prefix;

  return {
    prefix,
    suffix,
    prunedPrefix: pruneStart(prefixWithSnippets, Math.floor(config.options.maxPromptTokens * config.options.prefixPercentage) * 4),
    prunedSuffix: pruneEnd(suffix, Math.floor(config.options.maxPromptTokens * config.options.maxSuffixPercentage) * 4),
  };
}

export async function* streamSse(response: Response): AsyncGenerator<any> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        yield JSON.parse(data);
      } catch {
        // Ignore malformed SSE frames.
      }
    }
  }
}

function renderCompletion(
  completion: string,
  request: CompletionRequest,
  ps: PrefixSuffix,
  isMultiline: boolean,
): { completion: string; range: Range } | undefined {
  const start = request.pos;
  let text = completion;
  let range: Range = { start, end: start };

  if (!isMultiline && text.includes("\n")) {
    text = text.split(/\r?\n/)[0] ?? "";
  }

  const line = request.text.split("\n")[start.line] ?? "";
  const currentText = line.substring(start.character);
  if (!text.includes("\n")) {
    const processed = processSingleLineCompletion(text, currentText, start.character);
    if (!processed) return undefined;
    text = processed.completionText;
    if (processed.range) {
      range = {
        start: { line: start.line, character: processed.range.start },
        end: { line: start.line, character: processed.range.end },
      };
    }
  }

  text = trimDuplicateFollowingLines(text, request.text, start.line);
  if (!text.trim()) return undefined;
  if (completionDuplicatesFollowingLines(text, request.text, start.line)) {
    return undefined;
  }

  void ps;
  return { completion: text, range };
}

function processSingleLineCompletion(
  lastLineOfCompletionText: string,
  currentText: string,
  cursorPosition: number,
): { completionText: string; range?: { start: number; end: number } } | undefined {
  const diffs = diffWords(currentText, lastLineOfCompletionText) as Array<{
    added?: boolean;
    removed?: boolean;
    value: string;
  }>;

  const parts = diffs.map((diff) => (!diff.added && !diff.removed ? "=" : diff.added ? "+" : "-")).join("");
  if (parts === "+") return { completionText: lastLineOfCompletionText };
  if (parts === "+=" || parts === "+=+") {
    return {
      completionText: lastLineOfCompletionText,
      range: { start: cursorPosition, end: currentText.length + cursorPosition },
    };
  }
  if (parts === "+-" || parts === "-+") return { completionText: lastLineOfCompletionText };
  if (diffs[0]?.added) return { completionText: diffs[0].value };
  return { completionText: lastLineOfCompletionText };
}

function needsLeadingNewline(prefix: string, suffix: string, completion: string): boolean {
  if (completion.startsWith("\n")) return false;
  if (prefix.endsWith("\n")) return false;

  const lastLine = prefix.split("\n").pop() ?? "";
  if (lastLine.trim().length === 0) return false;

  // suffix must start with \n or be empty/whitespace — confirms cursor is at line end
  if (suffix.length > 0 && !/^\s*\n/.test(suffix) && suffix.trim().length > 0) return false;

  // last line must end with a statement terminator
  if (!/[;{}\])>]$/.test(lastLine.trimEnd())) return false;

  // completion must start with a statement keyword
  const trimmed = completion.trimStart();
  if (!/^(?:if|else|for|while|do|switch|try|catch|finally|class|function|const|let|var|return|throw|export|import|default|break|continue|case|async|await|new|typeof|instanceof|void|delete)\b/.test(trimmed)) return false;

  // avoid breaking same-line continuation patterns like `foo();return x`
  if (/;\s*(const|let|var|return)\b/.test(lastLine)) return false;

  return true;
}

function inferIndentStep(lines: string[]): string | null {
  const indents: number[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (/^\t/.test(line)) return "\t";
    const spaces = line.match(/^( +)/)?.[1]?.length ?? 0;
    indents.push(spaces);
  }
  if (indents.length < 2) return null;
  const sorted = [...indents].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (diff > 0) return " ".repeat(diff);
  }
  return null;
}

function inferIndentation(prefix: string, completion: string): string {
  // if completion's first non-empty line already has leading whitespace, don't add more
  const firstNonEmpty = completion.split("\n").find((l) => l.trim().length > 0);
  if (firstNonEmpty && /^[ \t]/.test(firstNonEmpty)) return "";

  const lines = prefix.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
      if (lines[i].trimEnd().endsWith("{")) {
        const step = inferIndentStep(lines);
        return step ? indent + step : indent;
      }
      return indent;
    }
  }
  return "";
}

export function postprocessCompletion(completion: string, prefix: string, suffix: string): string | undefined {
  let result = completion;
  if (!result || result.trim().length === 0) return undefined;
  const lineAbove = prefix.split("\n").filter((line) => line.trim()).slice(-1)[0];
  const firstCompletionLine = result.split("\n").find((line) => line.trim());
  if (lineAbove && firstCompletionLine && lineAbove.trim() === firstCompletionLine.trim()) {
    return undefined;
  }
  if (prefix.endsWith(" ") && result.startsWith(" ")) {
    result = result.slice(1);
  }
  if (suffix && result.startsWith(suffix.slice(0, Math.min(20, suffix.length)))) {
    result = result.slice(Math.min(20, suffix.length));
  }
  result = result.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "");

  if (needsLeadingNewline(prefix, suffix, result)) {
    const indent = inferIndentation(prefix, result);
    result = "\n" + indent + result;
  }

  return result.trim().length === 0 ? undefined : result;
}

export function shouldCompleteMultiline(mode: string, prefix: string, suffix: string): boolean {
  if (mode === "always") return true;
  if (mode === "never") return false;
  const currentLine = prefix.split("\n").pop() ?? "";
  if (currentLine.trimStart().startsWith("//") || currentLine.trimStart().startsWith("#")) {
    return false;
  }
  return suffix.startsWith("\n") || suffix.trim().length === 0;
}

export function trimDuplicateFollowingLines(completion: string, documentText: string, startLine: number): string {
  const completionLines = completion.split(/\r?\n/);
  const docLines = documentText.split(/\r?\n/);
  let keep = completionLines.length;
  for (let i = 1; i <= Math.min(completionLines.length, docLines.length - startLine - 1); i++) {
    const docLine = (docLines[startLine + i] ?? "").trim();
    const completionLine = (completionLines[completionLines.length - i] ?? "").trim();
    if (docLine && docLine === completionLine) keep = completionLines.length - i;
    else break;
  }
  return completionLines.slice(0, keep).join("\n");
}

export function completionDuplicatesFollowingLines(
  completion: string,
  documentText: string,
  startLine: number,
): boolean {
  const completionLines = completion.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (completionLines.length === 0 || completionLines.every((line) => line.length <= 4)) return false;
  const following = documentText.split(/\r?\n/).slice(startLine + 1).map((line) => line.trim()).filter(Boolean).slice(0, completionLines.length);
  return following.length >= completionLines.length && completionLines.every((line, i) => line === following[i]);
}

function getRangeInString(content: string, range: Range): string {
  const lines = content.split("\n");
  if (range.start.line === range.end.line) {
    return lines[range.start.line]?.substring(range.start.character, range.end.character) ?? "";
  }
  const firstLine = lines[range.start.line]?.substring(range.start.character) ?? "";
  const middleLines = lines.slice(range.start.line + 1, range.end.line);
  const lastLine = lines[range.end.line]?.substring(0, range.end.character) ?? "";
  return [firstLine, ...middleLines, lastLine].join("\n");
}

function formatSnippets(snippets: CodeSnippet[], workspaceDirs: string[], currentFilepath: string): string {
  const body = snippets.slice(0, 8).map((snippet) => {
    const rel = relativeLabel(snippet.filepath, workspaceDirs);
    return `--- [related file: ${rel}] ---\n${snippet.content}`;
  }).join("\n\n");
  return `${body}\n--- current file: ${relativeLabel(currentFilepath, workspaceDirs)} ---`;
}

function relativeLabel(file: string, workspaceDirs: string[]): string {
  const normalized = file.replace(/^file:\/\//, "").replace(/\\/g, "/");
  for (const dir of workspaceDirs) {
    const d = dir.replace(/^file:\/\//, "").replace(/\\/g, "/");
    if (normalized.startsWith(d)) return normalized.slice(d.length).replace(/^\/+/, "");
  }
  return path.basename(normalized);
}

function pruneStart(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

function pruneEnd(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

function supportsDeepSeekFim(apiBase: string): boolean {
  try {
    const url = new URL(apiBase);
    return url.host === "api.deepseek.com" && url.pathname.replace(/\/+$/, "") === "/beta";
  } catch {
    return false;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
