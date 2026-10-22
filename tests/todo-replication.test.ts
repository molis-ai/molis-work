import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStorageSpace, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  openTodoStore, openTodoSyncStore, type TodoAccess, createTodoActionHandlers, ownTodoStores,
  todoActions, todoManifest, TODO_ACTION_PERMISSIONS,
} from "@molis-ai/molis-work-plugin-todo";

const access: TodoAccess = { projectId: null, everything: true, actor: "user", actorId: "alice" };
const projectAccess: TodoAccess = { ...access, projectId: "project" };

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "todo-sync-"));
  const homes = [join(root, "a"), join(root, "b")];
  const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
  homes.forEach(home => ensureStorageSpace(home, space));
  const clock = { now: new Date("2026-10-22T10:00:00Z") };
  const stores = homes.map(home => openTodoStore(home, () => clock.now));
  const syncStores = homes.map(home => openTodoSyncStore(home));
  const context: AggregateReplicaContext = {
    spaceId: space.spaceId, authorize() {}, canUploadProject: () => true,
    project(id) { assert.equal(id, "project"); return { title: "测试项目" }; },
    hasArtifact: () => true,
  };
  const replicas = syncStores.map(store => store.replica(context));
  let revision = 0;
  const take = (source = 0) => {
    const mutation = replicas[source]!.next();
    assert.ok(mutation);
    const event: SyncEvent = { ...mutation, revision: ++revision };
    replicas[source]!.acknowledge(mutation.key, mutation.operationId, event.revision);
    return event;
  };
  t.after(() => { stores.forEach(store => store.close()); syncStores.forEach(store => store.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, stores, replicas, take, clock };
}

function actionsFor(store: ReturnType<typeof openTodoStore>, permissions = TODO_ACTION_PERMISSIONS) {
  const service = new ActionService();
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ ...ownTodoStores(run => run(store)),
      today: () => "2026-10-22", now: () => new Date("2026-10-22T10:00:00Z") }) });
  return bindActionClient(service, () => ({ actor_id: "alice", project_id: null, audience: "user", permissions }));
}

test("PCSYNC-TODO-UNDO-01: remote history is undoable through actions after reopening and syncs back", async t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "跨设备待办", request_id: "create-once" }, access).item;
  const edited = a!.update(created.id, { notes: "交付前核对" }, created.revision, access);
  const event = f.take();
  const original = JSON.stringify(event);
  f.replicas[1]!.receive(event);
  assert.equal(JSON.stringify(event), original, "receiving must not mutate transport history");
  const received = b!.get(created.id, access);
  assert.equal(received.notes, "交付前核对");
  assert.ok(received.revision > a!.get(created.id, access).revision);
  const history = b!.history(created.id, access);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.change_id, edited.change_id);
  assert.equal(history[0]!.revision_after, received.revision, "the page's undo eligibility matches the item");
  assert.equal(f.replicas[1]!.next(), null, "receiving does not echo");
  const reopened = openTodoStore(f.homes[1]!);
  try {
    const client = actionsFor(reopened);
    const result = await client.invoke(todoActions.revert, { change_id: edited.change_id! });
    assert.equal(result.items[0]?.notes, "");
    await assert.rejects(client.invoke(todoActions.revert, { change_id: edited.change_id! }), { code: "todo.conflict" });
  } finally { reopened.close(); }
  f.replicas[0]!.receive(f.take(1));
  assert.equal(a!.get(created.id, access).notes, "");
  assert.ok(a!.history(created.id, access).find(change => change.change_id === edited.change_id)?.reverted_by);
  assert.equal(f.replicas[0]!.next(), null);
  assert.equal(f.replicas[1]!.next(), null);
});

test("PCSYNC-TODO-UNDO-01: undoing creation on another device replicates deletion", t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "误建的待办" }, access);
  f.replicas[1]!.receive(f.take());
  assert.deepEqual(b!.revert({ change_id: created.change_id }, access).removed_ids, [created.item.id]);
  f.replicas[0]!.receive(f.take(1));
  for (const store of [a!, b!]) assert.throws(() => store.get(created.item.id, access), { code: "todo.not_found" });
});

