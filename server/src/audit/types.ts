export type AuditStatus = "pending" | "completed" | "filtered" | "error" | "cancelled";

export interface AuditTiming {
  requestStartAt?: number;
  promptRenderedAt?: number;
  llmCallStartAt?: number;
  firstChunkAt?: number;
  llmCallEndAt?: number;
  completedAt?: number;
}

export interface AuditSnippetSummary {
  rootPath: number;
  imports: number;
  ide: number;
  edited: number;
  opened: number;
}

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

  completionOptions: any;
  isMultiline: boolean;
  manuallyTriggered: boolean;
  cacheHit: boolean;
  numLines: number;
  previewOnly: boolean;
  timedOut: boolean;
  partialReturned: boolean;
  reuseHit: boolean;
  reuseReason?: string;
  chunkCount: number;

  filterReason?: string;
  error?: { type: string; message: string; httpStatus?: number };

  timing: AuditTiming;
  snippetSummary?: AuditSnippetSummary;
}

export interface AuditListQuery {
  offset?: number;
  limit?: number;
  status?: AuditStatus | "all";
}

export interface AuditConfig {
  enabled: boolean;
  port?: number;
  ttlMs?: number;
  maxRecords?: number;
}

export interface IAuditContext {
  startRecord(partial: Partial<AuditRecord> & { id: string; receivedAt: number }): void;
  updateRecord(id: string, updates: Partial<AuditRecord>): void;
  completeRecord(id: string, outcome: Partial<AuditRecord>): void;
}

export interface IAuditStore {
  startRecord(partial: Partial<AuditRecord> & { id: string; receivedAt: number }): void;
  updateRecord(id: string, updates: Partial<AuditRecord>): void;
  get(id: string): AuditRecord | undefined;
  list(query: AuditListQuery): { records: AuditRecord[]; total: number };
  listSummary(query: AuditListQuery): { records: any[]; total: number };
  clear(): void;
  subscribe(cb: (record: AuditRecord) => void): void;
  unsubscribe(cb: (record: AuditRecord) => void): void;
  close(): void;
}
