import { loadConfig } from "./config.js";
import { JsonRpcTransport } from "./transport.js";
import { MethodHandler } from "./methods.js";
import { AuditManager } from "./audit/index.js";

export async function createDaemon(configPath?: string, onClose?: () => void): Promise<{
  transport: JsonRpcTransport;
  handler: MethodHandler;
  audit: AuditManager;
}> {
  const config = loadConfig(configPath);
  const auditConfig = { ...config.audit, configPath: config.configPath };
  const audit = new AuditManager(auditConfig);
  const handler = new MethodHandler(config, audit);
  const transport = new JsonRpcTransport();
  transport.onMessage((request) => handler.handle(request));
  if (onClose) {
    transport.onClose(onClose);
  }
  transport.start();
  await audit.init();
  return { transport, handler, audit };
}

export async function main(): Promise<void> {
  const configPathArg = process.argv.find((arg) => arg.startsWith("--config="));
  const configPath = configPathArg ? configPathArg.slice("--config=".length) : undefined;
  let transportRef: JsonRpcTransport | null = null;
  let auditRef: AuditManager | null = null;
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) {
      return;
    }
    cleaningUp = true;
    try {
      transportRef?.stop();
      await auditRef?.close();
    } catch (error: any) {
      process.stderr.write(`Cleanup failed: ${error?.message ?? String(error)}\n`);
    } finally {
      process.exit(0);
    }
  };
  const { transport, audit } = await createDaemon(configPath, () => {
    void cleanup();
  });
  transportRef = transport;
  auditRef = audit;
  process.on("SIGINT", () => {
    void cleanup();
  });
  process.on("SIGTERM", () => {
    void cleanup();
  });
  await new Promise(() => {});
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error?.message ?? String(error)}\n`);
  process.exit(1);
});
