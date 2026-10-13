import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";

function reply(): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Done." } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

async function until(read: () => boolean | Promise<boolean>): Promise<void> {
  for (let count = 0; count < 400; count++) { if (await read()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error("The expected production queue state was not reached");
}

for (const stage of ["state", "materials", "runtime", "enqueue"] as const) {
  test(`W2-18-FOLLOWUP-DELETE-01 deletion during ${stage} stops future dispatch and cannot resurrect the row`, { timeout: 60_000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), "molis-followup-delete-"));
    const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
    const project = { project_id: "project", storage_key: "memory:followup-project" };
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests++; return reply(); });
    const reviews = new AgentReviewQueue(), host = new AgentHost({ reviews });
    const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.followup-delete-test", appVersion: "1.0.0" },
      storageRoot: join(directory, "sdk"), reviewQueue: reviews,
      modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
      resolveCredential: () => "fixture-only" });
    host.register(adapter);
    const db = new DatabaseSync(":memory:"), store = new AssistantStore(db), schedule = adapter.schedule!;
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let barrierUsed = false, key = "";
    const barrier = async () => { if (barrierUsed || !key || schedule.find(key)?.state !== "running") return;
      barrierUsed = true; entered.resolve(); await release.promise; };
    const service = new AssistantService(store, { host: async () => host,
      authority: async work => ({ ...assistantAuthority(local, work, () => new Set()), ...(stage === "runtime" ? { beforeStart: barrier } : {}) }),
      projectTitle: async () => { if (stage === "materials") await barrier(); return "Project"; }, timeZone: "UTC" }, "web-user");
    t.after(async () => { release.resolve(); await adapter.close(); await local.close(); db.close(); await rm(directory, { recursive: true, force: true }); });
    await service.attachSchedule();
    const sent = await service.send({ text: "Begin this work", request_id: "followup-start-0001" }, { project_ref: project });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed");
    assert.equal(requests, 1);
    const due = new Date(Date.now() + 1200);
    const standing = await service.saveFollowUp({ work_id: sent.work.work_id, text: "The scheduled round", at: due.toISOString(),
      repeat: "daily", label: "Daily round", time_zone: "UTC" });
    key = `fu-${standing.followup_id}-${due.getTime()}`;
    if (stage === "state") {
      const original = adapter.readSessionStatus!.bind(adapter);
      t.mock.method(adapter, "readSessionStatus", async (ref: Parameters<typeof original>[0]) => { await barrier(); return original(ref); });
    }
    if (stage === "enqueue") {
      const original = schedule.enqueue.bind(schedule);
      t.mock.method(schedule, "enqueue", async (task: Parameters<typeof original>[0]) => {
        if (task.payload.followup_id === standing.followup_id && task.key !== key) await barrier();
        return original(task);
      });
    }
    await entered.promise;
    assert.equal(await service.removeFollowUp(standing.followup_id), true);
    assert.deepEqual(service.followUps(sent.work.work_id), []);
    release.resolve();
    await until(() => schedule.find(key)?.state !== "running");
    if (stage === "enqueue") await until(() => requests === 2);
    assert.equal(requests, stage === "enqueue" ? 2 : 1, "only a round dispatched before deletion may finish");
    assert.deepEqual(service.followUps(sent.work.work_id), [], "no UPDATE may insert the removed standing request");
    const next = schedule.find(`fu-${standing.followup_id}-${due.getTime() + 86_400_000}`);
    assert.ok(!next || next.state === "cancelled", "a next task enqueued concurrently with deletion is withdrawn");
    assert.equal(store.rounds(sent.work.work_id).length, stage === "enqueue" ? 2 : 1);
  });
}

test("W2-18-FOLLOWUP-DELETE-02 the store refuses a stale callback after deletion or a newer edit", () => {
  const db = new DatabaseSync(":memory:"), store = new AssistantStore(db);
  try {
    const original = { followup_id: "followup", work_id: "work", label: "daily", text: "do it", repeat: "daily" as const,
      next_at: "2026-10-13T12:00:00Z", time_zone: "UTC", enabled: true, created_at: "2026-10-12T12:00:00Z" };
    store.saveFollowUp("web-user", original);
    const edited = { ...original, text: "new instructions" };
    store.saveFollowUp("web-user", edited);
    assert.equal(store.saveFollowUp("web-user", { ...original, enabled: false }, original), false);
    assert.deepEqual(store.followUps("web-user"), [edited]);
    store.removeFollowUp("web-user", original.followup_id);
    assert.equal(store.saveFollowUp("web-user", { ...original, enabled: false }, original), false);
    assert.deepEqual(store.followUps("web-user"), []);
  } finally { db.close(); }
});
