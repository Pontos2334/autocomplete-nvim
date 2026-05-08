import { ConfigHandler } from "../config/ConfigHandler.js";
import { IDE, ILLM } from "../index.js";
import OpenAI from "../llm/llms/OpenAI.js";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters.js";

function log(msg: string, ...args: any[]) {
  const fn = (globalThis as any).__autocompleteLog;
  if (fn) fn(msg, ...args);
}

import { shouldCompleteMultiline } from "./classification/shouldCompleteMultiline.js";
import { ContextRetrievalService } from "./context/ContextRetrievalService.js";

import { isSecurityConcern } from "../indexing/ignore.js";
import { BracketMatchingService } from "./filtering/BracketMatchingService.js";
import { CompletionStreamer } from "./generation/CompletionStreamer.js";
import { postprocessCompletion } from "./postprocessing/index.js";
import { shouldPrefilter } from "./prefiltering/index.js";
import { getAllSnippetsWithoutRace } from "./snippets/index.js";
import { renderPromptWithTokenLimit } from "./templating/index.js";
import { GetLspDefinitionsFunction } from "./types.js";
import { AutocompleteDebouncer } from "./util/AutocompleteDebouncer.js";
import { AutocompleteLoggingService } from "./util/AutocompleteLoggingService.js";
import AutocompleteLruCache from "./util/AutocompleteLruCache.js";
import { HelperVars } from "./util/HelperVars.js";
import {
  AutocompleteInput,
  AutocompleteOutcome,
  StreamPreviewState,
} from "./util/types.js";
import type { IAuditContext } from "../../audit/types.js";

const autocompleteCachePromise = AutocompleteLruCache.get();

function filterPathLinesFromCompletion(completion: string): string {
  if (!completion) return completion;
  return completion
    .split("\n")
    .filter((line) => !line.startsWith("--- ["))
    .join("\n");
}

// Errors that can be expected on occasion even during normal functioning should not be shown.
// Not worth disrupting the user to tell them that a single autocomplete request didn't go through
const ERRORS_TO_IGNORE = [
  // From Ollama
  "unexpected server status",
  "operation was aborted",
];

export class CompletionProvider {
  private autocompleteCache?: AutocompleteLruCache;
  public errorsShown: Set<string> = new Set();
  private bracketMatchingService = new BracketMatchingService();
  private debouncer = new AutocompleteDebouncer();
  private completionStreamer: CompletionStreamer;
  private loggingService = new AutocompleteLoggingService();
  private contextRetrievalService: ContextRetrievalService;
  public auditContext?: IAuditContext;

  constructor(
    private readonly configHandler: ConfigHandler,
    private readonly ide: IDE,
    private readonly _injectedGetLlm: () => Promise<ILLM | undefined>,
    private readonly _onError: (e: any) => void,
    private readonly getDefinitionsFromLsp: GetLspDefinitionsFunction,
  ) {
    this.completionStreamer = new CompletionStreamer(this.onError.bind(this));
    this.contextRetrievalService = new ContextRetrievalService(this.ide);
    void this.initCache();
  }

  private async initCache() {
    try {
      this.autocompleteCache = await autocompleteCachePromise;
    } catch (e) {
      console.error("Failed to initialize autocomplete cache:", e);
    }
  }

  private async getCache(): Promise<AutocompleteLruCache> {
    if (!this.autocompleteCache) {
      this.autocompleteCache = await autocompleteCachePromise;
    }
    return this.autocompleteCache;
  }

  private async _prepareLlm(): Promise<ILLM | undefined> {
    const llm = await this._injectedGetLlm();

    if (!llm) {
      return undefined;
    }

    // Temporary fix for JetBrains autocomplete bug as described in https://github.com/continuedev/continue/pull/3022
    if (llm.model === undefined && llm.completionOptions?.model !== undefined) {
      llm.model = llm.completionOptions.model;
    }

    // Ignore empty API keys for Mistral since we currently write
    // a template provider without one during onboarding
    if (llm.providerName === "mistral" && llm.apiKey === "") {
      return undefined;
    }

    // Set temperature (but don't override)
    if (llm.completionOptions.temperature === undefined) {
      llm.completionOptions.temperature = 0.01;
    }

    return llm;
  }

  private onError(e: any) {
    if (
      ERRORS_TO_IGNORE.some((err) =>
        typeof e === "string" ? e.includes(err) : e?.message?.includes(err),
      )
    ) {
      return;
    }

    console.warn("Error generating autocompletion: ", e);
    if (!this.errorsShown.has(e.message)) {
      this.errorsShown.add(e.message);
      this._onError(e);
    }
  }

  public cancel() {
    this.loggingService.cancel();
  }

  public accept(completionId: string) {
    const outcome = this.loggingService.accept(completionId);
    if (!outcome) {
      return;
    }
    this.bracketMatchingService.handleAcceptedCompletion(
      outcome.completion,
      outcome.filepath,
    );
  }

