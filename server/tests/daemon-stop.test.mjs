import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to acquire port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForAudit(port) {
  const url = `http://127.0.0.1:${port}/audit`;
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`audit server did not become ready: ${url}`);
}

test("daemon exits promptly when stdin closes, even with an SSE client", async () => {
  const port = await getFreePort();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "autocomplete-nvim-"));
  const configPath = path.join(tempDir, "config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify({
      model: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        apiBase: "https://api.deepseek.com/beta",
        apiKey: "test-key",
      },
      audit: {
        enabled: true,
        port,
      },
    }),
  );

  const daemonPath = fileURLToPath(new URL("../dist/daemon.js", import.meta.url));
  const child = spawn(process.execPath, [daemonPath, `--config=${configPath}`], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.resume();
  child.stderr.resume();

  try {
    await waitForAudit(port);

    const req = http.get(`http://127.0.0.1:${port}/audit/api/events`, {
      headers: {
        Accept: "text/event-stream",
      },
    });
    const [res] = await once(req, "response");
    res.on("data", () => {});

    child.stdin.end();

    const exitPromise = once(child, "exit");
    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("daemon did not exit after stdin closed")), 2000);
      timer.unref();
    });
    const [code] = await Promise.race([exitPromise, timeoutPromise]);
    assert.equal(code, 0);

    req.destroy();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
});
