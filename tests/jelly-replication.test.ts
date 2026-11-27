import { openJellyStore } from "./fixtures/plugin-sync-stores.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorageSpace, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import type { JellyItem, JellyNote } from "@molis-ai/molis-work-plugin-jelly";

const at = "2026-10-01T08:00:00.000Z";
const note = (id: string, title: string): JellyNote => ({ id, title, body: `${title} 的正文`, day: null, revision: 1, created_at: at, updated_at: at });
const item = (id: string, title: string): JellyItem => ({ id, title, kind: "event", category_id: "uncategorized", notes: "", start_date: "2026-10-20", end_date: "2026-10-20",
  start_time: null, end_time: null, time_zone: "Asia/Shanghai", completed_at: null, revision: 1, created_at: at, updated_at: at });

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "jelly-sync-"));
  const homes = [join(root, "a"), join(root, "b")];
  const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
  homes.forEach(home => ensureStorageSpace(home, space));
  const stores = homes.map(openJellyStore);
  const context: AggregateReplicaContext = {
    spaceId: space.spaceId, authorize() {}, canUploadProject: () => false,
    project: () => { throw new Error("Jelly must not need a project"); }, hasArtifact: () => false,
  };
  const replicas = stores.map(store => store.replica(context));
  let revision = 0;
  /** Every change Home A has to send, as the server would number them. */
  const drain = () => {
    const events: SyncEvent[] = [];
    for (let mutation = replicas[0]!.next(); mutation; mutation = replicas[0]!.next()) {
      const event: SyncEvent = { ...mutation, revision: ++revision };
      replicas[0]!.receive(event); events.push(event);
    }
    return events;
  };
  t.after(() => { stores.forEach(store => store.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, stores, replicas, drain };
}

test("Jelly syncs one row per key, a note and an entry travelling on their own, and needs no project", t => {
  const f = fixture(t), [a, b] = f.stores;
  a!.write(store => { store.insert("note", note("n1", "计划")); store.insert("item", item("i1", "评审")); });
  assert.equal(f.replicas[0]!.hasProjectChanges!("unrelated-project"), false, "Home rows are not owned by a project");
  const events = f.drain();
  assert.deepEqual(events.map(event => event.key).sort(), ['["jelly","item","i1"]', '["jelly","note","n1"]']);
  events.forEach(event => f.replicas[1]!.receive(event));
  const received = b!.read(store => ({ note: store.get("note", "n1"), item: store.get("item", "i1") }));
  assert.equal(received.note?.title, "计划"); assert.equal(received.item?.title, "评审");
  // An arriving row is a new revision here, so a page holding the old one meets a conflict instead of writing over it.
  assert.ok(received.note!.revision > 1);
  assert.equal(f.replicas[1]!.next(), null, "what arrived is not sent back");
  a!.write(store => store.delete("note", "n1", 1));
  f.drain().forEach(event => f.replicas[1]!.receive(event));
  assert.equal(b!.read(store => store.get("note", "n1")), null);
  assert.equal(b!.read(store => store.get("item", "i1"))?.title, "评审", "deleting one row leaves the others");
});

test("concurrent edits of one note keep both sides until resolved, and a malformed or foreign row changes nothing", t => {
  const f = fixture(t), [a, b] = f.stores;
  a!.write(store => store.insert("note", note("n1", "设备 A")));
  b!.write(store => store.insert("note", note("n1", "设备 B")));
  const [event] = f.drain();
  f.replicas[1]!.receive(event!);
  assert.equal(b!.read(store => store.get("note", "n1"))?.title, "设备 B");
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  f.replicas[1]!.resolve(f.replicas[1]!.conflicts()[0]!.key, "remote");
  assert.equal(b!.read(store => store.get("note", "n1"))?.title, "设备 A");
  const before = b!.read(store => store.get("note", "n1"));
  const value = event!.value as { record: Record<string, unknown>; spaceId: string };
  for (const [operationId, bad] of [
    ["extra", { ...value, record: { ...value.record, secret: "not portable" } }],
    ["wrong-id", { ...value, record: { ...value.record, id: "n2" } }],
    ["bad-day", { ...value, record: { ...value.record, day: "2026-02-30" } }],
    ["other-space", { ...value, spaceId: "space_other" }],
  ] as const) f.replicas[1]!.receive({ ...event!, operationId, revision: 9, value: bad });
  assert.deepEqual(b!.read(store => store.get("note", "n1")), before);
});
