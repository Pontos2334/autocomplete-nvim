import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { once } from "node:events";

const { JsonRpcTransport } = await import("../dist/transport.js");

function makeOutput() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

test("JsonRpcTransport emits close when input ends", async () => {
  const transport = new JsonRpcTransport();
  const input = new PassThrough();
  const output = makeOutput();
  let closeCount = 0;

  transport.onClose(() => {
    closeCount += 1;
  });

  transport.start(input, output);
  input.end();
  await once(input, "end");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(closeCount, 1);
});

test("JsonRpcTransport stop emits close", async () => {
  const transport = new JsonRpcTransport();
  const input = new PassThrough();
  const output = makeOutput();
  let closeCount = 0;

  transport.onClose(() => {
    closeCount += 1;
  });

  transport.start(input, output);
  transport.stop();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(closeCount, 1);
});
