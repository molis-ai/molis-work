import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import {
  CodexAppServerTransport,
  CodexAppServerTransportError,
} from "@molis-ai/molis-work-service-runtime-host";

// The transport announces the version its host gives it; the product version is the Host's (apps/local-host/src/product-version.ts).
const CLIENT_VERSION = "9.8.7-test";

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
    clientVersion: CLIENT_VERSION,
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
    clientVersion: CLIENT_VERSION,
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
  const transport = new CodexAppServerTransport({clientVersion:CLIENT_VERSION,command:process.execPath,args:["-e",ORDERED_APP_SERVER]});
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
    clientVersion: CLIENT_VERSION,
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

const ECHO_INITIALIZE_APP_SERVER = `
const readline = require("node:readline");
let initializeParams = null;
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.method === "initialized") return;
  if (message.method === "initialize") initializeParams = message.params;
  process.stdout.write(JSON.stringify({ id: message.id, result: { initialize: initializeParams } }) + "\\n");
});
`;

test("the client version Codex is told is the one the host gave the transport", async () => {
  const transport = new CodexAppServerTransport({ clientVersion: CLIENT_VERSION, command: process.execPath, args: ["-e", ECHO_INITIALIZE_APP_SERVER], requestTimeoutMs: 5_000 });
  try {
    const answer = await transport.request("whatever", {}) as { initialize: { clientInfo: { name: string; title: string; version: string } } };
    assert.deepEqual(answer.initialize.clientInfo, { name: "molis-work-session-browser", title: "Molis Work", version: CLIENT_VERSION });
  } finally { transport.close(); }
});

test("W2-18-RUNTIME-PIPE-01/02: a real broken stdin leaves its owner alive, fails the request and only explicitly restarts", { timeout: 12_000 }, async t => {
  const broken = `import json, os, signal, sys, time
def stopped(signum, frame):
    time.sleep(0.2)
    print(json.dumps({'method':'fixture.old_notification','params':{}}), flush=True)
    sys.exit(0)
signal.signal(signal.SIGTERM, stopped)
message = json.loads(sys.stdin.readline())
assert message['method'] == 'initialize'
os.close(0)
print(json.dumps({'method':'fixture.read_closed','params':{}}), flush=True)
print(json.dumps({'id':message['id'],'result':{}}), flush=True)
time.sleep(8)
`;
  const healthy = `
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialized' || message.method === 'hang') return;
  const reply = () => process.stdout.write(JSON.stringify({id:message.id,result:{method:message.method}})+'\\n');
  if (message.method === 'initialize') reply(); else setTimeout(reply, 500);
});`;
  // An outer owner makes an unhandled stream error observable as its actual exit code, not a swallowed listener.
  const runner = `
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { CodexAppServerTransport } from '@molis-ai/molis-work-service-runtime-host';
let starts=0, readClosed=false, staleEvents=0, oldExited=false;
const children=[];
const transport=new CodexAppServerTransport({clientVersion:${JSON.stringify(CLIENT_VERSION)},requestTimeoutMs:1500,
  spawnProcess: () => {
    const first=starts++ === 0;
    const child=spawn(first?'python3':process.execPath,first?['-u','-c',${JSON.stringify(broken)}]:['-e',${JSON.stringify(healthy)}],{stdio:['pipe','pipe','pipe']});
    children.push(child);
    if(first) child.once('exit',()=>{oldExited=true;});
    return child;
  }});
transport.subscribe(event=>{ if(event.method==='fixture.read_closed') readClosed=true; if(event.method==='fixture.old_notification') staleEvents++; });
try {
  await assert.rejects(transport.request('original',{}),/请求发送失败|app-server 不可写/);
  assert.equal(readClosed,true);
  assert.equal(starts,1,'the dispatched original request is never automatically repeated');
  assert.deepEqual(await transport.request('explicit-new-request',{}),{method:'explicit-new-request'});
  assert.equal(starts,2);
  assert.equal(oldExited,true,'the old real child exited while the replacement request was pending');
  assert.equal(staleEvents,0,'old stdout cannot publish into the replacement transport');
  const pending=transport.request('hang',{});
  const rejected=assert.rejects(pending,/已关闭/);
  await new Promise(resolve=>setImmediate(resolve)); transport.close(); await rejected;
  await assert.rejects(transport.request('after-close',{}),/已关闭/);
  console.log(JSON.stringify({ownerSurvived:true,readClosed,starts,oldExited,staleEvents}));
} finally {
  transport.close();
  await Promise.all(children.map(async child=>{
    if(child.exitCode!==null || child.signalCode!==null) return;
    const closed=once(child,'close'); if(!child.killed) child.kill('SIGTERM'); await closed;
  }));
}`;
  const owner = spawn(process.execPath, ["--input-type=module", "--eval", runner], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (owner.exitCode === null && owner.signalCode === null) owner.kill("SIGTERM"); });
  let stdout = "", stderr = "";
  owner.stdout.on("data", chunk => { stdout += String(chunk); });
  owner.stderr.on("data", chunk => { stderr += String(chunk); });
  const [code, signal] = await once(owner, "close");
  assert.equal(signal, null, stderr);
  assert.equal(code, 0, stderr);
  assert.doesNotMatch(stderr, /Unhandled 'error' event|EPIPE/);
  assert.deepEqual(JSON.parse(stdout.trim()), { ownerSurvived: true, readClosed: true, starts: 2, oldExited: true, staleEvents: 0 });
});
