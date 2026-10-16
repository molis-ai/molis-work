import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorageSpace, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { openJellyStore } from "@molis-ai/molis-work-plugin-jelly";

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
  const take = () => {
    const mutation = replicas[0]!.next();
    assert.ok(mutation);
    const event: SyncEvent = { ...mutation, revision: ++revision };
    replicas[0]!.receive(event);
    return event;
  };
  t.after(() => { stores.forEach(store => store.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, stores, replicas, take };
}

test("Jelly personal notes and calendar transfer as one validated workspace without remote execution", t => {
  const f = fixture(t), [a, b] = f.stores;
  const source = a!.execute({ type: "note.create", title: "计划", markdown: "准备交付" });
  a!.execute({ type: "item.create", item: { title: "评审", start_date: "2026-10-20" } });
  const event = f.take();
  assert.equal(f.replicas[0]!.next(), null);
  f.replicas[1]!.receive(event);
  const received = b!.read();
  assert.equal(received.notes[0]?.id, source.notes[0]?.id);
  assert.equal(received.notes[0]?.title, "计划");
  assert.equal(received.items[0]?.title, "评审");
  assert.ok(received.revision > source.revision);
  assert.equal(f.replicas[1]!.next(), null);
  const reopened = openJellyStore(f.homes[1]!);
  try { assert.deepEqual(reopened.read(), received); }
  finally { reopened.close(); }
  assert.throws(() => b!.execute({ type: "undo" }), /没有可撤销/);
});

test("Jelly preserves both sides of concurrent edits and rejects malformed remote state", t => {
  const f = fixture(t), [a, b] = f.stores;
  a!.execute({ type: "note.create", title: "设备 A" });
  b!.execute({ type: "note.create", title: "设备 B" });
  const event = f.take();
  f.replicas[1]!.receive(event);
  assert.equal(b!.read().notes[0]?.title, "设备 B");
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  f.replicas[1]!.resolve(f.replicas[1]!.conflicts()[0]!.key, "remote");
  assert.equal(b!.read().notes[0]?.title, "设备 A");
  const before = b!.read();
  const invalid = structuredClone(event.value) as { workspace: Record<string, unknown> };
  invalid.workspace.secret = "not portable";
  f.replicas[1]!.receive({ ...event, operationId: "bad", revision: 2, value: invalid });
  assert.deepEqual(b!.read(), before);
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
});
