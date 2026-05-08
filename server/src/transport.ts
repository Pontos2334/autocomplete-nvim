import * as readline from "node:readline";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

export class JsonRpcTransport {
  private rl: readline.Interface | null = null;
  private handler: ((request: JsonRpcRequest) => Promise<JsonRpcResponse>) | null = null;

  onMessage(
    handler: (request: JsonRpcRequest) => Promise<JsonRpcResponse>
  ): void {
    this.handler = handler;
  }

  start(inputStream: NodeJS.ReadableStream = process.stdin, outputStream: NodeJS.WritableStream = process.stdout): void {
    this.rl = readline.createInterface({ input: inputStream });

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
      this.rl.close();
      this.rl = null;
    }
  }
}
