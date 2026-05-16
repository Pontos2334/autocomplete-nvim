import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditRecord, AuditListQuery, IAuditStore } from "./types.js";

let DatabaseSync: any;
try {
  const cjsRequire = createRequire(import.meta.url);
  const sqlite = cjsRequire("node:sqlite") as any;
  DatabaseSync = sqlite.DatabaseSync;
} catch {
  // node:sqlite not available
}

export function isSqliteAvailable(): boolean {
  return !!DatabaseSync;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_records (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  received_at INTEGER NOT NULL,
  completed_at INTEGER,
  duration_ms INTEGER,
  filepath TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  line INTEGER NOT NULL DEFAULT 0,
  character INTEGER NOT NULL DEFAULT 0,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  completion TEXT NOT NULL DEFAULT '',
  processed_completion TEXT,
  displayed_completion TEXT,
  model_provider TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  api_base TEXT NOT NULL DEFAULT '',
  completion_options TEXT,
  is_multiline INTEGER NOT NULL DEFAULT 0,
  manually_triggered INTEGER NOT NULL DEFAULT 0,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  num_lines INTEGER NOT NULL DEFAULT 0,
  preview_only INTEGER NOT NULL DEFAULT 0,
  timed_out INTEGER NOT NULL DEFAULT 0,
  partial_returned INTEGER NOT NULL DEFAULT 0,
  reuse_hit INTEGER NOT NULL DEFAULT 0,
  reuse_reason TEXT,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  filter_reason TEXT,
  error TEXT,
  timing TEXT NOT NULL DEFAULT '{}',
  snippet_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_received_at ON audit_records(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_status ON audit_records(status);
`;

const LIST_COLUMNS = [
  "id", "status", "received_at", "completed_at", "duration_ms",
  "filepath", "filename", "language", "line", "character",
  "model_provider", "model_name",
  "is_multiline", "manually_triggered", "cache_hit",
  "num_lines", "preview_only", "timed_out", "partial_returned",
  "reuse_hit", "reuse_reason", "chunk_count",
  "filter_reason", "timing",
].join(", ");

const JSON_FIELDS = [
  "timing", "snippetSummary", "completionOptions", "error",
  "prefix", "suffix", "prompt", "completion", "processedCompletion", "displayedCompletion",
];

function rowToRecord(row: Record<string, unknown>): AuditRecord {
  const r: any = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (JSON_FIELDS.includes(camelKey) && typeof v === "string") {
      try { r[camelKey] = JSON.parse(v); } catch { r[camelKey] = v; }
    } else if ((camelKey === "isMultiline" || camelKey === "manuallyTriggered" ||
                camelKey === "cacheHit" || camelKey === "previewOnly" ||
                camelKey === "timedOut" || camelKey === "partialReturned" ||
                camelKey === "reuseHit") && typeof v === "number") {
      r[camelKey] = !!v;
    } else {
      r[camelKey] = v;
    }
  }
  return r as AuditRecord;
}

export function createAuditStore(options: {
  dbPath: string;
  ttlMs: number;
  maxRecords: number;
}): IAuditStore | null {
  if (!DatabaseSync) return null;

  const dir = path.dirname(options.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(options.dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec(SCHEMA);
  ensureColumn(db, "partial_returned", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "reuse_hit", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "reuse_reason", "TEXT");

  const subscribers: Array<(record: AuditRecord) => void> = [];

  function prune() {
    const cutoff = Date.now() - options.ttlMs;
    db.prepare("DELETE FROM audit_records WHERE completed_at IS NOT NULL AND completed_at < ?").run(cutoff);

    const countRow = db.prepare("SELECT COUNT(*) as cnt FROM audit_records").get() as Record<string, unknown>;
    const excess = (countRow.cnt as number) - options.maxRecords;
    if (excess > 0) {
      db.prepare(
        "DELETE FROM audit_records WHERE id IN (SELECT id FROM audit_records ORDER BY received_at ASC LIMIT ?)"
      ).run(excess);
    }
  }

  function startRecord(partial: Partial<AuditRecord> & { id: string; receivedAt: number }) {
    prune();
    db.prepare(
      `INSERT INTO audit_records (id, status, received_at, filepath, filename, language, line, character, timing)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      partial.id,
      partial.receivedAt,
      partial.filepath ?? "",
      partial.filename ?? "",
      partial.language ?? "",
      partial.line ?? 0,
      partial.character ?? 0,
      JSON.stringify(partial.timing ?? { requestStartAt: partial.receivedAt }),
    );
  }

  function updateRecord(id: string, updates: Partial<AuditRecord>) {
    const sets: string[] = [];
    const values: any[] = [];

    const mergeFields = ["timing", "snippet_summary"];
    for (const mergeField of mergeFields) {
      const camelKey = mergeField.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if ((updates as any)[camelKey] !== undefined) {
        try {
          const existingRow = db.prepare("SELECT " + mergeField + " FROM audit_records WHERE id = ?").get(id) as Record<string, unknown> | undefined;
          const existing = existingRow?.[mergeField] ? JSON.parse(existingRow[mergeField] as string) : {};
          const incoming = (updates as any)[camelKey];
          (updates as any)[camelKey] = { ...existing, ...incoming };
        } catch {
          // keep original update value
        }
      }
    }

    const fieldMap: Record<string, { col: string; json?: boolean; bool?: boolean }> = {
      status: { col: "status" },
      completedAt: { col: "completed_at" },
      durationMs: { col: "duration_ms" },
      filepath: { col: "filepath" },
      filename: { col: "filename" },
      language: { col: "language" },
      line: { col: "line" },
      character: { col: "character" },
      prefix: { col: "prefix", json: true },
      suffix: { col: "suffix", json: true },
      prompt: { col: "prompt", json: true },
      completion: { col: "completion", json: true },
      processedCompletion: { col: "processed_completion", json: true },
      displayedCompletion: { col: "displayed_completion", json: true },
      modelProvider: { col: "model_provider" },
      modelName: { col: "model_name" },
      apiBase: { col: "api_base" },
      completionOptions: { col: "completion_options", json: true },
      isMultiline: { col: "is_multiline", bool: true },
      manuallyTriggered: { col: "manually_triggered", bool: true },
      cacheHit: { col: "cache_hit", bool: true },
      numLines: { col: "num_lines" },
      previewOnly: { col: "preview_only", bool: true },
      timedOut: { col: "timed_out", bool: true },
      partialReturned: { col: "partial_returned", bool: true },
      reuseHit: { col: "reuse_hit", bool: true },
      reuseReason: { col: "reuse_reason" },
      chunkCount: { col: "chunk_count" },
      filterReason: { col: "filter_reason" },
      error: { col: "error", json: true },
      timing: { col: "timing", json: true },
      snippetSummary: { col: "snippet_summary", json: true },
    };

    for (const [key, mapping] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        sets.push(`${mapping.col} = ?`);
        let val = (updates as any)[key];
        if (mapping.json) val = JSON.stringify(val);
        if (mapping.bool) val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (sets.length === 0) return;
    values.push(id);
    db.prepare(`UPDATE audit_records SET ${sets.join(", ")} WHERE id = ?`).run(...values);

    if (updates.status && updates.status !== "pending") {
      const record = get(id);
      if (record) notify(record);
    }
  }

  function get(id: string): AuditRecord | undefined {
    const row = db.prepare("SELECT * FROM audit_records WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToRecord(row) : undefined;
  }

  function list(query: AuditListQuery): { records: AuditRecord[]; total: number } {
    prune();
    let where = "";
    if (query.status && query.status !== "all") {
      where = `WHERE status = '${query.status}'`;
    }
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM audit_records ${where}`).get() as Record<string, unknown>;
    const total = countRow.cnt as number;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const rows = db.prepare(
      `SELECT * FROM audit_records ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as Record<string, unknown>[];
    return { records: rows.map(rowToRecord), total };
  }

  function listSummary(query: AuditListQuery): { records: any[]; total: number } {
    prune();
    let where = "";
    if (query.status && query.status !== "all") {
      where = `WHERE status = '${query.status}'`;
    }
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM audit_records ${where}`).get() as Record<string, unknown>;
    const total = countRow.cnt as number;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const rows = db.prepare(
      `SELECT ${LIST_COLUMNS} FROM audit_records ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as Record<string, unknown>[];
    return { records: rows.map(rowToRecord), total };
  }

  function clear() {
    db.prepare("DELETE FROM audit_records").run();
  }

  function subscribe(cb: (record: AuditRecord) => void) {
    subscribers.push(cb);
  }

  function unsubscribe(cb: (record: AuditRecord) => void) {
    const idx = subscribers.indexOf(cb);
    if (idx >= 0) subscribers.splice(idx, 1);
  }

  function notify(record: AuditRecord) {
    for (const cb of subscribers) {
      try { cb(record); } catch { unsubscribe(cb); }
    }
  }

  function close() {
    try { db.close(); } catch { /* ignore */ }
  }

  return { startRecord, updateRecord, get, list, listSummary, clear, subscribe, unsubscribe, close };
}

function ensureColumn(db: any, column: string, definition: string): void {
  const rows = db.prepare("PRAGMA table_info(audit_records)").all() as Array<{
    name: string;
  }>;
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE audit_records ADD COLUMN ${column} ${definition}`);
  }
}
