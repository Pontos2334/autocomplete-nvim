export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface CodeSnippet {
  filepath: string;
  content: string;
}

export interface RecentlyEditedRange {
  filepath: string;
  range: Range;
  timestamp: number;
  lines: string[];
}

export type MultilineMode = "auto" | "always" | "never";

export interface AutocompleteOptions {
  debounceDelay: number;
  maxPromptTokens: number;
  prefixPercentage: number;
  maxSuffixPercentage: number;
  modelTimeout: number;
  multilineCompletions: MultilineMode;
  useCache: boolean;
  disable: boolean;
  disableInFiles?: string[];
  onlyMyCode: boolean;
  useImports: boolean;
  useRecentlyEdited: boolean;
  useRecentlyOpened: boolean;
  transform: boolean;
  maxTokens: number;
  temperature: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

export interface ModelConfig {
  title?: string;
  provider: string;
  model: string;
  apiBase: string;
  apiKey: string;
  [key: string]: unknown;
}

export interface AuditConfig {
  enabled: boolean;
  port: number;
  ttlMs: number;
  maxRecords: number;
  dbPath: string;
}

export interface AppConfig {
  configPath: string;
  model: ModelConfig;
  options: AutocompleteOptions;
  audit: AuditConfig;
}

export interface CompletionRequest {
  completionId?: string;
  filepath: string;
  text: string;
  pos: Position;
  workspaceDirs?: string[];
  recentlyVisitedRanges?: CodeSnippet[];
  recentlyEditedRanges?: RecentlyEditedRange[];
  lspSnippets?: CodeSnippet[];
  manuallyTriggered?: boolean;
  isUntitledFile?: boolean;
}

export interface CompletionResult {
  completionId: string;
  completion: string;
  range: Range;
  isMultiline: boolean;
  cacheHit: boolean;
  timedOut: boolean;
  latencyMs: number;
  modelProvider: string;
  modelName: string;
}

export interface AuditInfoResult {
  enabled: boolean;
  storageType: "sqlite" | "memory" | "disabled";
  total: number;
  dbPath: string | null;
  url: string | null;
  port: number;
}

export type AuditStatus = "pending" | "completed" | "filtered" | "error" | "cancelled";

export interface AuditRecord {
  id: string;
  status: AuditStatus;
  receivedAt: number;
  completedAt?: number;
  durationMs?: number;
  filepath: string;
  filename: string;
  language: string;
  line: number;
  character: number;
  prefix: string;
  suffix: string;
  prompt: string;
  completion: string;
  processedCompletion?: string;
  displayedCompletion?: string;
  modelProvider: string;
  modelName: string;
  apiBase: string;
  completionOptions: Record<string, unknown>;
  isMultiline: boolean;
  manuallyTriggered: boolean;
  cacheHit: boolean;
  numLines: number;
  previewOnly: boolean;
  timedOut: boolean;
  chunkCount: number;
  filterReason?: string;
  error?: { type: string; message: string; httpStatus?: number };
  timing: Record<string, number>;
  snippetSummary?: Record<string, number>;
}
