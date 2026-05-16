import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AppConfig, AutocompleteOptions } from "./types.js";

export const DEFAULT_OPTIONS: AutocompleteOptions = {
  debounceDelay: 350,
  maxPromptTokens: 4096,
  prefixPercentage: 0.3,
  maxSuffixPercentage: 0.2,
  modelTimeout: 55000,
  multilineCompletions: "auto",
  useCache: true,
  disable: false,
  onlyMyCode: true,
  useImports: true,
  useRecentlyEdited: true,
  useRecentlyOpened: true,
  transform: true,
  maxTokens: 256,
  temperature: 0.01,
  topP: 1,
  stop: ["<|end_of_sentence|>", "```"],
  showWhateverWeHaveAtMs: 0,
};

const DEFAULT_MODEL = {
  title: "DeepSeek FIM",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  apiBase: "https://api.deepseek.com/beta",
  apiKey: "",
};

const DEFAULT_AUDIT = {
  enabled: false,
  port: 3210,
  ttlMs: 1_800_000,
  maxRecords: 500,
};

function getDefaultConfigPath(): string {
  return path.join(os.homedir(), ".autocomplete-nvim", "config.json");
}

export function loadConfig(configPath?: string): AppConfig {
  const resolvedPath = configPath ?? getDefaultConfigPath();
  const configDir = path.dirname(resolvedPath);

  try {
    const raw = fs.readFileSync(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw) as any;
    const rawOptions = {
      ...(parsed.options ?? {}),
      ...(parsed.tabAutocompleteOptions ?? {}),
    };

    const model = {
      ...DEFAULT_MODEL,
      ...(parsed.model ?? {}),
      apiKey:
        parsed.model?.apiKey ??
        process.env.DEEPSEEK_API_KEY ??
        process.env.AUTOCOMPLETE_API_KEY ??
        "",
    };

    const options: AutocompleteOptions = {
      ...DEFAULT_OPTIONS,
      ...rawOptions,
      maxTokens:
        rawOptions.maxTokens ??
        rawOptions.max_tokens ??
        parsed.completionOptions?.maxTokens ??
        DEFAULT_OPTIONS.maxTokens,
      temperature:
        rawOptions.temperature ??
        parsed.completionOptions?.temperature ??
        DEFAULT_OPTIONS.temperature,
      topP:
        rawOptions.topP ??
        rawOptions.top_p ??
        parsed.completionOptions?.topP ??
        DEFAULT_OPTIONS.topP,
    };

    const audit = {
      ...DEFAULT_AUDIT,
      ...(parsed.audit ?? {}),
      dbPath:
        parsed.audit?.dbPath ??
        path.join(configDir, "audit-nvim.db"),
    };

    return {
      configPath: resolvedPath,
      model,
      options,
      audit,
    };
  } catch {
    return {
      configPath: resolvedPath,
      model: {
        ...DEFAULT_MODEL,
        apiKey:
          process.env.DEEPSEEK_API_KEY ??
          process.env.AUTOCOMPLETE_API_KEY ??
          "",
      },
      options: DEFAULT_OPTIONS,
      audit: {
        ...DEFAULT_AUDIT,
        dbPath: path.join(os.homedir(), ".autocomplete-nvim", "audit-nvim.db"),
      },
    };
  }
}

export function getDefaultConfig(): AppConfig {
  return loadConfig(getDefaultConfigPath());
}

export function getDefaultConfigPathExport(): string {
  return getDefaultConfigPath();
}
