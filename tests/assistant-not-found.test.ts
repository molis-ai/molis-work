import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { AgentScheduleCapability, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AssistantService, AssistantStore, captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";

/**
 * BL-810: where the Assistant reads a work it may have lost meanwhile, only `assistant.not_found` means the work is gone. A store that
 * cannot be read is no longer taken for a deletion: the read fails with the store's own error, or, in a listener, the failure is written.
 */

const project = { project_id: "project", storage_key: "memory:project" };
const unreadable = () => Object.assign(new Error("database disk image is malformed"), { code: "storage.unreadable" });
const noRounds = async (): Promise<never> => { throw new Error("no rounds here"); };

function assistant(t: { after: (fn: () => void) => void }) {
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => ["home"], host: async () => { throw new Error("no runtime here"); }, authority: noRounds }, "web-user");
  t.after(() => service.continuations.close());
  const work = () => store.create({ actor_id: "web-user", title: "整理", scope: { kind: "project", project_id: "project" }, origin: null, project_ref: project });
  const read = store.get.bind(store);
  // From the next read on, the store cannot be read (after `after` reads that still work).
  const breakReads = (after = 0) => { let reads = 0; store.get = (actorId, workId) => { if (++reads <= after) return read(actorId, workId); throw unreadable(); }; };
  return { store, service, work, breakReads };
}

async function logged<T>(run: () => T | Promise<T>): Promise<HostLogEntry[]> {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { await run(); return entries; } finally { restore(); }
}

test("RAC-1140 BL-810 a work record: a work that is gone is null; a store that cannot be read throws its own error", t => {
  const { service, work, breakReads } = assistant(t);
  const kept = work();
  assert.equal(service.reads.workRecord(kept.work_id)?.work_id, kept.work_id);
  assert.equal(service.reads.workRecord("work-deleted"), null, "gone is null");
  breakReads();
  assert.throws(() => service.reads.workRecord(kept.work_id), { code: "storage.unreadable" }, "unreadable is not taken for gone");
});

test("RAC-1141 BL-810 the works related to an object: a related work that is gone is left out; a store that cannot be read fails the read", async t => {
  const { store, service, work, breakReads } = assistant(t);
  const subject = { kind: "goal", id: "g1" };
  store.relations.link({ work_id: "work-deleted", project_id: "project" }, "material", { ...subject, revision: "1" }, "测试");
  assert.deepEqual(await service.reads.related("project", subject), [], "a relation to a deleted work names nothing");
  store.relations.link({ work_id: work().work_id, project_id: "project" }, "material", { ...subject, revision: "1" }, "测试");
  breakReads();
  await assert.rejects(service.reads.related("project", subject), { code: "storage.unreadable" });
});

test("RAC-1142 BL-810 settling handled notices: a notice of a work that is gone stays as it is; a work that cannot be read is written once and passed over", async t => {
  const gone = assistant(t);
  gone.store.raiseNotice("web-user", { kind: "result", work_id: "work-deleted", work_title: "已删", text: "完成了" }, "deleted:1");
  assert.deepEqual(await logged(async () => assert.equal(await gone.service.notices.settleHandledNotices(), 0)), [], "gone is no failure");
  const { store, service, work, breakReads } = assistant(t);
  const kept = work();
  store.raiseNotice("web-user", { kind: "result", work_id: kept.work_id, work_title: kept.title, text: "完成了" }, "kept:1");
  breakReads();
  // Before BL-810 it passed for a deletion; now the pass carries on past it, so the other works' notices still settle.
  const entries = await logged(async () => { assert.equal(await service.notices.settleHandledNotices(), 0); assert.equal(await service.notices.settleHandledNotices(), 0); });
  assert.deepEqual(entries.map(entry => [entry.area, entry.event, entry.fields?.work_id, entry.error?.code]), [["assistant", "notice_work_unreadable", kept.work_id, "storage.unreadable"]], "once, not on every pass");
  assert.equal(store.openNotices("web-user").length, 1, "its notice stays open");
});

test("RAC-1144 BL-810 a timed round: a work that cannot be read is written once when the Host starts, and at its due time fails without writing the follow-up", async t => {
  const { store, service, work, breakReads } = assistant(t);
  const kept = work();
  const due = new Date(Date.now() + 3_600_000).toISOString();
  store.followUps.save("web-user", { followup_id: "fu-1", work_id: kept.work_id, label: "每天汇总", text: "汇总", repeat: "daily", next_at: due, time_zone: "Asia/Shanghai", enabled: true, created_at: new Date().toISOString() });
  const before = service.followUps.list(kept.work_id);
  let run: ((task: AgentScheduledTask) => Promise<void>) | undefined;
  const schedule: AgentScheduleCapability = { claim: () => ({ survives_window_close: false, why: "测试" }), enqueue: async () => { throw new Error("not queued here"); },
    cancel: async () => null, find: () => null, list: () => [], handle: (_kind, runner) => { run = runner; return () => undefined; } };
  breakReads();
  const started = await logged(async () => { await service.followUps.attach(schedule); await service.followUps.attach(schedule); });
  assert.deepEqual(started.map(entry => [entry.area, entry.event, entry.fields?.followup_id, entry.error?.code]), [["assistant", "followup_work_unreadable", "fu-1", "storage.unreadable"]],
    "written once, not taken for a deletion");
  // Its time comes: thrown for the queue to keep as failed; the follow-up is not stopped nor told the work no longer exists.
  await assert.rejects(run!({ task_id: "t-1", key: `fu-fu-1-${Date.parse(due)}`, session_id: "s-1", kind: "assistant.follow-up", payload: { followup_id: "fu-1" }, due_at: due,
    state: "running", attempts: 1, runs: 0 }), { code: "storage.unreadable" });
  assert.deepEqual(service.followUps.list(kept.work_id), before);
});

test("RAC-1143 BL-810 a change heard by the continuations: a store that cannot be read is written as the listener's failure, and the write still went through", async t => {
  const { store, work, breakReads } = assistant(t);
  const kept = work();
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    breakReads(1); // The write reads the work once; the continuations' listener then reads it again.
    assert.equal(store.update("web-user", kept.work_id, null, { title: "整理周报" }).title, "整理周报");
  } finally { restore(); }
  assert.deepEqual(entries.filter(entry => entry.event === "listener_failed").map(entry => [entry.area, entry.fields?.of, entry.error?.code]),
    [["assistant", "work_changes", "storage.unreadable"]]);
});
