import type { AuditRecord, AuditListQuery, IAuditStore } from "./types.js";

const SUMMARY_KEYS: ReadonlySet<string> = new Set([
  "id", "status", "receivedAt", "completedAt", "durationMs",
  "filepath", "filename", "language", "line", "character",
  "modelProvider", "modelName",
  "isMultiline", "manuallyTriggered", "cacheHit",
  "numLines", "previewOnly", "timedOut", "partialReturned",
  "reuseHit", "reuseReason", "chunkCount",
  "filterReason", "timing",
]);

function defaultRecord(partial: Partial<AuditRecord> & { id: string; receivedAt: number }): AuditRecord {
  return {
    status: "pending",
    filepath: "",
    filename: "",
    language: "",
    line: 0,
    character: 0,
    prefix: "",
    suffix: "",
    prompt: "",
    completion: "",
    modelProvider: "",
    modelName: "",
    apiBase: "",
    completionOptions: {},
    isMultiline: false,
    manuallyTriggered: false,
    cacheHit: false,
    numLines: 0,
    previewOnly: false,
    timedOut: false,
    partialReturned: false,
    reuseHit: false,
    chunkCount: 0,
    timing: { requestStartAt: partial.receivedAt },
    ...partial,
  };
}

export function createMemoryAuditStore(options: {
  ttlMs: number;
  maxRecords: number;
}): IAuditStore {
  const records = new Map<string, AuditRecord>();
  const subscribers: Array<(record: AuditRecord) => void> = [];

  function prune() {
    const cutoff = Date.now() - options.ttlMs;
    for (const [id, record] of records) {
      if (record.completedAt && record.completedAt < cutoff) {
        records.delete(id);
      }
    }
    if (records.size > options.maxRecords) {
      const excess = records.size - options.maxRecords;
      const sorted = [...records.entries()]
        .sort((a, b) => a[1].receivedAt - b[1].receivedAt);
      for (let i = 0; i < excess; i++) {
        records.delete(sorted[i][0]);
      }
    }
  }

  function startRecord(partial: Partial<AuditRecord> & { id: string; receivedAt: number }) {
    prune();
    records.set(partial.id, defaultRecord(partial));
  }

  function updateRecord(id: string, updates: Partial<AuditRecord>) {
    const existing = records.get(id);
    if (!existing) return;

    if (updates.timing && existing.timing) {
      (updates as any).timing = { ...existing.timing, ...updates.timing };
    }
    if (updates.snippetSummary && existing.snippetSummary) {
      (updates as any).snippetSummary = { ...existing.snippetSummary, ...updates.snippetSummary };
    }

    Object.assign(existing, updates);

    if (updates.status && updates.status !== "pending") {
      notify(existing);
    }
  }

  function get(id: string): AuditRecord | undefined {
    return records.get(id);
  }

  function list(query: AuditListQuery): { records: AuditRecord[]; total: number } {
    prune();
    let items = [...records.values()];
    if (query.status && query.status !== "all") {
      items = items.filter((r) => r.status === query.status);
    }
    const total = items.length;
    items.sort((a, b) => b.receivedAt - a.receivedAt);
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    return { records: items.slice(offset, offset + limit), total };
  }

  function listSummary(query: AuditListQuery): { records: any[]; total: number } {
    const { records: fullRecords, total } = list(query);
    const summarized = fullRecords.map((record) => {
      const summary: any = {};
      for (const key of SUMMARY_KEYS) {
        if ((record as any)[key] !== undefined) {
          summary[key] = (record as any)[key];
        }
      }
      return summary;
    });
    return { records: summarized, total };
  }

  function clear() {
    records.clear();
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
    records.clear();
    subscribers.length = 0;
  }

  return { startRecord, updateRecord, get, list, listSummary, clear, subscribe, unsubscribe, close };
}
