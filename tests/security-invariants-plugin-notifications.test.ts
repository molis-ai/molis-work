import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPluginPlatform, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PluginNotificationQueue } from "@molis-ai/molis-work-plugin-runtime";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import type { PluginDatabaseTransaction, PluginDefinition, PluginHostServices, PluginNotificationReceipt } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";

const notice = { key: "one", title: "A reminder", summary: "Read the result", body: "The result is ready." };

function fixture(t: TestContext, projectId = DEMO_PROJECT_ID) {
  const directory = mkdtempSync(join(tmpdir(), "plugin-notifications-")), file = join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, projectId);
  const ports = { db: store.db, appendEvent: (event: Parameters<typeof store.appendEvent>[0]) => store.appendEvent(event), eventCursor: (id: string) => store.eventCursor(id) };
  const platform = createPluginPlatform({ db: store.db, project_id: projectId, actor_id: "tester", actions, home: null,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  t.after(async () => {
    await platform.closeCoordination();
    for (const record of platform.runtime.list()) if (record.state === "running") await platform.runtime.stop(record.install_id);
    store.close(); rmSync(directory, { recursive: true, force: true });
  });
  const start = async (name: string, declare = true) => {
    const id = "io.molis.work.example." + name;
    let services: PluginHostServices, work: (caller: ActionExecutionContext) => Promise<void> = async () => {};
    const command: ActionDefinition = { capability_id: name + ".deliver", version: 1, operation: "command", action: {
      title: "Deliver", description: "Deliver a notification with a business record", kind: "operation", scope: "project", audiences: ["user"],
      permissions: declare ? ["notifications:write"] : [], scheduling: "concurrent", subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "object" } } };
    const query: ActionDefinition = { ...command, capability_id: name + ".read", operation: "query", action: { ...command.action, kind: "query" } };
    const serial: ActionDefinition = { ...command, capability_id: name + ".serial", action: { ...command.action, scheduling: undefined } };
    const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, name, version: "1.0.0", kind: "app",
      publisher: { publisher_id: "example", signature: "fixture-" + name }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: ["storage:private", "example:read", "example:write", ...declare ? ["notifications:write"] : []].map(permission => ({ permission, required: true, reason: "Store and deliver" })),
      capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [command, query, serial],
      databases: { project: { store_name: name, version: 1, read_permission: "example:read", write_permission: "example:write", schema: `CREATE TABLE ${name}_notes (text TEXT NOT NULL);` } } },
      async start(context) { services = context.services!; return { kind: "app", actions: [command, query, serial].map(action => ({ ...action, handle: async caller => { await work(caller); return {}; } })) }; } };
    const report = await platform.start([{ definition, trust: { level: "host" } }]); assert.deepEqual(report.failed, []);
    const installation = () => platform.runtime.list().find(record => record.plugin_id === id)!;
    return { id, installation, get database() { return services.project_database!; }, get notifications() { return services.notifications; },
      invoke: (execute: typeof work, caller: Partial<ActionCallContext> = {}, mode: "command" | "query" | "serial" = "command") => {
        work = execute;
        return actions.client.invoke({ actor_id: "tester", project_id: projectId, audience: "user", permissions: ["notifications:write"], ...caller },
          mode === "query" ? query : mode === "serial" ? serial : command, {});
      },
      count: () => Number((store.db.prepare(`SELECT COUNT(*) AS n FROM ${name}_notes`).get() as { n: number }).n),
      stop: () => platform.runtime.stop(installation().install_id),
    };
  };
  // The notification is the platform's queue row until a receiver takes it; no project host runs here, so none does.
  return { start, queued: () => new PluginNotificationQueue(store.db).pending(projectId) };
}

