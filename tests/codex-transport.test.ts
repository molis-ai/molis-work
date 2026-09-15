import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  CodexAppServerTransport,
  CodexAppServerTransportError,
} from "@molis-ai/molis-work-service-runtime-host";

const FAKE_APP_SERVER = `
const readline = require("node:readline");
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "initialize") {
    process.stdout.write(JSON.stringify({ id: message.id, result: { ready: true } }) + "\\n");
    return;
  }
  if (message.method === "oversized") {
    process.stdout.write(JSON.stringify({ id: message.id, result: "X".repeat(8_192) }) + "\\n");
    return;
  }
  process.stdout.write(JSON.stringify({ id: message.id, result: { method: message.method } }) + "\\n");
});
`;

const ORDERED_APP_SERVER = `
const readline = require("node:readline");
let ready = false;
readline.createInterface({ input: process.stdin }).on("line", line => {
  const m = JSON.parse(line);
  const reply = result => process.stdout.write(JSON.stringify({id:m.id,result}) + "\\n");
  if (m.method === "initialize") return setTimeout(() => reply({}), 60);
  if (m.method === "initialized") { ready = true; return; }
  if (m.method === "crash") return process.exit(12);
  if (m.method === "hang") return;
  if (m.method === "events") process.stdout.write(JSON.stringify({method:"changed",params:{text:"hello"}}) + "\\n");
  reply({ready, method:m.method});
});
`;

test("concurrent first requests wait for the same initialized transport", async () => {
  let starts = 0;
  const transport = new CodexAppServerTransport({
    command: process.execPath, args: ["-e", ORDERED_APP_SERVER],
    spawnProcess: ((...args: Parameters<typeof spawn>) => { starts++; return spawn(...args); }) as typeof spawn,
  });
  try {
    const results = await Promise.all([transport.request("first", {}), transport.request("second", {})]);
    assert.deepEqual(results, [{ready:true,method:"first"}, {ready:true,method:"second"}]);
    assert.equal(starts, 1);
  } finally { transport.close(); }
});

test("failed initialization kills its process and permits a clean retry", async () => {
  const children: ReturnType<typeof spawn>[] = [];
  const transport = new CodexAppServerTransport({
    requestTimeoutMs: 1_000,
    spawnProcess: (() => {
      const child = spawn(process.execPath, ["-e", children.length === 0
        ? 'process.stdin.resume()' : ORDERED_APP_SERVER], {stdio:["pipe","pipe","pipe"]});
      children.push(child);
      return child;
    }) as typeof spawn,
  });
  try {
    await assert.rejects(transport.request("first", {}), /initialize.*超时/);
    assert.equal(children[0]?.killed, true);
    assert.deepEqual(await transport.request("retry", {}), {ready:true,method:"retry"});
    assert.equal(children.length, 2);
  } finally { transport.close(); for (const child of children) child.kill(); }
});

test("transport streams and unsubscribes, recovers after crash, and rejects pending work on close", async () => {
  const transport = new CodexAppServerTransport({command:process.execPath,args:["-e",ORDERED_APP_SERVER]});
  const events: unknown[] = [];
  try {
    const unsubscribe = transport.subscribe(event => events.push(event));
    await transport.request("events", {});
    assert.deepEqual(events, [{method:"changed",params:{text:"hello"}}]);
    unsubscribe();
    await transport.request("events", {});
    assert.equal(events.length, 1);
    await assert.rejects(transport.request("crash", {}), /已退出/);
    assert.deepEqual(await transport.request("recovered", {}), {ready:true,method:"recovered"});
    const pending = transport.request("hang", {});
    const rejected = assert.rejects(pending, /已关闭/);
    await new Promise(resolve => setImmediate(resolve));
    transport.close();
    await rejected;
    await assert.rejects(transport.request("again", {}), /已关闭/);
  } finally { transport.close(); }
});

test("Codex transport bounds a JSONL response and restarts after rejecting the oversized request", async () => {
  const transport = new CodexAppServerTransport({
    command: process.execPath,
    args: ["-e", FAKE_APP_SERVER],
    maxResponseLineBytes: 1_024,
    requestTimeoutMs: 5_000,
  });
  try {
    await assert.rejects(
      transport.request("oversized", {}),
      (error: unknown) => {
        assert.ok(error instanceof CodexAppServerTransportError);
        assert.equal(error.code, "runtime.response_too_large");
        assert.match(error.message, /安全读取上限/);
        return true;
      },
    );

    const recovered = await transport.request("healthy", {});
    assert.deepEqual(recovered, { method: "healthy" });
  } finally {
    transport.close();
  }
});
