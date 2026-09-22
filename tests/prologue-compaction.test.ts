import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { compactionSelection, createPrologueCompactor } from "../horizontal/agent-host/src/adapters/prologue-compaction.js";

const older = [{ role: "tool", source: "tool-result" as const, origin: "read-file", text: "未执行\r\n已批准 ≠ 已发生\n尾部青杉渡" }];
const connection = { protocol: "anthropic-compatible", endpoint: "https://model.invalid", model: "frozen-model", credentialRef: { kind: "credential", id: "ref-only", revision: 1 } } as const;

test("packed SDK avoids repeated compaction of protected prompts across real Node reads and restart", { timeout: 30_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-compaction-growth-"));
  await writeFile(join(root, "sample.txt"), "Original file evidence.\n");
  let requests = 0, reads = 0, compactions = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    requests++;
    const body = JSON.parse(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    const compact = JSON.stringify(body.system).includes("SELECT_ONLY");
    if (compact) compactions++;
    else reads++;
    const tool = !compact && reads <= 6;
    const events: string[] = [];
    const emit = (type: string, value: unknown) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value as object })}\n\n`);
    emit("message_start", { message: { id: "growth-test", type: "message", role: "assistant", model: "fixture", content: [], usage: { input_tokens: 20, output_tokens: 0 } } });
    if (tool) emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: `read-${reads}`, name: "read", input: { path: "sample.txt" } } });
    else {
      emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: compact ? '{"selections":[]}' : "Read evidence retained." } });
    }
    emit("content_block_stop", { index: 0 });
    emit("message_delta", { delta: { stop_reason: tool ? "tool_use" : "end_turn" }, usage: { output_tokens: 8 } });
    emit("message_stop", {});
    return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
  });
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.compaction-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  let adapter = await make();
  try {
    const directory = { canonical_path: root, realpath_verified: true };
    const session = await adapter.createSession({ title: "Growth", board_id: "test", plugin_id: "io.molis.work.coding", install_id: "test", actor_id: "test", directory });
    const handle = await adapter.start({ plugin_id: "io.molis.work.coding", session, directory, role_id: "reader", task: "Read sample.txt six times, preserve all observations, then finish.",
      role: { role_id: "reader", version: 1, execution: "read-only", host_tools: ["read-file"],
        compaction: { above_tokens: 1000, prompt: { prompt_id: "compact", version: 1, layer: "base", body: "SELECT_ONLY: return original excerpt coordinates as JSON." } },
        prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "Preserve this role instruction. ".repeat(500) }] } });
    const deadline = Date.now() + 20_000;
    let view = await adapter.read(handle.ref);
    while (!["completed", "failed", "stopped", "cancelled"].includes(view.phase)) {
      if (Date.now() > deadline) throw new Error("Run did not finish");
      await new Promise(resolve => setTimeout(resolve, 10));
      view = await adapter.read(handle.ref);
    }
    assert.equal(view.phase, "completed", JSON.stringify(view));
    assert.equal(view.activity.filter(item => item.name === "read" && item.state === "completed").length, 6);
    assert.equal(compactions, 1);
    assert.equal(await readFile(join(root, "sample.txt"), "utf8"), "Original file evidence.\n");
    const count = requests;
    await adapter.close(); adapter = await make();
    assert.deepEqual(await adapter.read(handle.ref), view);
    assert.equal(requests, count, "restart reads the original result without model or tool replay");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});

function fixture(events: unknown[] = []) {
  let listener: ((event: any) => void) | undefined;
  let input: any, creates = 0, cancels = 0, unsubscribes = 0;
  let release: (() => void) | undefined;
  const run = { cancel: async () => { cancels++; listener?.({ type: "cancelled" }); },
    subscribe: (fn: (event: any) => void) => { listener = fn; events.forEach(fn); return () => { unsubscribes++; listener = undefined; }; } };
  const runtime = { sessions: { create: async (options: unknown) => { creates++; assert.deepEqual(options, { ephemeral: true });
    return { startRun: async (request: unknown) => { input = request; if (release) await new Promise<void>(resolve => { release = resolve; }); return run; } }; } } };
  return { compact: createPrologueCompactor({ runtime: runtime as never, connection, prompt: "仅选原文" }),
    emit: (event: unknown) => listener?.(event), input: () => input, counts: () => ({ creates, cancels, unsubscribes }),
    pauseStart() { release = () => {}; }, releaseStart() { release?.(); } };
}

test("compaction copies original Unicode and line endings, rejects invented or out-of-range coordinates", () => {
  assert.deepEqual(compactionSelection('{"selections":[{"record":0,"startPart":1,"endPart":2}]}', older), { excerpts: [{ record: 0, text: "未执行\r\n已批准 ≠ 已发生\n" }] });
  assert.deepEqual(compactionSelection('{"selections":[]}', older), { excerpts: [] });
  for (const invalid of ['summary', '{}', '{"selections":[{"record":0,"startPart":0,"endPart":2}]}', '{"selections":[{"record":1,"startPart":1,"endPart":1}]}', '{"selections":[{"record":0,"startPart":1,"endPart":4}]}']) {
    assert.throws(() => compactionSelection(invalid, older));
  }
});

test("summary uses the frozen model without tools, retains data provenance and cleans synchronous replay listeners", async () => {
  const f = fixture([{ type: "text-delta", text: '{"selections":[{"record":0,"startPart":2,"endPart":3}]}' }, { type: "completed" }]);
  assert.deepEqual(await f.compact({ older, instructions: ["不要重跑副作用"], retained: [{ role: "user", text: "保留决定" }] }), { excerpts: [{ record: 0, text: "已批准 ≠ 已发生\n尾部青杉渡" }] });
  assert.equal(f.input().model, "frozen-model"); assert.equal(f.input().tools, undefined);
  const supplied = JSON.parse(f.input().messages[1].text);
  assert.equal(supplied.older[0].source, "tool-result"); assert.equal(supplied.older[0].parts[0].text, "未执行\r\n");
  assert.deepEqual(supplied.instructions, ["不要重跑副作用"]);
  assert.deepEqual(f.counts(), { creates: 1, cancels: 0, unsubscribes: 1 });
});

test("parent stop cancels an in-flight selection once, never commits late output", async () => {
  const f = fixture(), abort = new AbortController();
  const pending = f.compact({ older, signal: abort.signal });
  await new Promise(resolve => setImmediate(resolve));
  abort.abort(); f.emit({ type: "text-delta", text: '{"selections":[]}' }); f.emit({ type: "completed" });
  await assert.rejects(pending, /取消/);
  assert.deepEqual(f.counts(), { creates: 1, cancels: 1, unsubscribes: 1 });
  await assert.rejects(f.compact({ older, signal: abort.signal }), /取消/);
  assert.equal(f.counts().creates, 1);
});

test("stop during SDK start is honoured before collecting, and malformed/incomplete/tool output fails closed", async () => {
  const f = fixture(), abort = new AbortController(); f.pauseStart();
  const pending = f.compact({ older, signal: abort.signal });
  await new Promise(resolve => setImmediate(resolve)); abort.abort(); f.releaseStart();
  await assert.rejects(pending, /取消/); assert.equal(f.counts().cancels, 1);
  for (const events of [
    [{ type: "tool-call", call: { name: "write" } }],
    [{ type: "text-delta", text: 'x'.repeat(65537) }],
    [{ type: "text-delta", text: '{"selections":[]}' }, { type: "completed", stopReason: "max-tokens" }],
    [{ type: "completed" }], [{ type: "failed" }],
    [{ type: "text-delta", text: 'invented summary' }, { type: "completed" }],
  ]) await assert.rejects(fixture(events).compact({ older }));
});


test("replayed JSON tool output has exact selectable parts instead of a single oversized line", async () => {
  const original = `[historical tool-result run:old]\n` + JSON.stringify({ text: "关键决定：不要修改\n" + "例子🌲".repeat(2000) + "\n尾部证据：仍未执行" });
  const f = fixture([{ type: "text-delta", text: '{"selections":[]}' }, { type: "completed" }]);
  await f.compact({ older: [{ role: "user", source: "tool-result", text: original }] });
  const row = JSON.parse(f.input().messages[1].text).older[0];
  assert.ok(row.partCount > 4); assert.equal(row.parts.map((p: any) => p.text).join(""), original);
  assert.ok(row.parts.every((p: any) => [...p.text].length <= 1024));
  const last = compactionSelection(JSON.stringify({ selections: [{ record: 0, startPart: row.partCount, endPart: row.partCount }] }), [{ role: "user", text: original }]);
  assert.match(last.excerpts[0].text, /尾部证据/); assert.ok(original.includes(last.excerpts[0].text));
});

test("compaction awaits parent receipt persistence before returning; failed selection keeps prior charges", async () => {
  const receipt = { input: { source: 'reported', tokens: 13 }, output: { source: 'reported', tokens: 7 },
    cacheRead: { source: 'reported', tokens: 2 }, cacheWrite: { source: 'unknown', tokens: undefined }, cost: { source: 'unknown', amount: undefined, currency: undefined } };
  let release!: () => void, saved = false, resolved = false;
  const gate = new Promise<void>(r => { release = r; });
  const f = fixture([{ type: 'usage-recorded', callId: 'c1', receipt }, { type: 'text-delta', text: '{"selections":[]}' }, { type: 'completed' }]);
  const run = f.compact({ older, reportUsage: async event => { assert.equal(event.callId, 'c1'); assert.deepEqual(event.receipt, receipt); await gate; saved = true; } }).then(value => { resolved = true; return value; });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(resolved, false); release();
  await run; assert.equal(saved, true);
  const invalid = fixture([{ type: 'usage-recorded', callId: 'failed', receipt }, { type: 'text-delta', text: 'bad selection' }, { type: 'completed' }]);
  let captured = 0;
  await assert.rejects(invalid.compact({ older, reportUsage: async () => { captured++; } }), /有效/);
  assert.equal(captured, 1);
  const failed = fixture([{ type: 'usage-recorded', callId: 'c1', receipt }, { type: 'text-delta', text: '{"selections":[]}' }, { type: 'completed' }]);
  await assert.rejects(failed.compact({ older, reportUsage: async () => { throw new Error('ledger not saved'); } }), /ledger not saved/);
});
