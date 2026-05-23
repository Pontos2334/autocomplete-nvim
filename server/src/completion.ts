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
import { postprocessCompletion } from "./postprocessing.js";
import {
  runFilterPipeline,
  type PipelineContext,
} from "./filtering/StreamTransformPipeline.js";
import {
  GeneratorReuseManager,
  type ReuseInfo,
} from "./generation/GeneratorReuseManager.js";

interface PrefixSuffix {
  prefix: string;
  suffix: string;
  prunedPrefix: string;
  prunedSuffix: string;
}

interface StreamState {
  timedOut: boolean;
  chunkCount: number;
  firstChunkAt?: number;
  llmCallStartAt?: number;
  llmCallEndAt?: number;
  partialReturned: boolean;
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
  timedOut: boolean;
  partialReturned: boolean;
  reuseHit: boolean;
  reuseReason?: ReuseInfo["reuseReason"];
  timing: {
    firstChunkAt?: number;
    llmCallStartAt?: number;
    llmCallEndAt?: number;
  };
}

export class CompletionEngine {
  private config: AppConfig;
  private cache = new Map<string, string>();
  private static readonly MAX_CACHE_SIZE = 200;
  private reuseManager = new GeneratorReuseManager();

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
      timedOut: false,
      partialReturned: false,
      reuseHit: false,
      timing: {},
    };

    if (this.config.options.disable) {
      audit.filterReason = "disabled";
      return { audit };
    }
    if (!this.config.model.apiKey) {
      throw new Error(
        "No API key configured. Set model.apiKey in ~/.config/nvim/autocomplete-nvim.json or DEEPSEEK_API_KEY.",
      );
    }
    if (!supportsDeepSeekFim(this.config.model.apiBase)) {
      throw new Error(
        "MVP supports DeepSeek FIM only. Use apiBase https://api.deepseek.com/beta.",
      );
    }

    const cacheKey = `${request.filepath}\0${ps.prunedPrefix}\0${ps.prunedSuffix}`;
    let completion = this.config.options.useCache
      ? this.cache.get(cacheKey)
      : undefined;
    let cacheHit = Boolean(completion);
    const streamState: StreamState = { timedOut: false, chunkCount: 0, partialReturned: false };

    if (!completion) {
      // Internal abort controller for soft timeout / filter pipeline fullStop.
      // This is separate from the external signal (which comes from methods.ts cancel).
      const internalAbort = new AbortController();
      // Chain external signal to internal
      signal?.addEventListener("abort", () => internalAbort.abort(), { once: true });

      // Use reuse manager to potentially reuse an in-flight generator
      const rawStream = this.reuseManager.getGenerator(
        ps.prunedPrefix,
        ps.prunedSuffix,
        request.filepath,
        () => this.streamDeepSeekFim(
          ps.prunedPrefix,
          ps.prunedSuffix,
          completionOptions,
          streamState,
          internalAbort.signal,
        ),
      );
      const reuseInfo = this.reuseManager.getLastReuseInfo();
      audit.reuseHit = reuseInfo.reuseHit;
      audit.reuseReason = reuseInfo.reuseReason;
      const abortIfCurrentLease = () => {
        if (this.reuseManager.isLeaseActive(reuseInfo.leaseId)) {
          internalAbort.abort();
        }
      };

      // Run streaming filter pipeline
      const aborted = { value: false };
      const pipelineCtx: PipelineContext = {
        prefix: ps.prunedPrefix,
        suffix: ps.prunedSuffix,
        stopTokens: this.config.options.stop ?? [],
        lineBelowCursor: getLineBelowCursor(ps.suffix),
        fullStop: () => {
          aborted.value = true;
          abortIfCurrentLease();
        },
      };
      const filteredStream = runFilterPipeline(rawStream, pipelineCtx);

      // Soft timeout: return whatever we have if non-empty content received
      const softTimeoutMs = this.config.options.showWhateverWeHaveAtMs ?? 0;
      const streamStart = Date.now();

      completion = "";
      try {
        for await (const chunk of filteredStream) {
          if (chunk) {
            if (!streamState.firstChunkAt) {
              streamState.firstChunkAt = Date.now();
            }
            streamState.chunkCount++;
            completion += chunk;
          }

          // Soft timeout check: if we have content and enough time has passed
          if (
            softTimeoutMs > 0 &&
            completion.trim().length > 0 &&
            Date.now() - streamStart >= softTimeoutMs
          ) {
            streamState.partialReturned = true;
            // Abort the upstream request only if this request still owns it.
            abortIfCurrentLease();
            break;
          }
        }
      } catch (error: any) {
        if (streamState.timedOut || signal?.aborted || error?.name === "AbortError") {
          // Use whatever we have so far
        } else {
          throw error;
        }
      }

      if (streamState.partialReturned || aborted.value || signal?.aborted) {
        await this.reuseManager.cancelLease(reuseInfo.leaseId);
      }
      streamState.llmCallEndAt = Date.now();

      audit.chunkCount = streamState.chunkCount;
      audit.completion = completion;
      audit.timedOut = streamState.timedOut || Boolean(signal?.aborted);
      audit.partialReturned = streamState.partialReturned;
      audit.timing = {
        firstChunkAt: streamState.firstChunkAt,
        llmCallStartAt: streamState.llmCallStartAt,
        llmCallEndAt: streamState.llmCallEndAt,
      };

      if (!completion) {
        audit.filterReason = aborted.value ? "stream_filtered" : "empty_llm_response";
        return { audit };
      }

      const processed = postprocessCompletion(
        completion,
        ps.prunedPrefix,
        ps.prunedSuffix,
      );
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
      audit.reuseHit = false;
      audit.reuseReason = "no_active";
    }

    const render = renderCompletion(
      completion,
      request,
      ps,
      isMultiline,
    );
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

  async cancelReuse(): Promise<void> {
    await this.reuseManager.cancelActive();
  }

  accept(completionId: string): void {
    void completionId;
  }

  /**
   * Stream DeepSeek FIM response as an AsyncGenerator of text chunks.
   * The caller consumes this through the filter pipeline.
   */
  private async *streamDeepSeekFim(
    prefix: string,
    suffix: string,
    options: Record<string, unknown>,
    state: StreamState,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const endpoint = new URL(
      "completions",
      ensureTrailingSlash(this.config.model.apiBase),
    );
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, Math.max(1, this.config.options.modelTimeout));

    try {
      state.llmCallStartAt = Date.now();
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
        throw new Error(
          `FIM request failed: ${response.status} - ${text.slice(0, 300)}`,
        );
      }

      for await (const event of streamSse(response)) {
        const text = event?.choices?.[0]?.text ?? "";
        if (text) {
          yield text;
        }
      }
    } catch (error: any) {
      if (state.timedOut || signal?.aborted || error?.name === "AbortError") {
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Extract the first non-empty line below cursor from suffix.
 */
function getLineBelowCursor(suffix: string): string {
  const lines = suffix.split("\n");
  // Skip the first segment (rest of current line)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== "") {
      return lines[i];
    }
  }
  return "";
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

  const snippets = mergeContextSnippets(request, 12000);

  const prefixWithSnippets = snippets.length
    ? `${formatSnippets(snippets, request.workspaceDirs ?? [], request.filepath)}\n${prefix}`
    : prefix;

  return {
    prefix,
    suffix,
    prunedPrefix: pruneStart(
      prefixWithSnippets,
      Math.floor(
        config.options.maxPromptTokens * config.options.prefixPercentage,
      ) * 4,
    ),
    prunedSuffix: pruneEnd(
      suffix,
      Math.floor(
        config.options.maxPromptTokens * config.options.maxSuffixPercentage,
      ) * 4,
    ),
  };
}

