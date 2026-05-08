import type { AuditConfig, IAuditContext, IAuditStore, AuditRecord } from "./types";
import { createAuditStore } from "./store";
import { startAuditServer, stopAuditServer } from "./server";

let store: IAuditStore | null = null;
let server: any = null;
let actualPort = 0;

export function getAuditPort(): number {
  return actualPort;
}

export function initAudit(
  config: AuditConfig & { dbPath: string; configPath: string },
  log?: (msg: string) => void,
): IAuditContext | null {
  const _log = log || ((msg: string) => console.log("[Audit]", msg));

  const auditStore = createAuditStore({
    dbPath: config.dbPath,
    ttlMs: config.ttlMs ?? 1_800_000,
    maxRecords: config.maxRecords ?? 500,
  });

  if (!auditStore) {
    _log("Audit disabled: node:sqlite not available (requires Node 22.5+)");
    return null;
  }

  store = auditStore;

  const port = config.port ?? 3210;

  startAuditServer(store, port, { configPath: config.configPath }).then((result) => {
    server = result.server;
    actualPort = result.actualPort;
    _log("Audit dashboard: http://127.0.0.1:" + actualPort + "/audit");
  }).catch((e: any) => {
    _log("Audit server failed to start: " + e.message);
  });

  const ctx: IAuditContext = {
    startRecord(partial) {
      try { store!.startRecord(partial); } catch { /* ignore */ }
    },
    updateRecord(id, updates) {
      try { store!.updateRecord(id, updates); } catch { /* ignore */ }
    },
    completeRecord(id, outcome) {
      try {
        const updates = {
          ...outcome,
          status: outcome.status || "completed",
          completedAt: outcome.completedAt || Date.now(),
          durationMs: outcome.durationMs ?? (outcome.timing as any)?.completedAt
            ? (outcome.timing as any).completedAt - (outcome.timing as any).requestStartAt
            : undefined,
        };
        store!.updateRecord(id, updates);
      } catch { /* ignore */ }
    },
  };

  return ctx;
}

export async function disposeAudit() {
  if (server) {
    await stopAuditServer(server);
    server = null;
  }
  if (store) {
    store.close();
    store = null;
  }
  actualPort = 0;
}
