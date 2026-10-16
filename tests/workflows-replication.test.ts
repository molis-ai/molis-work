import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ensureStorageSpace, homeSqlitePath, personalStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import type { SyncEvent, SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createWorkflowsActionHandlers, manualLink, newStation, openWorkflowsStore, workflowsActions,
  type WorkflowsActionPorts,
} from "@molis-ai/molis-work-plugin-workflows";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "workflows-sync-"));
  const homes = [join(root, "a"), join(root, "b")];
  const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
  homes.forEach(home => ensureStorageSpace(home, space));
  const stores = homes.map(openWorkflowsStore);
  const replicas: SyncReplicaAdapter[] = stores.map(store => store.replica({
    spaceId: space.spaceId,
    authorize() {},
    canUploadProject: projectId => projectId === "project",
    project(projectId) { assert.equal(projectId, "project"); return { title: "测试项目" }; },
    hasArtifact: () => true,
  } satisfies AggregateReplicaContext));
  let revision = 0;
  const deliver = (event: SyncEvent, target = replicas[1]!) => target.receive(event);
  const take = () => {
    const mutation = replicas[0]!.next();
    assert.ok(mutation);
    const event = { ...mutation, revision: ++revision };
    replicas[0]!.receive(event);
    return event;
  };
  t.after(() => { stores.forEach(store => store.close()); rmSync(root, { recursive: true, force: true }); });
  return { homes, stores, replicas, take, deliver, revision: () => ++revision };
}

test("workflow definitions and instance history transfer without handing execution authority to the target", t => {
  const f = fixture(t);
  const [a, b] = f.stores;
  const flow = a!.create({ project_id: "project", title: "写作流程", chain: {
    stations: [newStation("pages"), newStation("inbox")], links: [manualLink()],
  } });
  const instance = a!.startInstance(flow, { plugin: "pages", item_id: "document", title: "文章" });
  const definition = f.take();
  const history = f.take();
  assert.match(definition.key, /workflow/);
  assert.match(history.key, /instance/);
  f.deliver(definition);
  f.deliver(history);
  assert.deepEqual(b!.get(flow.workflow_id, "project").stations, flow.stations);
  assert.deepEqual(b!.instance(instance.instance_id, "project").steps, instance.steps);
  assert.throws(() => b!.assertExecutableInstance(instance.instance_id), /仅可查看/);
  assert.throws(() => b!.stopInstance(instance.instance_id, "project"), /仅可查看/);
  assert.throws(() => b!.saveInstance(instance, { ...instance, status: "done" }), /仅可查看/);
  assert.equal(f.replicas[1]!.next(), null);
  const previous = b!.get(flow.workflow_id, "project");
  a!.update(flow.workflow_id, "project", { title: "新版流程", revision: flow.revision });
  f.deliver(f.take());
  assert.ok(b!.get(flow.workflow_id, "project").revision > previous.revision);
  assert.throws(() => b!.update(flow.workflow_id, "project", { title: "过期编辑", revision: previous.revision }), /改过/);
});

test("out-of-order instance waits for its definition and a local active instance is never overwritten", t => {
  const f = fixture(t);
  const [a, b] = f.stores;
  const flow = a!.create({ project_id: "project", title: "流程", chain: {
    stations: [newStation("pages"), newStation("inbox")], links: [manualLink()],
  } });
  const instance = a!.startInstance(flow, { plugin: "pages", item_id: "document", title: "文章" });
  const definition = f.take(), history = f.take();
  f.deliver({ ...history, revision: 1 });
  assert.equal(f.replicas[1]!.conflicts()[0]?.waiting, true);
  f.deliver({ ...definition, revision: 2 });
  f.replicas[1]!.retryWaiting!();
  assert.equal(f.replicas[1]!.counts().conflicts, 0);
  assert.equal(b!.instance(instance.instance_id, "project").title, "文章");

  const local = b!.startInstance(flow, { plugin: "pages", item_id: "local", title: "本地运行" });
  const own = f.replicas[1]!.next();
  assert.ok(own);
  f.replicas[1]!.receive({ ...own, revision: 3 });
  const sourceDb = new DatabaseSync(homeSqlitePath(f.homes[1]!, "workflows"));
  const targetDb = new DatabaseSync(homeSqlitePath(f.homes[0]!, "workflows"));
  try {
    const source = sourceDb.prepare("SELECT * FROM instances WHERE instance_id=?").get(local.instance_id) as Record<string, string | number>;
    const columns = Object.keys(source);
    targetDb.prepare("INSERT INTO instances (" + columns.join(",") + ") VALUES (" + columns.map(() => "?").join(",") + ")")
      .run(...columns.map(column => column === "title" ? "远端运行" : source[column]!));
  } finally { sourceDb.close(); targetDb.close(); }
  f.deliver({ ...f.take(), revision: 4 });
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  assert.equal(b!.instance(local.instance_id, "project").title, "本地运行");
  assert.throws(() => f.replicas[1]!.resolve(f.replicas[1]!.conflicts()[0]!.key, "remote"), /不能被远端覆盖/);
});

