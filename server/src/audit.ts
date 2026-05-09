import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import type { AuditConfig, AuditInfoResult, AuditRecord } from "./types.js";

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>autocomplete.nvim audit</title>
<style>
body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2430;background:#f7f8fb}
header{height:48px;display:flex;align-items:center;gap:16px;padding:0 18px;border-bottom:1px solid #dfe3eb;background:#fff}
main{display:grid;grid-template-columns:360px 1fr;height:calc(100vh - 49px)}
aside{border-right:1px solid #dfe3eb;background:#fff;overflow:auto}
section{overflow:auto;padding:16px}
button,select{border:1px solid #cfd5df;background:#fff;border-radius:6px;padding:6px 10px}
.record{padding:10px 12px;border-bottom:1px solid #edf0f5;cursor:pointer}
.record:hover{background:#f2f5fb}.record.active{background:#e9efff}
.meta{color:#697386;font-size:12px}.status{font-weight:700}.completed{color:#16834a}.filtered{color:#a66500}.error{color:#c62828}.cancelled{color:#596579}
pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #dfe3eb;border-radius:8px;padding:12px;overflow:auto}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.tile{background:#fff;border:1px solid #dfe3eb;border-radius:8px;padding:10px}.tile strong{display:block;font-size:20px}
h2{margin:0 0 12px}h3{margin:18px 0 8px}
</style>
</head>
<body>
<header><strong>autocomplete.nvim audit</strong><span id="info" class="meta"></span><button id="refresh">Refresh</button><button id="clear">Clear</button><select id="status"><option value="all">all</option><option>completed</option><option>filtered</option><option>error</option><option>cancelled</option><option>pending</option></select></header>
<main><aside id="list"></aside><section><div id="stats" class="grid"></div><div id="detail"><h2>No record selected</h2></div></section></main>
<script>
const listEl=document.getElementById('list'),detailEl=document.getElementById('detail'),statsEl=document.getElementById('stats'),statusEl=document.getElementById('status');
let selected=null;
function esc(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
async function loadStats(){const s=await fetch('/audit/api/stats').then(r=>r.json());statsEl.innerHTML=Object.entries(s).map(([k,v])=>'<div class="tile"><span class="meta">'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')}
async function loadList(){const status=statusEl.value;const data=await fetch('/audit/api/records?limit=100&status='+encodeURIComponent(status)).then(r=>r.json());listEl.innerHTML=data.records.map(r=>'<div class="record '+(r.id===selected?'active':'')+'" data-id="'+esc(r.id)+'"><div><span class="status '+esc(r.status)+'">'+esc(r.status)+'</span> '+esc(r.filename||r.filepath)+'</div><div class="meta">'+esc(new Date(r.receivedAt).toLocaleTimeString())+' line '+esc(r.line)+':'+esc(r.character)+' '+esc(r.durationMs??'')+'ms</div><div class="meta">'+esc(r.filterReason||r.modelName||'')+'</div></div>').join('');}
async function loadDetail(id){selected=id;await loadList();const r=await fetch('/audit/api/records/'+encodeURIComponent(id)).then(r=>r.json());detailEl.innerHTML='<h2>'+esc(r.filename||r.filepath)+'</h2><div class="meta">'+esc(r.status)+' '+esc(r.durationMs??'')+'ms '+esc(r.modelProvider)+'/'+esc(r.modelName)+'</div><h3>Displayed</h3><pre>'+esc(r.displayedCompletion||'')+'</pre><h3>Prompt prefix</h3><pre>'+esc(r.prefix||'')+'</pre><h3>Suffix</h3><pre>'+esc(r.suffix||'')+'</pre><h3>Raw completion</h3><pre>'+esc(r.completion||'')+'</pre><h3>Timing</h3><pre>'+esc(JSON.stringify(r.timing,null,2))+'</pre>'}
listEl.onclick=e=>{const row=e.target.closest('.record');if(row)loadDetail(row.dataset.id)}
document.getElementById('refresh').onclick=()=>{loadStats();loadList()}
document.getElementById('clear').onclick=async()=>{await fetch('/audit/api/records',{method:'DELETE'});selected=null;detailEl.innerHTML='<h2>No record selected</h2>';loadStats();loadList()}
statusEl.onchange=loadList;
loadStats();loadList();
const es=new EventSource('/audit/api/events');es.onmessage=e=>{loadStats();loadList()}
</script>
</body>
</html>`;

interface AuditStore {
  storageType: "sqlite" | "memory";
  dbPath: string | null;
  startRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): void;
  updateRecord(id: string, updates: Partial<AuditRecord>): void;
  get(id: string): AuditRecord | undefined;
  list(query: { status?: string; offset?: number; limit?: number }): { records: AuditRecord[]; total: number };
  clear(): void;
  close(): void;
}

class MemoryAuditStore implements AuditStore {
  storageType = "memory" as const;
  dbPath = null;
  private records = new Map<string, AuditRecord>();
  constructor(private readonly maxRecords: number) {}

  startRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): void {
    this.records.set(record.id, defaultRecord(record));
    this.prune();
  }

  updateRecord(id: string, updates: Partial<AuditRecord>): void {
    const current = this.records.get(id);
    if (!current) return;
    this.records.set(id, mergeRecord(current, updates));
  }

  get(id: string): AuditRecord | undefined {
    return this.records.get(id);
  }

  list(query: { status?: string; offset?: number; limit?: number }): { records: AuditRecord[]; total: number } {
    const all = [...this.records.values()]
      .filter((r) => !query.status || query.status === "all" || r.status === query.status)
      .sort((a, b) => b.receivedAt - a.receivedAt);
    return { records: all.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50)), total: all.length };
  }

  clear(): void {
    this.records.clear();
  }

  close(): void {}

  private prune(): void {
    const records = [...this.records.values()].sort((a, b) => b.receivedAt - a.receivedAt);
    for (const record of records.slice(this.maxRecords)) this.records.delete(record.id);
  }
}

class SqliteAuditStore implements AuditStore {
  storageType = "sqlite" as const;
  private db: any;
  constructor(public dbPath: string, private readonly maxRecords: number) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const sqlite = require("node:sqlite") as any;
    this.db = new sqlite.DatabaseSync(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_records (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, record TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_received_at ON audit_records(received_at DESC);`);
  }

  startRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): void {
    const full = defaultRecord(record);
    this.db.prepare("INSERT OR REPLACE INTO audit_records (id, received_at, record) VALUES (?, ?, ?)").run(full.id, full.receivedAt, JSON.stringify(full));
    this.prune();
  }

  updateRecord(id: string, updates: Partial<AuditRecord>): void {
    const current = this.get(id);
    if (!current) return;
    const next = mergeRecord(current, updates);
    this.db.prepare("UPDATE audit_records SET received_at = ?, record = ? WHERE id = ?").run(next.receivedAt, JSON.stringify(next), id);
  }

  get(id: string): AuditRecord | undefined {
    const row = this.db.prepare("SELECT record FROM audit_records WHERE id = ?").get(id);
    return row ? JSON.parse(row.record) : undefined;
  }

  list(query: { status?: string; offset?: number; limit?: number }): { records: AuditRecord[]; total: number } {
    const rows = this.db.prepare("SELECT record FROM audit_records ORDER BY received_at DESC").all();
    const filtered = rows.map((r: any) => JSON.parse(r.record) as AuditRecord)
      .filter((r: AuditRecord) => !query.status || query.status === "all" || r.status === query.status);
    return { records: filtered.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50)), total: filtered.length };
  }

  clear(): void {
    this.db.prepare("DELETE FROM audit_records").run();
  }

  close(): void {
    this.db.close();
  }

  private prune(): void {
    this.db.prepare("DELETE FROM audit_records WHERE id IN (SELECT id FROM audit_records ORDER BY received_at DESC LIMIT -1 OFFSET ?)").run(this.maxRecords);
  }
}

export class AuditManager {
  private store: AuditStore | null = null;
  private server: http.Server | null = null;
  private port = 0;
  private subscribers = new Set<(record: AuditRecord) => void>();

  constructor(private readonly config: AuditConfig) {}

  async init(): Promise<void> {
    if (!this.config.enabled) return;
    try {
      this.store = new SqliteAuditStore(this.config.dbPath, this.config.maxRecords);
    } catch {
      this.store = new MemoryAuditStore(this.config.maxRecords);
    }
    await this.startServer();
  }

  startRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): void {
    this.store?.startRecord(record);
  }

  updateRecord(id: string, updates: Partial<AuditRecord>): void {
    this.store?.updateRecord(id, updates);
    const record = this.store?.get(id);
    if (record && updates.status && updates.status !== "pending") {
      for (const cb of this.subscribers) cb(record);
    }
  }

  getInfo(): AuditInfoResult {
    const total = this.store?.list({ limit: 1 }).total ?? 0;
    return {
      enabled: Boolean(this.store),
      storageType: this.store?.storageType ?? "disabled",
      total,
      dbPath: this.store?.dbPath ?? null,
      url: this.port ? `http://127.0.0.1:${this.port}/audit` : null,
      port: this.port,
    };
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
    this.store?.close();
    this.store = null;
    this.port = 0;
  }

  private async startServer(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    await new Promise<void>((resolve, reject) => {
      const onError = (error: any) => {
        if (error.code === "EADDRINUSE") {
          this.server?.removeListener("error", onError);
          this.config.port += 1;
          this.server?.listen(this.config.port, "127.0.0.1");
          this.server?.on("error", onError);
        } else {
          reject(error);
        }
      };
      this.server!.on("error", onError);
      this.server!.listen(this.config.port, "127.0.0.1", () => {
        this.port = (this.server!.address() as AddressInfo).port;
        this.server!.removeListener("error", onError);
        resolve();
      });
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (url.pathname === "/audit") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(DASHBOARD_HTML);
      return;
    }
    if (url.pathname === "/audit/api/records" && req.method === "GET") {
      const result = this.store?.list({
        status: url.searchParams.get("status") ?? "all",
        offset: Number(url.searchParams.get("offset") ?? 0),
        limit: Number(url.searchParams.get("limit") ?? 50),
      }) ?? { records: [], total: 0 };
      sendJson(res, 200, result);
      return;
    }
    if (url.pathname === "/audit/api/records" && req.method === "DELETE") {
      this.store?.clear();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (url.pathname.startsWith("/audit/api/records/") && req.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/audit/api/records/".length));
      const record = this.store?.get(id);
      sendJson(res, record ? 200 : 404, record ?? { error: "Not found" });
      return;
    }
    if (url.pathname === "/audit/api/stats") {
      const all = this.store?.list({ limit: 1000 }).records ?? [];
      const completed = all.filter((r) => r.status === "completed");
      const avg = completed.length ? Math.round(completed.reduce((sum, r) => sum + (r.durationMs ?? 0), 0) / completed.length) : 0;
      sendJson(res, 200, {
        total: all.length,
        completed: completed.length,
        filtered: all.filter((r) => r.status === "filtered").length,
        errors: all.filter((r) => r.status === "error").length,
        avgDurationMs: avg,
      });
      return;
    }
    if (url.pathname === "/audit/api/events") {
      this.serveEvents(req, res);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  }

  private serveEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
    const cb = (record: AuditRecord) => res.write(`data: ${JSON.stringify({ type: "record", record })}\n\n`);
    this.subscribers.add(cb);
    req.on("close", () => this.subscribers.delete(cb));
  }
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function defaultRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): AuditRecord {
  return {
    ...record,
    id: record.id,
    status: record.status ?? "pending",
    receivedAt: record.receivedAt,
    filepath: record.filepath ?? "",
    filename: record.filename ?? "",
    language: record.language ?? "",
    line: record.line ?? 0,
    character: record.character ?? 0,
    prefix: record.prefix ?? "",
    suffix: record.suffix ?? "",
    prompt: record.prompt ?? "",
    completion: record.completion ?? "",
    modelProvider: record.modelProvider ?? "",
    modelName: record.modelName ?? "",
    apiBase: record.apiBase ?? "",
    completionOptions: record.completionOptions ?? {},
    isMultiline: record.isMultiline ?? false,
    manuallyTriggered: record.manuallyTriggered ?? false,
    cacheHit: record.cacheHit ?? false,
    numLines: record.numLines ?? 0,
    previewOnly: record.previewOnly ?? false,
    timedOut: record.timedOut ?? false,
    chunkCount: record.chunkCount ?? 0,
    timing: record.timing ?? { requestStartAt: record.receivedAt },
  };
}

function mergeRecord(current: AuditRecord, updates: Partial<AuditRecord>): AuditRecord {
  return {
    ...current,
    ...updates,
    timing: { ...current.timing, ...(updates.timing ?? {}) },
    snippetSummary: { ...(current.snippetSummary ?? {}), ...(updates.snippetSummary ?? {}) },
  };
}
