import * as fs from "node:fs";
import * as http from "node:http";
import type { IAuditStore, AuditListQuery } from "./types.js";
import { DASHBOARD_HTML } from "./dashboard.js";

export interface AuditServerOptions {
  configPath: string;
}

export function startAuditServer(store: IAuditStore, port: number, opts?: AuditServerOptions): Promise<{ server: http.Server; actualPort: number }> {
  const configPath = opts?.configPath || "";

  function readAutocompleteConfig() {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw);
  }

  function isDeepSeek(apiBase: string) {
    try { return new URL(apiBase).host === "api.deepseek.com"; } catch { return false; }
  }

  function getFimEndpoint(apiBase: string) {
    const base = apiBase.endsWith("/") ? apiBase : apiBase + "/";
    return isDeepSeek(apiBase) ? new URL("completions", base) : new URL("fim/completions", base);
  }

  async function handleFimDemo(req: http.IncomingMessage, res: http.ServerResponse) {
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());
    res.on("close", () => { if (!res.writableEnded) controller.abort(); });

    try {
      const config = readAutocompleteConfig();
      const mc = config.model;
      const body = await readBody(req);
      const prefix = typeof body.prefix === "string" ? body.prefix : "";
      const suffix = typeof body.suffix === "string" ? body.suffix : "";
      const maxTokens = Math.max(1, Math.min(Number(body.maxTokens) || Number(body.max_tokens) || 128, 4096));
      const temperature = body.temperature === undefined ? 0.01 : Number(body.temperature);
      const stop = body.stop ? (Array.isArray(body.stop) ? body.stop : [String(body.stop)]) : undefined;
      const endpoint = getFimEndpoint(mc.apiBase);

      const payload = {
        model: mc.model,
        prompt: prefix,
        suffix,
        max_tokens: maxTokens,
        temperature: Number.isFinite(temperature) ? temperature : 0.01,
        stop,
        stream: true,
      };

      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      });

      res.write(JSON.stringify({ type: "meta", model: mc.model, provider: mc.provider, apiBase: mc.apiBase, endpoint: endpoint.toString(), promptChars: prefix.length, suffixChars: suffix.length }) + "\n");

      const upstreamResp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-api-key": mc.apiKey ?? "",
          Authorization: "Bearer " + (mc.apiKey ?? ""),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!upstreamResp.ok) {
        const text = await upstreamResp.text();
        res.write(JSON.stringify({ type: "error", status: upstreamResp.status, message: "FIM 请求失败: " + upstreamResp.status + " " + text.slice(0, 500) }) + "\n");
        res.end();
        return;
      }

      const reader = (upstreamResp.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const choice = parsed?.choices?.[0];
            const text = choice?.text ?? choice?.delta?.content ?? choice?.message?.content ?? "";
            if (text) res.write(JSON.stringify({ type: "chunk", text }) + "\n");
          } catch { /* skip */ }
        }
      }

      res.write(JSON.stringify({ type: "done" }) + "\n");
      res.end();
    } catch (err: any) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: err.message });
      } else if (err.name !== "AbortError") {
        res.write(JSON.stringify({ type: "error", message: err.message }) + "\n");
        res.end();
      }
    }
  }

  async function readBody(req: http.IncomingMessage): Promise<any> {
    let body = "";
    for await (const chunk of req) {
      body += chunk as string;
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw new Error("请求体过大");
    }
    return body ? JSON.parse(body) : {};
  }

  function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname === "/audit" && req.method === "GET") {
        serveDashboard(res);
      } else if (pathname === "/audit/api/records" && req.method === "GET") {
        serveRecordList(store, url, res);
      } else if (pathname.startsWith("/audit/api/records/") && req.method === "GET") {
        serveRecordDetail(store, decodeURIComponent(pathname.slice("/audit/api/records/".length)), res);
      } else if (pathname === "/audit/api/records" && req.method === "DELETE") {
        store.clear();
        sendJson(res, 200, { ok: true });
      } else if (pathname === "/audit/api/events" && req.method === "GET") {
        serveSSE(store, req, res);
      } else if (pathname === "/audit/api/stats" && req.method === "GET") {
        serveStats(store, res);
      } else if (pathname === "/audit/api/demo/config" && req.method === "GET") {
        serveDemoConfig(res);
      } else if (pathname === "/audit/api/demo/fim" && req.method === "POST") {
        handleFimDemo(req, res);
      } else {
        sendJson(res, 404, { error: "Not found" });
      }
    } catch (e: any) {
      sendJson(res, 500, { error: e.message });
    }
  }

  function serveDemoConfig(res: http.ServerResponse) {
    try {
      const config = readAutocompleteConfig();
      const model = config.model;
      sendJson(res, 200, {
        provider: model.provider,
        model: model.model,
        apiBase: model.apiBase,
        hasApiKey: Boolean(model.apiKey),
        configPath,
      });
    } catch (err: any) {
      sendJson(res, 500, { error: err.message, configPath });
    }
  }

  const server = http.createServer(handleRequest);

  return new Promise((resolve, reject) => {
    function tryListen(p: number, attempts: number) {
      server.listen(p, "127.0.0.1", () => {
        resolve({ server, actualPort: p });
      });
      server.on("error", (err: any) => {
        if (err.code === "EADDRINUSE" && attempts > 0) {
          server.removeAllListeners("error");
          server.removeAllListeners("listening");
          tryListen(p + 1, attempts - 1);
        } else {
          reject(err);
        }
      });
    }
    tryListen(port, 5);
  });
}

function serveDashboard(res: http.ServerResponse) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(DASHBOARD_HTML);
}

function serveRecordList(store: IAuditStore, url: URL, res: http.ServerResponse) {
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0"));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50")));
  const status = url.searchParams.get("status") || undefined;
  const query: AuditListQuery = { offset, limit, status: status as any };
  const result = store.listSummary(query);
  sendJson(res, 200, result);
}

function serveRecordDetail(store: IAuditStore, id: string, res: http.ServerResponse) {
  const record = store.get(id);
  if (!record) { sendJson(res, 404, { error: "Not found" }); return; }
  sendJson(res, 200, record);
}

function serveStats(store: IAuditStore, res: http.ServerResponse) {
  const all = store.list({ limit: 10000 });
  const records = all.records;
  const completed = records.filter((r: any) => r.status === "completed");
  const avgDuration = completed.length > 0
    ? Math.round(completed.reduce((s: number, r: any) => s + (r.durationMs || 0), 0) / completed.length)
    : 0;
  const cacheHits = records.filter((r: any) => r.cacheHit).length;
  sendJson(res, 200, {
    total: all.total,
    completed: completed.length,
    filtered: records.filter((r: any) => r.status === "filtered").length,
    errors: records.filter((r: any) => r.status === "error").length,
    avgDurationMs: avgDuration,
    cacheHitRate: all.total > 0 ? Math.round(cacheHits / all.total * 100) : 0,
  });
}

function serveSSE(store: IAuditStore, req: http.IncomingMessage, res: http.ServerResponse) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("data: " + JSON.stringify({ type: "connected" }) + "\n\n");

  const onRecord = (record: any) => {
    try {
      res.write("data: " + JSON.stringify({ type: "audit.record_completed", record }) + "\n\n");
    } catch {
      store.unsubscribe(onRecord);
    }
  };

  store.subscribe(onRecord);
  req.on("close", () => { store.unsubscribe(onRecord); });
}

function sendJson(res: http.ServerResponse, status: number, data: any) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function stopAuditServer(server: http.Server | null) {
  return new Promise<void>((resolve) => {
    if (!server) { resolve(); return; }
    server.close(() => resolve());
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
  });
}
