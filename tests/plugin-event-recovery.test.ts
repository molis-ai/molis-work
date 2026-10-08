import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { PluginEventRecoveryInput, PluginEventRecoveryView } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginEventsRepository, PluginEventBus, PluginRuntime, PluginSupervisor, SqlitePluginEventsRepository, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { eventCrashDefinition, EVENT_BOARD, EVENT_SOURCE, EVENT_SUBSCRIBER, EVENT_TYPE } from "./fixtures/plugin-event-crash.js";

function confirmation(view: PluginEventRecoveryView, decision: "skip" | "retry" = "skip"): PluginEventRecoveryInput {
  const cursor = view.cursor;
  return { subscriber_plugin_id: cursor.subscriber_plugin_id, source_plugin_id: cursor.source_plugin_id,
    event_type_id: cursor.event_type_id, type_version: cursor.type_version, event_id: view.event!.event_id,
    expected_revision: cursor.revision, expected_install_id: cursor.subscriber_install_id,
    expected_generation: cursor.subscriber_generation, expected_version: view.subscriber_version!, decision,
    reason: decision === "skip" ? "已核对原业务结果，结束这次通知" : "已核对现场，明确接受重试可能产生重复结果" };
}

async function fixture(t: TestContext, memory = false) {
  const directory = mkdtempSync(join(tmpdir(), "event-recovery-")), file = join(directory, "events.db");
  const db = new Database(file);
  db.exec("CREATE TABLE effects (id INTEGER PRIMARY KEY, value TEXT)");
  const repository = memory ? new MemoryPluginEventsRepository() : new SqlitePluginEventsRepository(db);
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db)), supervisor = new PluginSupervisor(runtime);
  const bus = new PluginEventBus({ projectId: EVENT_BOARD, lifecycle: supervisor, repository });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let holding = true;
  const subscriber = eventCrashDefinition(EVENT_SUBSCRIBER, async context => {
    context.beforeEffect();
    db.prepare("INSERT INTO effects (value) VALUES ('applied')").run();
    if (holding) { entered.resolve(); await release.promise; context.beforeEffect(); }
  });
  t.after(async () => {
    release.resolve(); await bus.close();
    for (const install of runtime.list()) if (install.state === "running") await runtime.stop(install.install_id);
    db.close(); rmSync(directory, { recursive: true, force: true });
  });
  await supervisor.start([{ definition: eventCrashDefinition(EVENT_SOURCE) }, { definition: subscriber }]);
  const publish = (value: string) => bus.publish({ project_id: EVENT_BOARD, plugin_id: EVENT_SOURCE,
    install_id: supervisor.installation(EVENT_SOURCE)!.install_id }, { event_type_id: EVENT_TYPE, type_version: 1, payload: { value } });
  publish("first"); await entered.promise; publish("second");
  bus.revoke(EVENT_BOARD, EVENT_SUBSCRIBER); await bus.drain();
  holding = false; release.resolve();
  assert.equal(bus.recoveries(EVENT_BOARD)[0]!.cursor.state, "quarantined");
  const count = () => (db.prepare("SELECT count(*) AS count FROM effects").get() as { count: number }).count;
  assert.equal(count(), 1, "the first handler committed before acknowledgement was interrupted");
  return { bus, repository, runtime, supervisor, subscriber, db, file, count, publish };
}

for (const memory of [false, true]) {
  for (const decision of ["skip", "retry"] as const) {
    test(`${memory ? "memory" : "SQLite"} explicit ${decision} changes only the selected delivery and keeps the decision history`, async t => {
      const rig = await fixture(t, memory);
      const input = confirmation(rig.bus.recoveries(EVENT_BOARD)[0]!, decision);
      const receipt = rig.bus.recover(EVENT_BOARD, "local-reviewer", input);
      assert.equal(receipt.actor_id, "local-reviewer");
      assert.equal(receipt.reason, input.reason);
      assert.equal(receipt.event_id, rig.bus.log(EVENT_BOARD)[0]!.event_id);
      assert.throws(() => rig.bus.recover(EVENT_BOARD, "local-reviewer", input), { code: "event_recovery_changed" });
      await rig.bus.drain();
      assert.equal(rig.count(), decision === "skip" ? 2 : 3);
      assert.equal(rig.bus.cursors(EVENT_BOARD)[0]!.delivered_sequence, 2);
      assert.deepEqual(rig.bus.recoveries(EVENT_BOARD), []);
      assert.deepEqual(rig.bus.recoveryHistory(EVENT_BOARD), [receipt]);
      assert.deepEqual(rig.bus.recoveryHistory("other-board"), []);
      if (!memory) {
        const reopened = new Database(rig.file);
        try { assert.deepEqual(new SqlitePluginEventsRepository(reopened).resolutions(EVENT_BOARD), [receipt]); }
        finally { reopened.close(); }
      }
      rig.publish("third"); await rig.bus.drain();
      assert.equal(rig.count(), decision === "skip" ? 3 : 4, "the subscription remains usable after resolution");
    });
  }
}

