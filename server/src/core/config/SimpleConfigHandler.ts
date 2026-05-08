// Simplified ConfigHandler for standalone autocomplete extension
// Replaces the complex core/config/ConfigHandler.ts

import { ILLM, TabAutocompleteOptions } from "../index.js";
import { DEFAULT_AUTOCOMPLETE_OPTS } from "../util/parameters.js";
import { BaseLLM } from "../llm/index.js";
import * as vscode from "vscode";

function log(msg: string, ...args: any[]) {
  const fn = (globalThis as any).__autocompleteLog;
  if (fn) fn(msg, ...args);
}

export interface AuditConfig {
  enabled: boolean;
  port?: number;
  ttlMs?: number;
  maxRecords?: number;
}

export interface AutocompleteConfig {
  model: {
    title?: string;
    provider: string;
    model: string;
    apiBase?: string;
    apiKey?: string;
    [key: string]: any;
  };
  options?: Partial<TabAutocompleteOptions> & {
    chainCompletionDelay?: number;
    enterTriggerDelay?: number;
    backspaceTriggerDelay?: number;
  };
  audit?: AuditConfig;
}

export interface SimpleConfigResult {
  config: {
    selectedModelByRole: {
      autocomplete: ILLM | undefined;
    };
    tabAutocompleteOptions?: TabAutocompleteOptions;
    experimental?: {
      enableStaticContextualization?: boolean;
    };
    audit?: AuditConfig;
  } | null;
  errors: string[];
}

// Dynamic import to avoid pulling in all LLM providers
async function createLLM(modelConfig: AutocompleteConfig["model"]): Promise<ILLM> {
  // Use the OpenAI class which supports all OpenAI-compatible APIs
  const { default: OpenAI } = await import("../llm/llms/OpenAI.js");
  const { model, apiBase, apiKey, title, provider, ...rest } = modelConfig;
  // Filter out null/undefined values so they don't override BaseLLM defaults
  const filteredRest = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v != null && !String(v).startsWith("_comment"))
  );
  const llm = new OpenAI({
    model,
    apiBase,
    apiKey,
    title,
    provider,
    ...filteredRest,
  } as any);
  return llm as any as ILLM;
}

export class SimpleConfigHandler {
  private configPath: string;
  private config: SimpleConfigResult | null = null;
  private listeners: ((result: SimpleConfigResult) => void)[] = [];
  private watcher: any = null;
  public currentProfile: any = undefined;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  async loadConfig(): Promise<SimpleConfigResult> {
    try {
      const fs = await import("fs");
      const content = await fs.promises.readFile(this.configPath, "utf-8");
      const raw: AutocompleteConfig = JSON.parse(content);

      log(`[Config] Loading: model=${raw.model?.model}, apiBase=${raw.model?.apiBase}, provider=${raw.model?.provider}`);

      const llm = await createLLM(raw.model);
      if (!llm.supportsFim()) {
        throw new Error(
          `Autocomplete requires a FIM-capable config. The current model ${raw.model?.model ?? "(unknown)"} with apiBase ${raw.model?.apiBase ?? "(missing)"} is not supported. Use a FIM endpoint such as DeepSeek beta (https://api.deepseek.com/beta).`,
        );
      }

      // 读取 VS Code 设置（优先级高于 config.json）
      const vsConfig = vscode.workspace.getConfiguration("autocomplete");
      const vsOptions: Record<string, any> = {};
      const readExplicitSetting = <T>(key: string): T | undefined => {
        const inspected = vsConfig.inspect<T>(key);
        return (
          inspected?.workspaceFolderValue ??
          inspected?.workspaceValue ??
          inspected?.globalValue
        );
      };
      const debounceDelay = readExplicitSetting<number>("debounceDelay");
      const maxPromptTokens = readExplicitSetting<number>("maxPromptTokens");
      const multilineCompletions = readExplicitSetting<string>("multilineCompletions");
      const modelTimeout = readExplicitSetting<number>("modelTimeout");
      const useCache = readExplicitSetting<boolean>("useCache");

      if (debounceDelay !== undefined) vsOptions.debounceDelay = debounceDelay;
      if (maxPromptTokens !== undefined) vsOptions.maxPromptTokens = maxPromptTokens;
      if (multilineCompletions !== undefined) vsOptions.multilineCompletions = multilineCompletions;
      if (modelTimeout !== undefined) vsOptions.modelTimeout = modelTimeout;
      if (useCache !== undefined) vsOptions.useCache = useCache;

      const options = { ...DEFAULT_AUTOCOMPLETE_OPTS, ...raw.options, ...vsOptions };

      log(`[Config] LLM created: ${llm.providerName}/${llm.model}, supportsFim=${llm.supportsFim()}`);

      this.config = {
        config: {
          selectedModelByRole: {
            autocomplete: llm,
          },
          tabAutocompleteOptions: options as TabAutocompleteOptions,
          audit: raw.audit,
        },
        errors: [],
      };
    } catch (e: any) {
      log(`[Config] ERROR: ${e.message}`);
      this.config = {
        config: null,
        errors: [`Failed to load config: ${e.message}`],
      };
    }

    return this.config;
  }

  onUpdate(listener: (result: SimpleConfigResult) => void) {
    this.listeners.push(listener);
  }

  getCurrentConfig(): SimpleConfigResult | null {
    return this.config;
  }

  async reload(): Promise<SimpleConfigResult> {
    const result = await this.loadConfig();
    for (const listener of this.listeners) {
      listener(result);
    }
    return result;
  }

  dispose() {
    this.watcher?.close();
    this.listeners = [];
  }
}