test("workflow data is scoped to personal space and malformed payloads cannot replace a valid definition", t => {
  const f = fixture(t), a = f.stores[0]!, b = f.stores[1]!;
  const flow = a.create({ project_id: "project", title: "安全流程", chain: {
    stations: [newStation("pages"), newStation("inbox")], links: [manualLink()],
  } });
  const event = f.take();
  f.deliver(event);
  const invalid = structuredClone(event.value) as { record: Record<string, unknown> };
  invalid.record.secret = "not portable";
  f.deliver({ ...event, operationId: "invalid", value: invalid, revision: 2 });
  assert.equal(b.get(flow.workflow_id, "project").title, "安全流程");
  assert.equal(f.replicas[1]!.counts().conflicts, 1);
  assert.throws(() => b.replica({ spaceId: "wrong", authorize() {}, canUploadProject: () => true,
    project: () => ({ title: "x" }), hasArtifact: () => true }), /空间/);
});

test("imported workflow history is blocked at the public continue action before downstream dispatch", async t => {
  const f = fixture(t), a = f.stores[0]!, b = f.stores[1]!;
  const flow = a.create({ project_id: "project", title: "仅供查看", chain: {
    stations: [newStation("pages"), newStation("inbox")], links: [manualLink()],
  } });
  const instance = a.startInstance(flow, { plugin: "pages", item_id: "document", title: "文章" });
  f.deliver(f.take());
  f.deliver(f.take());
  let dispatched = 0;
  const ports: WorkflowsActionPorts = {
    withStore: async run => run(b),
    content: () => ({}) as ReturnType<WorkflowsActionPorts["content"]>,
    actions: () => ({
      discover: async () => { dispatched++; throw new Error("action discovery must not run"); },
      invoke: async () => { dispatched++; throw new Error("action invocation must not run"); },
    }),
    assertInput() {},
    aiAvailable: () => false,
  };
  const handler = createWorkflowsActionHandlers("project", ports)
    .find(row => row.capability_id === workflowsActions.continue.capability_id);
  assert.ok(handler);
  await assert.rejects(
    handler.handle({
      actor_id: "alice", project_id: "project", audience: "user",
      permissions: ["workflows:read", "workflows:write", "model:invoke"],
      beforeEffect: async () => {},
    } as never, { id: instance.instance_id }),
    /仅可查看/,
  );
  assert.equal(dispatched, 0, "the handler must not dispatch downstream");
});

test("imported workflow execution marker and history survive reopening the target Home", t => {
  const f = fixture(t), a = f.stores[0]!, b = f.stores[1]!;
  const flow = a.create({ project_id: "project", title: "可重启的历史", chain: {
    stations: [newStation("pages"), newStation("inbox")], links: [manualLink()],
  } });
  const instance = a.startInstance(flow, { plugin: "pages", item_id: "document", title: "文章" });
  a.stopInstance(instance.instance_id, "project");
  f.deliver(f.take());
  f.deliver(f.take());
  const received = b.instance(instance.instance_id, "project");
  assert.equal(received.status, "stopped");
  const reopened = openWorkflowsStore(f.homes[1]!);
  try {
    assert.deepEqual(reopened.instance(instance.instance_id, "project"), received);
    assert.throws(() => reopened.assertExecutableInstance(instance.instance_id), /仅可查看/);
  } finally { reopened.close(); }
});
