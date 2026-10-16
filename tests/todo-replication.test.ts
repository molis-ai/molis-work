import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorageSpace, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { openTodoStore, openTodoSyncStore, type TodoAccess } from "@molis-ai/molis-work-plugin-todo";

const access: TodoAccess = { projectId: null, everything: true, actor: "user", actorId: "alice" };
const projectAccess: TodoAccess = { ...access, projectId: "project" };

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "todo-sync-"));
  const homes = [join(root, "a"), join(root, "b")];
  const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
  homes.forEach(home => ensureStorageSpace(home, space));
  const stores = homes.map(home => openTodoStore(home));
  const syncStores = homes.map(home => openTodoSyncStore(home));
  const context: AggregateReplicaContext = {
    spaceId: space.spaceId, authorize() {}, canUploadProject: () => true,
    project(id) { assert.equal(id, "project"); return { title: "测试项目" }; },
    hasArtifact: () => true,
  };
  const replicas = syncStores.map(store => store.replica(context));
  let revision = 0;
  const take = () => {
    const mutation = replicas[0]!.next();
    assert.ok(mutation);
    const event: SyncEvent = { ...mutation, revision: ++revision };
    replicas[0]!.receive(event);
    return event;
  };
  t.after(() => { stores.forEach(store => store.close()); syncStores.forEach(store => store.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, stores, replicas, take };
}

test("personal Todo transfers item and history, but remote history cannot be undone on target", t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "跨设备待办", request_id: "create-once" }, access).item;
  a!.update(created.id, { notes: "交付前核对" }, created.revision, access);
  const event = f.take();
  f.replicas[1]!.receive(event);
  const received = b!.get(created.id, access);
  assert.equal(received.notes, "交付前核对");
  assert.ok(received.revision > a!.get(created.id, access).revision);
  const history = b!.history(created.id, access);
  assert.equal(history.length, 2);
  assert.throws(() => b!.revert({ change_id: history[0]!.change_id }, access), /仅供查看/);
  const local = b!.update(created.id, { title: "本机改名" }, received.revision, access);
  assert.equal(b!.get(created.id, access).title, "本机改名");
  assert.equal(b!.revert({ change_id: local.change_id! }, access).items[0]?.title, "跨设备待办");
  const reopened = openTodoStore(f.homes[1]!);
  try {
    assert.equal(reopened.get(created.id, access).notes, "交付前核对");
    assert.throws(() => reopened.revert({ change_id: history[0]!.change_id }, access), /仅供查看/);
  } finally { reopened.close(); }
});

test("project Todo identity and deletion replicate without touching another item", t => {
  const f = fixture(t), [a, b] = f.stores;
  const project = a!.create({ title: "项目待办", placement: "project" }, projectAccess).item;
  const personal = a!.create({ title: "个人待办" }, access).item;
  f.replicas[1]!.receive(f.take());
  f.replicas[1]!.receive(f.take());
  assert.equal(b!.get(project.id, projectAccess).project_id, "project");
  assert.equal(b!.get(personal.id, access).project_id, null);
  a!.delete(project.id, project.revision, projectAccess);
  f.replicas[1]!.receive(f.take());
  assert.throws(() => b!.get(project.id, projectAccess), /找不到/);
  assert.equal(b!.get(personal.id, access).title, "个人待办");
});

test("Todo concurrent edits conflict and malformed payload cannot replace valid data", t => {
  const f = fixture(t), [a, b] = f.stores;
  const item = a!.create({ title: "初稿" }, access).item;
  const first = f.take();
  f.replicas[1]!.receive(first);
  a!.update(item.id, { title: "设备 A" }, a!.get(item.id, access).revision, access);
  b!.update(item.id, { title: "设备 B" }, b!.get(item.id, access).revision, access);
  f.replicas[1]!.receive(f.take());
  assert.equal(b!.get(item.id, access).title, "设备 B");
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  const bad = structuredClone(first.value) as { item: Record<string, unknown> };
  bad.item.extra = "unknown";
  f.replicas[1]!.receive({ ...first, operationId: "bad", revision: 3, value: bad });
  assert.equal(b!.get(item.id, access).title, "设备 B");
});
