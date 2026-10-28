import assert from "node:assert/strict";
import test from "node:test";
import { scheduleServiceFor } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { SCHEDULE_PLUGIN_ID, scheduleActions, SCHEDULE_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-schedule";
import { openTestHome } from "./fixtures/test-home.js";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

// The real settings endpoint returns after withdrawing the activation, not merely after hiding its UI.
test("SYS-15-S7: new projects enable Schedule; settings stop its Runtime, preserve tasks and restore the same installation", { timeout: 60_000 }, async t => {
  const f = await openTestHome(t), project = await f.createProject("Schedule lifecycle");
  assert.ok(await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => catalog.listProjectPlugins(project.project_id).includes("schedule")));
  const caller = { actor_id: "web-user", project_id: project.project_id, audience: "user" as const, permissions: SCHEDULE_ACTION_PERMISSIONS };
  const client = f.host.actionClient(project.reference);
  const created = await client.invoke(caller, scheduleActions.createTask, { title: "Morning brief", instructions: "Summarize supplied facts", time: "08:30" });
  const store = await f.host.withProject(project.reference, runtime => runtime.store), records = new SqlitePluginRuntimeRepository(store.db);
  const before = records.list().find(record => record.plugin_id === SCHEDULE_PLUGIN_ID)!;
  assert.equal(before.state, "running");
  const clock = scheduleServiceFor(store.db), job = clock.get(created.task.job_id!)!;
  const change = (method: string) => method === "DELETE"
    ? f.web.delete(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" })
    : f.web.post(`/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`, { plugin_id: "schedule" });
  await change("DELETE");
  assert.equal(records.get(before.install_id)!.state, "disabled");
  assert.ok(!(await client.discover(caller)).some(view => view.provider.plugin_id === SCHEDULE_PLUGIN_ID));
  const due = new Date(Date.parse(job.next_due_at) + 1000);
  assert.equal((await clock.tick(due)).invoked, 0, "a stopped owner is never claimed");
  assert.equal(clock.get(job.job_id)!.next_due_at, job.next_due_at, "pausing does not consume a due occurrence");
  assert.equal(createLocalFeedApplication(store.db).snapshot(project.project_id).feed_items.length, 0);
  await f.host.closeProject(project.reference);
  assert.ok(!(await client.discover(caller)).some(view => view.provider.plugin_id === SCHEDULE_PLUGIN_ID), "reopening reads the persisted disabled membership");
  await change("POST");
  const restored = await f.host.withProject(project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db).get(before.install_id));
  assert.equal(restored!.state, "running"); assert.equal(restored!.installation_generation, before.installation_generation);
  const listed = await client.invoke(caller, scheduleActions.list, {});
  assert.deepEqual(listed.tasks.map(task => task.task_id), [created.task.task_id]);
  assert.equal(listed.tasks[0]!.enabled, true);
});
