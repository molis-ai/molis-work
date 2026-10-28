import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
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

test("RAC-1142 BL-810 settling handled notices: a notice of a work that is gone stays as it is; a store that cannot be read fails the pass", async t => {
  const { store, service, work, breakReads } = assistant(t);
  store.raiseNotice("web-user", { kind: "result", work_id: "work-deleted", work_title: "已删", text: "完成了" }, "deleted:1");
  assert.equal(await service.notices.settleHandledNotices(), 0);
  const kept = work();
  store.raiseNotice("web-user", { kind: "result", work_id: kept.work_id, work_title: kept.title, text: "完成了" }, "kept:1");
  breakReads();
  // The page's caller writes this one (assistant.handled_notices_settlement_failed); before BL-810 it passed for a deletion.
  await assert.rejects(service.notices.settleHandledNotices(), { code: "storage.unreadable" });
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