  public markDisplayed(completionId: string, outcome: AutocompleteOutcome) {
    this.loggingService.markDisplayed(completionId, outcome);
  }

  private async _getAutocompleteOptions(llm: ILLM) {
    const { config } = await this.configHandler.loadConfig();
    const options = {
      ...DEFAULT_AUTOCOMPLETE_OPTS,
      ...config?.tabAutocompleteOptions,
      ...llm.autocompleteOptions,
    };

    // Enable static contextualization if defined.
    if (config?.experimental?.enableStaticContextualization) {
      options.experimental_enableStaticContextualization = true;
    }

    return options;
  }

  public async provideInlineCompletionItems(
    input: AutocompleteInput,
    token: AbortSignal | undefined,
    force?: boolean,
  ): Promise<AutocompleteOutcome | undefined> {
    try {
      // Create abort signal if not given
      if (!token) {
        const controller = this.loggingService.createAbortController(
          input.completionId,
        );
        token = controller.signal;
      }
      const startTime = Date.now();

      const llm = await this._prepareLlm();
      if (!llm) {
        log("[Core] No LLM available");
        return undefined;
      }

      log(`[Core] LLM: ${llm.providerName}/${llm.model}, apiBase=${llm.apiBase}, supportsFim=${llm.supportsFim()}`);

      if (isSecurityConcern(input.filepath)) {
        log("[Core] Blocked by security concern:", input.filepath);
        return undefined;
      }

      const options = await this._getAutocompleteOptions(llm);

      // Debounce
      if (!force) {
        if (
          await this.debouncer.delayAndShouldDebounce(options.debounceDelay)
        ) {
          log("[Core] Debounced");
          this.auditContext?.updateRecord(input.completionId, {
            status: "filtered", filterReason: "debounded",
            completedAt: Date.now(),
          });
          return undefined;
        }
      }

      if (llm.promptTemplates?.autocomplete) {
        options.template = llm.promptTemplates.autocomplete as string;
      }

      const helper = await HelperVars.create(
        input,
        options,
        llm.model,
        this.ide,
      );

      log(`[Core] HelperVars: prefix=${helper.prunedPrefix.length}chars, suffix=${helper.prunedSuffix.length}chars`);

      if (await shouldPrefilter(helper, this.ide)) {
        log("[Core] Prefiltered");
        this.auditContext?.updateRecord(input.completionId, {
          status: "filtered", filterReason: "prefiltered",
          completedAt: Date.now(), language: helper.lang.name,
        });
        return undefined;
      }

      const [snippetPayload, workspaceDirs] = await Promise.all([
        getAllSnippetsWithoutRace({
          helper,
          ide: this.ide,
          getDefinitionsFromLsp: this.getDefinitionsFromLsp,
          contextRetrievalService: this.contextRetrievalService,
        }),
        this.ide.getWorkspaceDirs(),
      ]);

      log(`[Core] Snippets: rootPath=${snippetPayload.rootPathSnippets.length} imports=${snippetPayload.importDefinitionSnippets.length} ide=${snippetPayload.ideSnippets.length} edited=${snippetPayload.recentlyEditedRangeSnippets.length} opened=${snippetPayload.recentlyOpenedFileSnippets.length}`);

      const { prompt, prefix, suffix, completionOptions } =
        renderPromptWithTokenLimit({
          snippetPayload,
          workspaceDirs,
          helper,
          llm,
        });

      log(`[Core] Prompt: ${prompt.length}chars, multiline=${!helper.options.transform || shouldCompleteMultiline(helper)}`);
      log(`[Core] Context sizes: prefix=${helper.prunedPrefix.length}chars, suffix=${helper.prunedSuffix.length}chars`);

      // Audit: record prompt stage
      this.auditContext?.updateRecord(input.completionId, {
        prefix, suffix, prompt,
        language: helper.lang.name,
        timing: { promptRenderedAt: Date.now() },
        snippetSummary: {
          rootPath: snippetPayload.rootPathSnippets.length,
          imports: snippetPayload.importDefinitionSnippets.length,
          ide: snippetPayload.ideSnippets.length,
          edited: snippetPayload.recentlyEditedRangeSnippets.length,
          opened: snippetPayload.recentlyOpenedFileSnippets.length,
        },
        completionOptions,
      });

      // Completion
      let completion: string | undefined = "";
      const streamState: StreamPreviewState = {
        previewOnly: false,
        timedOut: false,
      };
      const cache = await this.getCache();
      const cachedCompletion = helper.options.useCache
        ? await cache.get(helper.prunedPrefix, helper.prunedSuffix)
        : undefined;
      let cacheHit = false;
      if (cachedCompletion) {
        cacheHit = true;
        completion = cachedCompletion;
        log("[Core] Cache HIT");
      } else {
        const multiline =
          !helper.options.transform || shouldCompleteMultiline(helper);

        log(`[Core] Calling LLM (multiline=${multiline})...`);

        // Audit: record LLM call start
        this.auditContext?.updateRecord(input.completionId, {
          timing: { llmCallStartAt: Date.now() },
          modelProvider: llm.underlyingProviderName,
          modelName: llm.model,
          apiBase: llm.apiBase ?? "",
          isMultiline: multiline,
        });

        const completionStream =
          this.completionStreamer.streamCompletionWithFilters(
            token,
            llm,
            prefix,
            suffix,
            multiline,
            completionOptions,
            helper,
            streamState,
          );

        for await (const update of completionStream) {
          if (completion.length === 0) {
            this.auditContext?.updateRecord(input.completionId, {
              timing: { firstChunkAt: Date.now() },
            });
          }
          completion += update;
        }

        const chunkCount = completion.length > 0 ? 1 : 0; // approximate

        log(`[Core] LLM response: ${completion.length}chars, ${Date.now() - startTime}ms`);

        // Audit: record LLM response
        this.auditContext?.updateRecord(input.completionId, {
          timing: { llmCallEndAt: Date.now() },
          completion,
        });

        // Don't postprocess if aborted
        if (token.aborted) {
          log(`[Core] Aborted after LLM response: "${completion.substring(0, 40)}"`);
          this.auditContext?.updateRecord(input.completionId, {
            status: "cancelled", filterReason: "aborted_after_llm",
            completedAt: Date.now(), durationMs: Date.now() - startTime,
          });
          return undefined;
        }

        const processedCompletion = helper.options.transform
          ? postprocessCompletion({
              completion,
              prefix: helper.prunedPrefix,
              suffix: helper.prunedSuffix,
              llm,
            })
          : filterPathLinesFromCompletion(completion);

        if (!processedCompletion && completion) {
          log(`[Filter] 补全被 postprocessCompletion 丢弃: 原始="${completion.substring(0, 40)}"`);
          this.auditContext?.updateRecord(input.completionId, {
            status: "filtered", filterReason: "postprocess_dropped",
            processedCompletion: "",
            completedAt: Date.now(), durationMs: Date.now() - startTime,
          });
        } else if (processedCompletion) {
          this.auditContext?.updateRecord(input.completionId, {
            processedCompletion,
          });
        }

        completion = processedCompletion;
      }

      if (!completion) {
        log("[Core] Empty completion after processing");
        this.auditContext?.updateRecord(input.completionId, {
          status: "filtered", filterReason: "empty_after_processing",
          completedAt: Date.now(), durationMs: Date.now() - startTime,
        });
        return undefined;
      }

      const outcome: AutocompleteOutcome = {
        time: Date.now() - startTime,
        completion,
        prefix,
        suffix,
        prompt,
        modelProvider: llm.underlyingProviderName,
        modelName: llm.model,
        completionOptions,
        cacheHit,
        filepath: helper.filepath,
        numLines: completion.split("\n").length,
        completionId: helper.input.completionId,
        gitRepo: await this.ide.getRepoName(helper.filepath),
        uniqueId: await this.ide.getUniqueId(),
        timestamp: new Date().toISOString(),
        profileType:
          this.configHandler.currentProfile?.profileDescription.profileType,
        previewOnly: streamState.previewOnly || streamState.timedOut,
        timedOut: streamState.timedOut,
        ...helper.options,
      };

      if (options.experimental_enableStaticContextualization) {
        outcome.enabledStaticContextualization = true;
      }

      if (
        !outcome.cacheHit &&
        helper.options.useCache &&
        !outcome.previewOnly &&
        !outcome.timedOut
      ) {
        void cache
          .put(helper.prunedPrefix, helper.prunedSuffix, outcome.completion)
          .catch((e) => console.warn(`Failed to save to cache: ${e.message}`));
      }

      const ideType = (await this.ide.getIdeInfo()).ideType;
      if (ideType === "jetbrains") {
        this.markDisplayed(input.completionId, outcome);
      }

      // Audit: record completion outcome
      this.auditContext?.completeRecord(input.completionId, {
        status: "completed",
        completion: outcome.completion,
        cacheHit: outcome.cacheHit,
        numLines: outcome.numLines,
        previewOnly: outcome.previewOnly,
        timedOut: outcome.timedOut,
        durationMs: outcome.time,
        completedAt: Date.now(),
        timing: { completedAt: Date.now() },
      });

      return outcome;
    } catch (e: any) {
      log(`[Core] ERROR: ${e.message}`);
      this.auditContext?.updateRecord(input.completionId, {
        status: "error",
        error: { type: e.constructor?.name || "Error", message: e.message },
        completedAt: Date.now(), durationMs: Date.now() - startTime,
      });
      this.onError(e);
    } finally {
      this.loggingService.deleteAbortController(input.completionId);
    }
  }

  public async dispose() {
    if (this.autocompleteCache) {
      await this.autocompleteCache.close();
    }
  }
}