test("a failed audit insert rolls back the cursor and a competing connection cannot reuse the old confirmation", async t => {
  const rig = await fixture(t), view = rig.bus.recoveries(EVENT_BOARD)[0]!;
  const input = confirmation(view), before = rig.bus.cursors(EVENT_BOARD);
  rig.db.exec("CREATE TRIGGER fail_resolution BEFORE INSERT ON plugin_event_resolutions BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", input), /audit unavailable/);
  assert.deepEqual(rig.bus.cursors(EVENT_BOARD), before);
  assert.deepEqual(rig.bus.recoveryHistory(EVENT_BOARD), []);
  assert.equal(rig.count(), 1);
  rig.db.exec("DROP TRIGGER fail_resolution");
  const other = new Database(rig.file), competitor = new SqlitePluginEventsRepository(other);
  try {
    const receipt = rig.bus.recover(EVENT_BOARD, "first-user", input);
    const current = rig.bus.cursors(EVENT_BOARD)[0]!;
    assert.equal(competitor.resolveCursor(view.cursor, { ...current, revision: "competitor", state: "idle" },
      { ...receipt, actor_id: "second-user" }), false);
    assert.deepEqual(competitor.resolutions(EVENT_BOARD), [receipt]);
    await rig.bus.drain(); assert.equal(rig.count(), 2);
  } finally { other.close(); }
});

test("wrong project, stale code, stopped installation and unbound history cannot authorize recovery", async t => {
  const rig = await fixture(t), view = rig.bus.recoveries(EVENT_BOARD)[0]!, input = confirmation(view);
  assert.throws(() => rig.bus.recover("other-board", "tester", input), { code: "event_identity_invalid" });
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", { ...input, reason: " " }), { code: "event_recovery_invalid" });
  const upgraded = { ...rig.subscriber, manifest: { ...rig.subscriber.manifest, version: "2.0.0",
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } };
  await rig.supervisor.upgrade(EVENT_SUBSCRIBER, upgraded);
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", input), { code: "event_recovery_changed" });
  const fresh = confirmation(rig.bus.recoveries(EVENT_BOARD)[0]!);
  assert.equal(fresh.expected_version, "2.0.0");
  rig.supervisor.revoke(EVENT_SUBSCRIBER);
  assert.equal(rig.bus.recoveries(EVENT_BOARD)[0]!.can_recover, false);
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", fresh), { code: "event_recovery_changed" });
  await rig.supervisor.enable(EVENT_SUBSCRIBER);
  rig.repository.saveCursor({ ...view.cursor, revision: "legacy", subscriber_install_id: "", subscriber_generation: "" });
  const legacy = rig.bus.recoveries(EVENT_BOARD).find(row => !row.cursor.subscriber_generation)!;
  assert.equal(legacy.can_recover, false);
  assert.equal(rig.count(), 1);
  assert.deepEqual(rig.bus.recoveryHistory(EVENT_BOARD), []);
});

test("same-id reinstall never takes over the old event and close cannot resolve it", async t => {
  const rig = await fixture(t), view = rig.bus.recoveries(EVENT_BOARD)[0]!, input = confirmation(view);
  rig.supervisor.revoke(EVENT_SUBSCRIBER);
  await rig.runtime.uninstall(input.expected_install_id);
  rig.runtime.install({ definition: rig.subscriber, deployment: "local", grants: [] });
  await rig.supervisor.start([{ definition: rig.subscriber }]); await rig.supervisor.enable(EVENT_SUBSCRIBER);
  assert.equal(rig.supervisor.installation(EVENT_SUBSCRIBER)!.install_id, input.expected_install_id);
  assert.notEqual(rig.supervisor.installation(EVENT_SUBSCRIBER)!.installation_generation, input.expected_generation);
  assert.equal(rig.bus.recoveries(EVENT_BOARD)[0]!.can_recover, false);
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", input), { code: "event_recovery_changed" });
  await rig.bus.close();
  assert.throws(() => rig.bus.recover(EVENT_BOARD, "tester", input), { code: "event_recovery_changed" });
  assert.equal(rig.count(), 1);
});
