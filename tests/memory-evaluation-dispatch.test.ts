import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { observeEvaluationRequests, createEvaluationAttemptJournal } from "../scripts/memory-evaluation/network-observation.mjs";

const body = JSON.stringify({ model: "fixture", max_tokens: 12, messages: [{ role: "user", content: "synthetic input" }] });
async function endpoint(t: TestContext, handler?: (raw: string) => Promise<void>) {
  const received: string[] = [];
  const server = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    received.push(raw); await handler?.(raw); response.end("ok");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { url: `http://127.0.0.1:${address.port}/v1/messages`, received };
}
async function directory(t: TestContext) { const dir = await mkdtemp(join(tmpdir(), "memory-attempt-test-")); t.after(() => rm(dir, { recursive: true, force: true })); return dir; }

test("an attempt is durably recorded before its real HTTP request arrives", async t => {
  const path = join(await directory(t), "attempts.jsonl");
  const journal = await createEvaluationAttemptJournal(path); t.after(() => journal.close());
  const remote = await endpoint(t, async () => {
    const rows = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.equal(rows.length, 1); assert.equal(rows[0].state, "dispatch-intent");
    assert.equal(rows[0].attempt.intentIndex, 0); assert.deepEqual(rows[0].attempt.body, JSON.parse(body));
  });
  const observer = observeEvaluationRequests(remote.url, 1, () => ({ maxOutputTokens: 12, maxRequestBytes: 1000 }), { beforeDispatch: journal.beforeDispatch }); t.after(() => observer.restore());
  await fetch(remote.url, { method: "POST", body });
  assert.equal(remote.received.length, 1); assert.equal(observer.requests.length, 1);
  await assert.rejects(fetch(remote.url, { method: "POST", body }), /预算/);
  assert.equal(remote.received.length, 1);
});

test("journal write failure prevents this send and permanently closes subsequent sends", async t => {
  const path = join(await directory(t), "attempts.jsonl"); const journal = await createEvaluationAttemptJournal(path);
  await journal.close(); const remote = await endpoint(t);
  const observer = observeEvaluationRequests(remote.url, 4, () => ({ maxOutputTokens: 12, maxRequestBytes: 1000 }), { beforeDispatch: journal.beforeDispatch }); t.after(() => observer.restore());
  await assert.rejects(fetch(remote.url, { method: "POST", body }));
  await assert.rejects(fetch(remote.url, { method: "POST", body }), /停止|closed|落盘/i);
  assert.equal(remote.received.length, 0); assert.equal(observer.requests.length, 0);
});

test("stopping while the pre-dispatch checkpoint waits never sends this or the next request", async t => {
  const remote = await endpoint(t); let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const checkpoint = new Promise<void>(resolve => { entered = resolve; });
  const observer = observeEvaluationRequests(remote.url, 2, () => ({ maxOutputTokens: 12, maxRequestBytes: 1000 }), { beforeDispatch: async () => { entered(); await waiting; } }); t.after(() => observer.restore());
  const request = fetch(remote.url, { method: "POST", body });
  await Promise.race([checkpoint, new Promise((_, reject) => setTimeout(() => reject(new Error("beforeDispatch checkpoint never reached")), 1000))]); observer.stop("interrupted"); release();
  await assert.rejects(request, /停止|interrupted/); await assert.rejects(fetch(remote.url, { method: "POST", body }), /停止|interrupted/);
  assert.equal(remote.received.length, 0); assert.equal(observer.requests.length, 0);
});

test("body and output limits reject before journal or network; concurrent reservations respect the attempt cap", async t => {
  const path = join(await directory(t), "attempts.jsonl"); const journal = await createEvaluationAttemptJournal(path); t.after(() => journal.close());
  const remote = await endpoint(t); const observer = observeEvaluationRequests(remote.url, 1, () => ({ maxOutputTokens: 12, maxRequestBytes: 200 }), { beforeDispatch: journal.beforeDispatch }); t.after(() => observer.restore());
  await assert.rejects(fetch(remote.url, { method: "POST", body: "x".repeat(201) }), /字节/);
  await assert.rejects(fetch(remote.url, { method: "POST", body: JSON.stringify({ max_tokens: 13 }) }), /输出/);
  const results = await Promise.allSettled([fetch(remote.url, { method: "POST", body }), fetch(remote.url, { method: "POST", body })]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1); assert.equal(remote.received.length, 1);
  assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
});

test("a killed worker leaves its already-dispatched attempt readable without inventing a completed result", async t => {
  const path = join(await directory(t), "attempts.jsonl");
  let arrived!: () => void; const arrival = new Promise<void>(resolve => { arrived = resolve; });
  const server = createServer(async (request, _response) => { for await (const _chunk of request) {} arrived(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const loader = createRequire(join(process.cwd(), "package.json")).resolve("tsx");
  const fixture = fileURLToPath(new URL("./fixtures/memory-attempt-interruption.mts", import.meta.url));
  const child = spawn(process.execPath, ["--import", loader, fixture, path, `http://127.0.0.1:${address.port}/v1/messages`], { stdio: ["ignore", "pipe", "pipe"] });
  const exited = new Promise(resolve => child.once("exit", resolve)); t.after(() => { child.kill("SIGKILL"); });
  await Promise.race([arrival, new Promise((_, reject) => setTimeout(() => reject(new Error("worker never dispatched")), 3000))]);
  child.kill("SIGKILL"); await exited;
  const lines = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.length, 1); assert.equal(lines[0].state, "dispatch-intent");
  assert.equal(lines[0].attempt.body.model, "fixture");
  assert.equal(lines[0].completed, undefined, "surviving intent is not a fabricated response or billing receipt");
});

test("cancel after durable intent leaves a distinct intent and does not inflate actual fetch invocations", async t => {
  const path = join(await directory(t), "attempts.jsonl"); const journal = await createEvaluationAttemptJournal(path); t.after(() => journal.close());
  const remote = await endpoint(t); const cancelled = new AbortController(); let first = true;
  const observer = observeEvaluationRequests(remote.url, 1, () => ({ maxOutputTokens: 12, maxRequestBytes: 1000 }), {
    beforeDispatch: async attempt => { await journal.beforeDispatch(attempt); if (first) { first = false; cancelled.abort(); } },
  }); t.after(() => observer.restore());
  await assert.rejects(fetch(remote.url, { method: "POST", body, signal: cancelled.signal }));
  assert.equal(observer.requests.length, 0); assert.equal(remote.received.length, 0);
  await fetch(remote.url, { method: "POST", body });
  const intents = (await readFile(path, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  assert.deepEqual(intents.map(row => row.attempt.intentIndex), [0, 1]);
  assert.deepEqual(observer.requests.map(row => row.intentIndex), [1]);
  assert.equal(remote.received.length, 1); assert.equal(typeof observer.requests[0]!.checkpointDurationMs, "number");
});

test("a pre-existing journal is preserved and cannot silently become a second batch", async t => {
  const path = join(await directory(t), "attempts.jsonl"); const journal = await createEvaluationAttemptJournal(path); await journal.close();
  await assert.rejects(createEvaluationAttemptJournal(path), /EEXIST/);
  assert.equal(await readFile(path, "utf8"), "");
});
