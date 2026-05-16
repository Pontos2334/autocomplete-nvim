import * as path from "node:path";
import type { AppConfig, CompletionRequest, JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { loadConfig } from "./config.js";
import { CompletionEngine } from "./completion.js";
import { AuditManager } from "./audit/index.js";

export class MethodHandler {
  private config: AppConfig;
  private completionEngine: CompletionEngine;
  private audit: AuditManager;
  private initialized = false;
  private pendingCompletions = new Map<string, AbortController>();

  constructor(config: AppConfig, audit: AuditManager) {
    this.config = config;
    this.completionEngine = new CompletionEngine(config);
    this.audit = audit;
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { method, params, id } = request;
    try {
      let result: unknown;
      switch (method) {
        case "initialize":
          result = await this.initialize(params);
          break;
        case "complete":
          result = await this.complete(params);
          break;
        case "accept":
          result = await this.accept(params);
          break;
        case "cancel":
          result = await this.cancel(params);
          break;
        case "reloadConfig":
          result = await this.reloadConfig(params);
          break;
        case "shutdown":
          result = await this.shutdown();
          break;
        case "getAuditInfo":
          result = this.audit.getInfo();
          break;
        default:
          return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } };
      }
      return { jsonrpc: "2.0", id: id ?? null, result };
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code: -32603,
          message: error?.message ?? "Internal error",
        },
      };
    }
  }

  private async initialize(params?: any): Promise<Record<string, unknown>> {
    if (params?.configPath) {
      this.config = loadConfig(params.configPath);
      this.completionEngine.updateConfig(this.config);
    }
    this.initialized = true;
    return {
      serverInfo: { name: "autocomplete-nvim-server", version: "0.1.0" },
      capabilities: {
        completionProvider: true,
        audit: this.audit.getInfo(),
      },
      config: {
        configPath: this.config.configPath,
        provider: this.config.model.provider,
        model: this.config.model.model,
        apiBase: this.config.model.apiBase,
        hasApiKey: Boolean(this.config.model.apiKey),
      },
    };
  }

  private async complete(params?: CompletionRequest): Promise<unknown> {
    if (!this.initialized) throw new Error("Server not initialized");
    if (!params) throw new Error("Missing params for complete");
    const completionId = params.completionId ?? crypto.randomUUID();
    const controller = new AbortController();
    this.pendingCompletions.set(completionId, controller);
    const receivedAt = Date.now();
    const filename = path.basename(params.filepath.replace(/^file:\/\//, ""));

    this.audit.startRecord({
      id: completionId,
      receivedAt,
      filepath: params.filepath,
      filename,
      line: params.pos.line,
      character: params.pos.character,
      manuallyTriggered: Boolean(params.manuallyTriggered),
      timing: { requestStartAt: receivedAt },
    });

    try {
      const { result, audit } = await this.completionEngine.complete(
        { ...params, completionId },
        controller.signal,
      );
      this.audit.updateRecord(completionId, {
        prefix: audit.prefix,
        suffix: audit.suffix,
        prompt: audit.prompt,
        completion: audit.completion,
        processedCompletion: audit.processedCompletion,
        displayedCompletion: audit.displayedCompletion,
        completionOptions: audit.completionOptions,
        isMultiline: audit.isMultiline,
        chunkCount: audit.chunkCount,
        timedOut: audit.timedOut,
        previewOnly: audit.partialReturned,
        partialReturned: audit.partialReturned,
        reuseHit: audit.reuseHit,
        reuseReason: audit.reuseReason,
        modelProvider: this.config.model.provider,
        modelName: this.config.model.model,
        apiBase: this.config.model.apiBase,
        snippetSummary: {
          ide: params.lspSnippets?.length ?? 0,
          edited: params.recentlyEditedRanges?.length ?? 0,
          opened:
            (params.recentlyVisitedRanges?.length ?? 0) +
            (params.openedFileSnippets?.length ?? 0),
          rootPath: params.workspaceConfigSnippets?.length ?? 0,
          imports: params.importSnippets?.length ?? 0,
        },
        timing: {
          promptRenderedAt: Date.now(),
          firstChunkAt: audit.timing.firstChunkAt,
          llmCallStartAt: audit.timing.llmCallStartAt,
          llmCallEndAt: audit.timing.llmCallEndAt,
        },
      });

      if (!result) {
        this.audit.updateRecord(completionId, {
          status: controller.signal.aborted ? "cancelled" : "filtered",
          filterReason: audit.filterReason ?? "empty",
          completedAt: Date.now(),
          durationMs: Date.now() - receivedAt,
        });
        return null;
      }

      this.audit.updateRecord(completionId, {
        status: "completed",
        cacheHit: result.cacheHit,
        numLines: result.completion.split(/\r?\n/).length,
        timedOut: result.timedOut,
        completedAt: Date.now(),
        durationMs: result.latencyMs,
        timing: { completedAt: Date.now() },
      });
      return result;
    } catch (error: any) {
      const status = controller.signal.aborted ? "cancelled" : "error";
      this.audit.updateRecord(completionId, {
        status,
        error: { type: error?.name ?? "Error", message: error?.message ?? String(error) },
        completedAt: Date.now(),
        durationMs: Date.now() - receivedAt,
      });
      throw error;
    } finally {
      this.pendingCompletions.delete(completionId);
    }
  }

  private async accept(params?: any): Promise<Record<string, unknown>> {
    const completionId = params?.completionId;
    if (completionId) this.completionEngine.accept(completionId);
    return { accepted: true };
  }

  private async cancel(params?: any): Promise<Record<string, unknown>> {
    const id = params?.completionId ?? params?.id;
    if (id && this.pendingCompletions.has(id)) {
      this.pendingCompletions.get(id)!.abort();
      this.pendingCompletions.delete(id);
    }
    await this.completionEngine.cancelReuse();
    return { cancelled: true };
  }

  private async reloadConfig(params?: any): Promise<Record<string, unknown>> {
    this.config = loadConfig(params?.configPath);
    this.completionEngine.updateConfig(this.config);
    return {
      reloaded: true,
      configPath: this.config.configPath,
      provider: this.config.model.provider,
      model: this.config.model.model,
      apiBase: this.config.model.apiBase,
      hasApiKey: Boolean(this.config.model.apiKey),
    };
  }

  private async shutdown(): Promise<Record<string, unknown>> {
    this.initialized = false;
    for (const controller of this.pendingCompletions.values()) controller.abort();
    this.pendingCompletions.clear();
    return { shutdown: true };
  }
}
