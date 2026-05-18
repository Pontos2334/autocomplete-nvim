import * as readline from "node:readline";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

export class JsonRpcTransport {
  private rl: readline.Interface | null = null;
  private handler: ((request: JsonRpcRequest) => Promise<JsonRpcResponse>) | null = null;
  private closeHandler: (() => void) | null = null;
  private generation = 0;

  onMessage(
    handler: (request: JsonRpcRequest) => Promise<JsonRpcResponse>
  ): void {
    this.handler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  start(inputStream: NodeJS.ReadableStream = process.stdin, outputStream: NodeJS.WritableStream = process.stdout): void {
    const generation = ++this.generation;
    this.rl = readline.createInterface({ input: inputStream });

    this.rl.on("close", () => {
      if (this.generation !== generation) {
        return;
      }
      this.rl = null;
      this.closeHandler?.();
    });

    this.rl.on("line", async (line: string) => {
      if (!this.handler) return;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line);
      } catch {
        this.send(
          {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          },
          outputStream
        );
        return;
      }

      try {
        const response = await this.handler(request);
        this.send(response, outputStream);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Internal error";
        this.send(
          {
            jsonrpc: "2.0",
            id: request.id ?? null,
            error: { code: -32603, message },
          },
          outputStream
        );
      }
    });
  }

  send(response: JsonRpcResponse, outputStream: NodeJS.WritableStream = process.stdout): void {
    outputStream.write(JSON.stringify(response) + "\n");
  }

  stop(): void {
    if (this.rl) {
      const rl = this.rl;
      this.rl = null;
      rl.close();
    }
  }
}
