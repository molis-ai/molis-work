import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
import { AssistantService } from "../apps/local-host/src/assistant/assistant-service.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

function reply(text: string): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

// specs/prologue-adoption §4.5 (item 12): the page follows a live work by waiting for its view to change. The wait wakes
// on the work's stored facts and on the run it waits on, reads the view only then, and returns the same view when nothing
// changed within the wait.
test("waiting on a work returns when its run or its stored facts change, reads it only then, and ends with the request", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-assistant-wait-"));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const answer = Promise.withResolvers<void>();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls += 1; if (calls === 1) await answer.promise; return reply("会议纪要已整理好。"); });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-wait-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service: AssistantService = new AssistantService(store, { host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  let reads = 0;
  const read = service.read.bind(service);
  service.read = (async (workId: string) => { reads += 1; return read(workId); }) as typeof service.read;
  try {
    const sent = await service.send({ text: "整理一下会议纪要", request_id: "req-wait-1" }, { project_ref: project });
    const workId = sent.work.work_id;
    for (let i = 0; i < 300 && calls < 1; i++) await new Promise(resolve => setTimeout(resolve, 20));
    const first = await service.waitForChange(workId, null, 20_000);
    assert.equal(first.view.work.state, "running");

    // Nothing changes: the wait runs out and returns the same view, read once.
    reads = 0;
    let started = Date.now();
    const quiet = await service.waitForChange(workId, first.version, 400);
    assert.equal(quiet.version, first.version, "an unchanged work keeps its version between reads");
    assert.ok(Date.now() - started >= 380, "an unchanged work is not returned early");
    assert.equal(reads, 1, "nothing is read while waiting");

    // The run answers: the wait returns with the new view well before it would run out.
    reads = 0; started = Date.now();
    const waiting = service.waitForChange(workId, first.version, 20_000);
    setTimeout(() => answer.resolve(), 150);
    let seen = await waiting;
    for (let i = 0; i < 10 && seen.view.work.state !== "completed"; i++) seen = await service.waitForChange(workId, seen.version, 20_000);
    assert.equal(seen.view.work.state, "completed");
    assert.ok(Date.now() - started < 10_000, "the finished round wakes the wait");
    assert.ok(reads <= 12, `the view is read on changes, not on a timer (${reads} reads)`);

    // A stored change (a draft kept for this work) wakes it too.
    started = Date.now();
    const drafting = service.waitForChange(workId, seen.version, 20_000);
    setTimeout(() => service.saveDraft(workId, "下周再看"), 100);
    const drafted = await drafting;
    assert.notEqual(drafted.version, seen.version);
    assert.equal(drafted.view.work.draft, "下周再看");
    assert.ok(Date.now() - started < 5_000);

    // Closing the request ends the wait at once.
    const controller = new AbortController();
    started = Date.now();
    const closing = service.waitForChange(workId, drafted.version, 20_000, controller.signal);
    setTimeout(() => controller.abort(), 100);
    assert.equal((await closing).version, drafted.version);
    assert.ok(Date.now() - started < 5_000, "an ended request does not hold the wait");
  } finally {
    answer.resolve(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true });
  }
});
