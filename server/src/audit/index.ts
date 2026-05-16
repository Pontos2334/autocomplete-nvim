import type { AuditRecord, IAuditStore } from "./types.js";
import type { AuditInfoResult } from "../types.js";
import type { AuditConfig as AppAuditConfig } from "../types.js";
import { createAuditStore, isSqliteAvailable } from "./store.js";
import { createMemoryAuditStore } from "./memory-store.js";
import { startAuditServer, stopAuditServer } from "./server.js";

export class AuditManager {
  private store: IAuditStore | null = null;
  private server: any = null;
  private port = 0;
  private storageType: "sqlite" | "memory" | "disabled" = "disabled";

  constructor(private readonly config: AppAuditConfig) {}

  async init(): Promise<void> {
    if (!this.config.enabled) {
      this.storageType = "disabled";
      return;
    }

    if (isSqliteAvailable()) {
      this.store = createAuditStore({
        dbPath: this.config.dbPath,
        ttlMs: this.config.ttlMs ?? 1_800_000,
        maxRecords: this.config.maxRecords ?? 500,
      });
    }

    if (this.store) {
      this.storageType = "sqlite";
    } else {
      this.store = createMemoryAuditStore({
        ttlMs: this.config.ttlMs ?? 1_800_000,
        maxRecords: this.config.maxRecords ?? 500,
      });
      this.storageType = "memory";
    }

    try {
      const result = await startAuditServer(this.store, this.config.port ?? 3210, {
        configPath: this.config.configPath ?? "",
      });
      this.server = result.server;
      this.port = result.actualPort;
    } catch (e: any) {
      console.error("[Audit] server failed to start:", e.message);
    }
  }

  startRecord(record: Partial<AuditRecord> & { id: string; receivedAt: number }): void {
    try { this.store?.startRecord(record); } catch { /* ignore */ }
  }

  updateRecord(id: string, updates: Partial<AuditRecord>): void {
    try { this.store?.updateRecord(id, updates); } catch { /* ignore */ }
  }

  getInfo(): AuditInfoResult {
    const total = this.store?.list({ limit: 1 }).total ?? 0;
    return {
      enabled: this.storageType !== "disabled",
      storageType: this.storageType,
      total,
      dbPath: this.storageType === "sqlite" ? this.config.dbPath : null,
      url: this.port ? `http://127.0.0.1:${this.port}/audit` : null,
      port: this.port,
    };
  }

  async close(): Promise<void> {
    await stopAuditServer(this.server);
    this.server = null;
    this.store?.close();
    this.store = null;
    this.port = 0;
    this.storageType = "disabled";
  }
}