export function mergeContextSnippets(
  request: CompletionRequest,
  maxTotalChars: number,
): CodeSnippet[] {
  const current = normalizeFilepath(request.filepath);
  const seen = new Set<string>();
  let total = 0;
  const merged: CodeSnippet[] = [];

  const add = (snippet: CodeSnippet | undefined, kind: NonNullable<CodeSnippet["kind"]>) => {
    if (!snippet?.filepath || !snippet.content?.trim()) return;
    if (normalizeFilepath(snippet.filepath) === current) return;
    const key = `${normalizeFilepath(snippet.filepath)}\0${snippet.content}`;
    if (seen.has(key)) return;
    if (total >= maxTotalChars) return;

    const remaining = maxTotalChars - total;
    const content =
      snippet.content.length > remaining
        ? snippet.content.slice(0, remaining)
        : snippet.content;
    if (!content.trim()) return;

    seen.add(key);
    total += content.length;
    merged.push({ ...snippet, content, kind: snippet.kind ?? kind });
  };

  for (const snippet of request.lspSnippets ?? []) add(snippet, "lsp");
  for (const snippet of request.importSnippets ?? []) add(snippet, "import");
  for (const range of request.recentlyEditedRanges ?? []) {
    add(
      {
        filepath: range.filepath,
        content: range.lines.join("\n"),
      },
      "recent_edit",
    );
  }
  for (const snippet of request.recentlyVisitedRanges ?? []) {
    add(snippet, "recent_visit");
  }
  for (const snippet of request.openedFileSnippets ?? []) {
    add(snippet, "open_buffer");
  }
  for (const snippet of request.workspaceConfigSnippets ?? []) {
    add(snippet, "workspace_config");
  }

  return merged;
}

