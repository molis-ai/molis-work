import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, molisWorkHostProjectReference, scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { feedManifest, FeedOutRuleStore } from "@molis-ai/molis-work-plugin-feed";
import { SourcesModule, fromBetterSqlite } from "@molis-ai/molis-work-plugin-feed/store";
import { scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import { personalSyncFixture } from "./fixtures/personal-sync-coordinator.js";
import { runtimePersonalSync } from "./fixtures/runtime-personal-sync.js";

test("D0347: received Feed and Schedule content stays disabled after Runtime restart and a scheduler wakeup", { timeout: 60_000 }, async t => {
  const f = personalSyncFixture(t), previous = process.env.MOLIS_WORK_SYNC_LOCAL;
  process.env.MOLIS_WORK_SYNC_LOCAL = "1";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SYNC_LOCAL; else process.env.MOLIS_WORK_SYNC_LOCAL = previous; });
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    requests.push(String(input));
    return f.transport(input, init);
  });
  const project = await withMolisWorkProjectCatalog({ homeDirectory: f.homes[0] }, async catalog => {
    const created = await catalog.createProject({ display_name: "同步后的定时内容", actor_id: "alice" });
    for (const plugin_id of ["feed", "schedule"]) catalog.addProjectPlugin({ project_id: created.project_id, plugin_id, actor_id: "alice" });
    return created;
  });
  await withMolisWorkProjectCatalog({ homeDirectory: f.homes[1] }, async catalog => {
    await catalog.ensureSyncedProject({ project_id: project.project_id, display_name: project.display_name, actor_id: "alice" }, () => {});
    for (const plugin_id of ["feed", "schedule"]) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "alice" });
  });
  const source = await runtimePersonalSync(f.homes[0], f.space), target = await runtimePersonalSync(f.homes[1], f.space);
  f.closeWith(() => source.close()); f.closeWith(() => target.close());
  const sourceStore = new LocalProjectDatabase(project.database_path);
  let ruleId = "";
  try {
    sourceStore.db.prepare(`INSERT INTO schedule_conversation_tasks (task_id,title,instructions,hour,minute,notify_important,enabled,archived,unread,job_id,last_run_at,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run("sync-task", "跨设备提醒", "检查进展", 9, 0, 1, 1, 0, 0, "origin-job", null, null, "2026-11-08T00:00:00.000Z", "2026-11-08T00:00:00.000Z");
    const db = fromBetterSqlite(sourceStore.db);
    ruleId = new FeedOutRuleStore(db).create(project.project_id, { name: "跨设备捕捉", match: { contains: "发布" }, enabled: true }).rule_id;
    new SourcesModule(db).commands.save({ project_id: project.project_id, source_id: "portable-source", kind: "github", definition_id: "github.notifications", sync_kind: "github", name: "跨设备来源", description: "只同步描述与历史", status: "active", enabled: true, origin: "molis_work", config: { connection_id: "this-device-only-connection" }, schedule: { mode: "interval", enabled: true, interval_minutes: 30, next_pull_at: null }, connection_ref: "this-device-only-reference", account_label: "This device", last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: "2026-11-08T00:00:00.000Z", updated_at: "2026-11-08T00:00:00.000Z" });
  } finally { sourceStore.close(); }
  await source.sync.run(); await target.sync.run();
  const selections = [feedManifest, scheduleManifest].flatMap(manifest => manifest.sync!.collections.map(collection => ({ plugin_id: manifest.plugin_id, publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature, collection_id: collection.id, schema_version: collection.schema_version })));
  await source.sync.save({ ...source.sync.policy(), selections });
  for (let round = 0; round < 4; round++) { await source.sync.run(); await target.sync.run(); }
  assert.equal(source.sync.status().error, null); assert.equal(target.sync.status().error, null);
  const received = await target.withCatalog({ homeDirectory: f.homes[1] }, catalog => catalog.listProjects().find(item => item.project_id === project.project_id)!);
  const assertDisabled = (store: Pick<LocalProjectDatabase, "db">) => {
    const task = store.db.prepare("SELECT title,enabled,job_id FROM schedule_conversation_tasks WHERE task_id=?").get("sync-task") as { title: string; enabled: number; job_id: string | null };
    assert.equal(task.title, "跨设备提醒"); assert.equal(task.enabled, 0); assert.equal(task.job_id, null);
    const db = fromBetterSqlite(store.db);
    const rule = new FeedOutRuleStore(db).get(project.project_id, ruleId);
    assert.equal(rule.name, "跨设备捕捉"); assert.equal(rule.enabled, false);
    const imported = new SourcesModule(db).query.get(project.project_id, "portable-source");
    assert.equal(imported.name, "跨设备来源"); assert.equal(imported.enabled, false);
    assert.equal(imported.connection_ref, null); assert.deepEqual(imported.config, {}); assert.deepEqual(imported.schedule, { mode: "manual" });
    assert.equal((store.db.prepare("SELECT COUNT(*) AS n FROM schedule_conversation_turns WHERE task_id=?").get("sync-task") as { n: number }).n, 0);
  };
  const beforeRestart = new LocalProjectDatabase(received.database_path);
  try { assertDisabled(beforeRestart); } finally { beforeRestart.close(); }
  target.sync.close();
  const reference = molisWorkHostProjectReference({ databasePath: received.database_path, projectId: project.project_id });
  await target.host.closeProject(reference);
  const beforeRequests = requests.length;
  await target.host.withProject(reference, async runtime => {
    const scheduler = scheduleServiceFor(runtime.store.db), jobs = scheduler.list();
    assert.equal(jobs.filter(job => job.object_ref === "sync-task" || job.object_ref === ruleId || job.object_ref === "portable-source").length, 0, "received content registers no job after restart");
    // Cross the daily task, the 30-minute source and every existing maintenance due point.
    const afterDue = new Date(Math.max(Date.now() + 2 * 86400_000, ...jobs.filter(job => job.enabled).map(job => Date.parse(job.next_due_at))) + 1);
    const result = await scheduler.tick(afterDue);
    assert.equal(result.failed, 0, "the maintenance wakeup still succeeds");
    assertDisabled(runtime.store);
  }, { activatePlugins: true });
  assert.equal(requests.length, beforeRequests, "neither reopening nor the scheduler pulls received content before local opt-in");
});
