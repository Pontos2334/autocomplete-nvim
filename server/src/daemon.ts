import { loadConfig } from "./config.js";
import { JsonRpcTransport } from "./transport.js";
import { MethodHandler } from "./methods.js";
import { AuditManager } from "./audit/index.js";

export async function createDaemon(configPath?: string): Promise<{
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
  transport.start();
  await audit.init();
  return { transport, handler, audit };
}

export async function main(): Promise<void> {
  const configPathArg = process.argv.find((arg) => arg.startsWith("--config="));
  const configPath = configPathArg ? configPathArg.slice("--config=".length) : undefined;
  const { transport, audit } = await createDaemon(configPath);
  const cleanup = async () => {
    transport.stop();
    await audit.close();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  await new Promise(() => {});
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error?.message ?? String(error)}\n`);
  process.exit(1);
});