export async function* streamSse(
  response: Response,
): AsyncGenerator<any> {
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
      if (
        !trimmed ||
        trimmed.startsWith(":") ||
        !trimmed.startsWith("data:")
      ) {
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
    const processed = processSingleLineCompletion(
      text,
      currentText,
      start.character,
    );
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

  const parts = diffs
    .map((diff) =>
      !diff.added && !diff.removed ? "=" : diff.added ? "+" : "-",
    )
    .join("");
  if (parts === "+") return { completionText: lastLineOfCompletionText };
  if (parts === "+=" || parts === "+=+") {
    return {
      completionText: lastLineOfCompletionText,
      range: {
        start: cursorPosition,
        end: currentText.length + cursorPosition,
      },
    };
  }
  if (parts === "+-" || parts === "-+")
    return { completionText: lastLineOfCompletionText };
  if (diffs[0]?.added) return { completionText: diffs[0].value };
  return { completionText: lastLineOfCompletionText };
}

export function shouldCompleteMultiline(
  mode: string,
  prefix: string,
  suffix: string,
): boolean {
  if (mode === "always") return true;
  if (mode === "never") return false;
  const currentLine = prefix.split("\n").pop() ?? "";
  if (
    currentLine.trimStart().startsWith("//") ||
    currentLine.trimStart().startsWith("#")
  ) {
    return false;
  }
  return suffix.startsWith("\n") || suffix.trim().length === 0;
}

export function trimDuplicateFollowingLines(
  completion: string,
  documentText: string,
  startLine: number,
): string {
  const completionLines = completion.split(/\r?\n/);
  const docLines = documentText.split(/\r?\n/);
  let keep = completionLines.length;
  for (
    let i = 1;
    i <= Math.min(completionLines.length, docLines.length - startLine - 1);
    i++
  ) {
    const docLine = (docLines[startLine + i] ?? "").trim();
    const completionLine = (
      completionLines[completionLines.length - i] ?? ""
    ).trim();
    if (docLine && docLine === completionLine)
      keep = completionLines.length - i;
    else break;
  }
  return completionLines.slice(0, keep).join("\n");
}

export function completionDuplicatesFollowingLines(
  completion: string,
  documentText: string,
  startLine: number,
): boolean {
  const completionLines = completion
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    completionLines.length === 0 ||
    completionLines.every((line) => line.length <= 4)
  )
    return false;
  const following = documentText
    .split(/\r?\n/)
    .slice(startLine + 1)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, completionLines.length);
  return (
    following.length >= completionLines.length &&
    completionLines.every((line, i) => line === following[i])
  );
}

function getRangeInString(content: string, range: Range): string {
  const lines = content.split("\n");
  if (range.start.line === range.end.line) {
    return (
      lines[range.start.line]?.substring(
        range.start.character,
        range.end.character,
      ) ?? ""
    );
  }
  const firstLine =
    lines[range.start.line]?.substring(range.start.character) ?? "";
  const middleLines = lines.slice(range.start.line + 1, range.end.line);
  const lastLine =
    lines[range.end.line]?.substring(0, range.end.character) ?? "";
  return [firstLine, ...middleLines, lastLine].join("\n");
}

function formatSnippets(
  snippets: CodeSnippet[],
  workspaceDirs: string[],
  currentFilepath: string,
): string {
  const body = snippets
    .slice(0, 8)
    .map((snippet) => {
      const rel = relativeLabel(snippet.filepath, workspaceDirs);
      return `--- [${snippetLabel(snippet.kind)}: ${rel}] ---\n${snippet.content}`;
    })
    .join("\n\n");
  return `${body}\n--- current file: ${relativeLabel(currentFilepath, workspaceDirs)} ---`;
}

function snippetLabel(kind: CodeSnippet["kind"]): string {
  switch (kind) {
    case "workspace_config":
      return "项目配置文件";
    case "import":
      return "Import 定义";
    case "recent_edit":
      return "最近编辑";
    case "recent_visit":
      return "最近访问";
    case "open_buffer":
      return "最近打开文件";
    case "lsp":
      return "IDE/LSP 定义";
    default:
      return "相关文件";
  }
}

function relativeLabel(file: string, workspaceDirs: string[]): string {
  const normalized = normalizeFilepath(file);
  for (const dir of workspaceDirs) {
    const d = normalizeFilepath(dir);
    if (normalized.startsWith(d))
      return normalized.slice(d.length).replace(/^\/+/, "");
  }
  return path.basename(normalized);
}

function normalizeFilepath(value: string): string {
  return value.replace(/^file:\/\//, "").replace(/\\/g, "/");
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
    return (
      url.host === "api.deepseek.com" &&
      url.pathname.replace(/\/+$/, "") === "/beta"
    );
  } catch {
    return false;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