test("SYS-15-N1: a Runtime notification and business record commit together and deduplicate", async t => {
  const f = fixture(t), a = await f.start("notifier");
  let first: PluginNotificationReceipt | undefined, second: PluginNotificationReceipt | undefined;
  await a.invoke(async caller => {
    first = await a.database.transaction(caller.beforeEffect, tx => {
      tx.run("INSERT INTO notifier_notes VALUES ('kept')"); return a.notifications!.deliver(tx, notice);
    });
    await first.settle();
    second = await a.database.transaction(caller.beforeEffect, tx => a.notifications!.deliver(tx, notice));
    await second.settle();
  });
  assert.equal(a.count(), 1); assert.equal(first!.created, true); assert.equal(second!.created, false); assert.equal(first!.notification_id, second!.notification_id);
  const queued = f.queued();
  assert.equal(queued.length, 1, "the same key is the same notification");
  const [row] = queued;
  assert.deepEqual([row!.notification_id, row!.sender_plugin_id, row!.open_plugin_id, row!.key, row!.title, row!.summary, row!.body],
    [first!.notification_id, a.id, a.id, notice.key, notice.title, notice.summary, notice.body]);
  assert.equal(row!.sender_install_id, a.installation().install_id); assert.equal(row!.sender_generation, a.installation().installation_generation);
});

test("SYS-15-N1: rollback, async writes and cancellation leave neither notification nor business record", async t => {
  const f = fixture(t), a = await f.start("notifier");
  let receipt: PluginNotificationReceipt | undefined;
  await a.invoke(async caller => {
    await assert.rejects(a.database.transaction(caller.beforeEffect, tx => {
      tx.run("INSERT INTO notifier_notes VALUES ('rollback')"); receipt = a.notifications!.deliver(tx, notice); throw new Error("rollback");
    }), /rollback/);
    await assert.rejects(receipt!.settle(), /回滚/);
    await assert.rejects(a.database.transaction(caller.beforeEffect, async tx => {
      tx.run("INSERT INTO notifier_notes VALUES ('async')"); a.notifications!.deliver(tx, notice);
    }), /同步/);
  });
  const controller = new AbortController();
  await assert.rejects(a.invoke(async caller => {
    await a.database.transaction(caller.beforeEffect, tx => {
      tx.run("INSERT INTO notifier_notes VALUES ('cancelled')"); a.notifications!.deliver(tx, notice); controller.abort();
    });
  }, { signal: controller.signal }));
  assert.equal(a.count(), 0); assert.deepEqual(f.queued(), []);
});

test("SYS-15-N2: notification transactions and clients reject foreign, copied and ended handles", async t => {
  const f = fixture(t), a = await f.start("notifier"), b = await f.start("another");
  const other = fixture(t, "another-project"), elsewhere = await other.start("notifier");
  let retained: PluginDatabaseTransaction | undefined, receipt: PluginNotificationReceipt | undefined;
  await a.invoke(async caller => {
    receipt = await a.database.transaction(caller.beforeEffect, tx => {
      retained = tx;
      assert.throws(() => a.notifications!.deliver(tx, { ...notice, open_plugin_id: "io.molis.work.not-installed" }), { code: "actions.input_invalid" });
      assert.throws(() => b.notifications!.deliver(tx, notice), { code: "actions.forbidden" });
      assert.throws(() => elsewhere.notifications!.deliver(tx, notice), { code: "actions.forbidden" });
      assert.throws(() => a.notifications!.deliver({ ...tx }, notice), { code: "actions.forbidden" });
      return a.notifications!.deliver(tx, notice);
    });
    assert.throws(() => a.notifications!.deliver(retained!, notice), { code: "actions.forbidden" });
  });
  await assert.rejects(b.invoke(async () => { await receipt!.settle(); }), { code: "actions.forbidden" });
  await a.stop(); await assert.rejects(receipt!.settle(), { code: "actions.forbidden" });
  assert.equal(f.queued().length, 1, "only the copied, foreign and ended handles were refused; the one real delivery is queued");
});

test("SYS-15-N2: undeclared, unauthorized, query and serial notification calls are refused", async t => {
  const f = fixture(t), a = await f.start("notifier"), absent = await f.start("absent", false);
  assert.equal(absent.notifications, undefined);
  const deliver = async (caller: ActionExecutionContext) => { await a.database.transaction(caller.beforeEffect, tx => a.notifications!.deliver(tx, notice)); };
  await assert.rejects(a.invoke(deliver, { permissions: [] }));
  await assert.rejects(a.invoke(deliver, {}, "query"));
  await assert.rejects(a.invoke(deliver, {}, "serial"), { code: "actions.forbidden" });
  assert.deepEqual(f.queued(), []);
});
