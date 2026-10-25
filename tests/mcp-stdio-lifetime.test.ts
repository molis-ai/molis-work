import assert from "node:assert/strict";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { serveMcpStdio } from "@molis-ai/molis-work-app-mcp";

const rpc = (id: number) => JSON.stringify({ jsonrpc: "2.0", id, method: "tools/list" }) + "\n";
const cancel = (requestId: number) => JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } }) + "\n";

test("RAC-628: stdio observes a matching cancellation while awaiting IO and still dispatches the next request serially", async () => {
  const input = new PassThrough(), output = new PassThrough();
  const seen: unknown[] = [];
  let enter!: () => void, aborted!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const cancelled = new Promise<void>(resolve => { aborted = resolve; });
  const serving = serveMcpStdio({ input, output, async handleMessage(message, signal) {
    seen.push(message.id);
    if (message.id === 1) {
      enter();
      await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => { aborted(); reject(signal!.reason); }, { once: true }));
    }
    return { jsonrpc: "2.0", id: message.id, result: {} };
  } });
  try {
    input.write(rpc(1)); await entered;
    input.write(cancel(99)); assert.deepEqual(seen, [1]);
    input.write(rpc(2)); input.write(cancel(1)); await cancelled;
    const [chunk] = await once(output, "data");
    assert.equal(JSON.parse(String(chunk)).id, 2);
    assert.deepEqual(seen, [1, 2]);
  } finally { input.end(); await serving; output.destroy(); }
});

test("RAC-628: EOF aborts active IO and drops queued effects before they dispatch", async () => {
  const input = new PassThrough(), output = new PassThrough();
  const seen: unknown[] = [];
  let enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const serving = serveMcpStdio({ input, output, async handleMessage(message, signal) {
    seen.push(message.id); enter();
    await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
    return null;
  } });
  input.write(rpc(1)); await entered; input.write(rpc(2)); input.end(); await serving;
  assert.deepEqual(seen, [1]); assert.equal(output.readableLength, 0); output.destroy();
});

test("RAC-625 RAC-628: invalid protocol requests never dispatch and a bounded pending queue fails closed", async () => {
  const input = new PassThrough(), output = new PassThrough();
  let calls = 0, enter!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  output.resume();
  const serving = serveMcpStdio({ input, output, async handleMessage(_message, signal) {
    calls++; enter();
    await new Promise<void>((_resolve, reject) => signal!.addEventListener("abort", () => reject(signal!.reason), { once: true }));
    return null;
  } });
  const rejected = assert.rejects(serving, /pending request limit/);
  input.write('{"jsonrpc":"2.0","method":"tools/list"}\n');
  input.write('{"jsonrpc":"invalid","id":2,"method":"tools/list"}\n');
  input.write(rpc(1)); await entered;
  for (let id = 2; id < 40; id++) input.write(rpc(id));
  await rejected; assert.equal(calls, 1); input.destroy(); output.destroy();
});