test("PCSYNC-TODO-UNDO-02: local later edits and stale editors remain protected across round trips", t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "原始标题" }, access).item;
  const remote = a!.update(created.id, { notes: "来自 A" }, created.revision, access);
  f.replicas[1]!.receive(f.take());
  const received = b!.get(created.id, access);
  const local = b!.update(created.id, { title: "来自 B" }, received.revision, access);
  assert.throws(() => b!.revert({ change_id: remote.change_id! }, access), { code: "todo.conflict" });
  assert.equal(b!.get(created.id, access).title, "来自 B");
  assert.equal(b!.revert({ change_id: local.change_id! }, access).items[0]?.title, "原始标题");
  f.replicas[0]!.receive(f.take(1));
  const next = a!.update(created.id, { notes: "A 后续修改" }, a!.get(created.id, access).revision, access);
  const stale = b!.get(created.id, access).revision;
  f.replicas[1]!.receive(f.take());
  assert.throws(() => b!.update(created.id, { title: "旧页面" }, stale, access), { code: "todo.conflict" });
  assert.throws(() => b!.revert({ change_id: remote.change_id! }, access), { code: "todo.conflict" });
  assert.equal(b!.revert({ change_id: next.change_id! }, access).items[0]?.notes, "来自 A");
});

test("PCSYNC-TODO-UNDO-02: a history gap stays non-undoable and exhausted revisions reject atomically", t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "保留版本间隙" }, access);
  const first = f.take();
  const gap = structuredClone(first.value) as { item: { revision: number } };
  gap.item.revision += 4;
  f.replicas[1]!.receive({ ...first, value: gap });
  assert.throws(() => b!.revert({ change_id: created.change_id }, access), { code: "todo.conflict" });
  const before = b!.get(created.item.id, access);
  const history = b!.history(created.item.id, access);
  const exhausted = structuredClone(gap);
  exhausted.item.revision = Number.MAX_SAFE_INTEGER;
  f.replicas[1]!.receive({ ...first, operationId: "exhausted", revision: 2, value: exhausted });
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  assert.match(f.replicas[1]!.conflicts()[0]!.reason, /安全范围/);
  assert.deepEqual(b!.get(created.item.id, access), before);
  assert.deepEqual(b!.history(created.item.id, access), history);
});

test("PCSYNC-TODO-UNDO-02: synced history does not bypass action permissions or project scope", async t => {
  const f = fixture(t), [a, b] = f.stores;
  const created = a!.create({ title: "项目私有" , placement: "project" }, projectAccess);
  f.replicas[1]!.receive(f.take());
  await assert.rejects(actionsFor(b!, []).invoke(todoActions.revert, { change_id: created.change_id }), { code: "actions.forbidden" });
  assert.throws(() => b!.revert({ change_id: created.change_id }, { ...access, everything: false, projectId: "other" }), { code: "todo.not_found" });
  assert.equal(b!.get(created.item.id, projectAccess).title, "项目私有");
});

test("PCSYNC-TODO-UNDO-03: clock rollback keeps causal history order and batch undo remains atomic", t => {
  const f = fixture(t), [a, b] = f.stores;
  const first = a!.create({ title: "第一项" }, access).item;
  const second = a!.create({ title: "第二项" }, access).item;
  f.clock.now = new Date("2026-10-21T10:00:00Z");
  const batch = a!.batch([first.id, second.id], { status: "done" }, undefined, access);
  f.replicas[1]!.receive(f.take());
  f.replicas[1]!.receive(f.take());
  for (const id of [first.id, second.id]) {
    const history = b!.history(id, access);
    assert.equal(history[0]!.kind, "status");
    assert.ok(history[0]!.at < history[1]!.at);
  }
  assert.equal(b!.revert({ batch_id: batch.batch_id }, access).items.length, 2);
  f.replicas[0]!.receive(f.take(1));
  f.replicas[0]!.receive(f.take(1));
  for (const id of [first.id, second.id]) assert.equal(a!.get(id, access).status, "open");
  const again = a!.batch([first.id, second.id], { status: "done" }, undefined, access);
  f.replicas[1]!.receive(f.take());
  f.replicas[1]!.receive(f.take());
  b!.update(second.id, { notes: "后续编辑" }, b!.get(second.id, access).revision, access);
  const before = [b!.get(first.id, access), b!.get(second.id, access)];
  assert.throws(() => b!.revert({ batch_id: again.batch_id }, access), { code: "todo.conflict" });
  assert.deepEqual([b!.get(first.id, access), b!.get(second.id, access)], before);
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
