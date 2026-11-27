import assert from "node:assert/strict";
import test from "node:test";
import { LocalProjectDatabase, openPluginProjectLibrary, pluginOverviewFor } from "@molis-ai/molis-work-app-local-host";
import { defineBackgroundTasksAction, defineRunsOverviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";
import { inspectActionDeclarations, isProjectReadQuery } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

/*
 * S-49 (V17, batch 108): the Home's lists across partitions read only what plugins wrote into the overview. A main-database plugin writes
 * through `services.overview`, which stamps its installation, takes only the kinds its Manifest declares, refuses an installation no longer
 * running, and keeps a row with the business write it sums up or not at all. A project's own panels call only read-only project queries.
 */

const ROW = { row_id: "s1", title: "会话", state: "running", waiting: false, updated_at: "2026-11-26T10:00:00.000Z" } as const;

test("S-49 UPP-37 services.overview stamps the installation, writes only declared kinds, refuses a stopped installation, and changes with the business write or not at all", { timeout: 60_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Overview", ["coding"]);
  const store = new LocalProjectDatabase(project.database_path);
  t.after(() => store.close());
  const library = openPluginProjectLibrary({ db: store.db, path: store.path }, codingManifest, () => {}, { install_id: "overview-security", installation_generation: "1" }).client;
  const installId = installIdentity(codingManifest);
  let state: PluginInstanceRecord["state"] = "running";
  const record = () => ({ install_id: installId, plugin_id: codingManifest.plugin_id, state }) as PluginInstanceRecord;
  const context = { install_id: installId };
  const changed: string[] = [];
  const overview = pluginOverviewFor(codingManifest, context, library, store.db, () => {}, record, id => changed.push(id));
  assert.ok(overview, "a plugin that keeps its data in the main database and declares overview kinds is given the client");
  const rows = () => store.db.prepare("SELECT install_id, kind, row_id, state FROM plugin_overview_rows ORDER BY install_id, row_id").all() as Array<{ install_id: string; kind: string; row_id: string; state: string }>;
  const write = (body: Parameters<NonNullable<typeof overview>["join"]>[1]) => library.transaction(async () => {}, tx => overview!.join(tx, body));

  await write(rows => rows.upsert("background_task", ROW));
  assert.deepEqual(rows(), [{ install_id: installId, kind: "background_task", row_id: "s1", state: "running" }], "the platform stamps the installation; the plugin names none");
  assert.deepEqual(changed, [installId], "the overview is read again after the commit");
  // Another installation's rows in the same table are not this one's to change.
  store.db.prepare("INSERT INTO plugin_overview_rows (install_id, kind, row_id, title, state, waiting, updated_at) VALUES ('someone-else', 'background_task', 's1', 'x', 'running', 0, ?)").run(ROW.updated_at);
  await write(rows => rows.removePrefix("background_task", "s"));
  assert.deepEqual(rows(), [{ install_id: "someone-else", kind: "background_task", row_id: "s1", state: "running" }], "it reaches only its own rows");

  await assert.rejects(write(rows => rows.upsert("scheduled_run", { row_id: "r", title: "r", due_at: ROW.updated_at, updated_at: ROW.updated_at })), { code: "actions.forbidden" },
    "a kind the Manifest does not declare is refused");
  await assert.rejects(write(rows => rows.upsert("made-up" as never, ROW as never)), { code: "actions.input_invalid" });
  await assert.rejects(write(rows => rows.upsert("background_task", { ...ROW, state: "made-up" } as never)), "a row the SDK's check refuses is refused here too");

  // The row and the business write are one commit: a write that fails takes its row with it.
  await assert.rejects(library.transaction(async () => {}, tx => overview!.join(tx, rows => { rows.upsert("background_task", ROW); throw new Error("the business write failed"); })));
  assert.equal(rows().filter(row => row.install_id === installId).length, 0, "nothing of the failed write is kept");

  state = "disabled";
  await assert.rejects(write(rows => rows.upsert("background_task", ROW)), { code: "actions.forbidden" }, "an installation no longer running writes nothing");
  assert.equal(rows().filter(row => row.install_id === installId).length, 0);
});

test("S-49 a project's panels call only read-only project queries: a provider that writes, calls a model or costs money is not one", () => {
  const tasks = defineBackgroundTasksAction("example.tasks", 1, ["example_task"], "示例", ["example:read"]);
  assert.ok(isProjectReadQuery(tasks));
  assert.ok(!isProjectReadQuery({ ...tasks, operation: "command" }));
  assert.ok(!isProjectReadQuery({ ...tasks, action: { ...tasks.action, effect: "write" } }));
  assert.ok(!isProjectReadQuery({ ...tasks, action: { ...tasks.action, permissions: ["model:invoke"] } }));
  assert.ok(!isProjectReadQuery({ ...tasks, action: { ...tasks.action, execution: { cost: "metered" } } } as never));
  assert.ok(!isProjectReadQuery({ ...tasks, action: { ...tasks.action, scope: "home" } }));
  const runs = defineRunsOverviewAction("example.runs.overview", 1, "示例", [], "project");
  assert.deepEqual(inspectActionDeclarations([runs], undefined), []);
  assert.ok(inspectActionDeclarations([{ ...runs, action: { ...runs.action, effect: "write" } }], undefined).some(problem => problem.includes("运行概况")),
    "a project runs list that writes fails the Manifest check");
  assert.ok(!("home_aggregate" in runs.action) && !("home_aggregate" in tasks.action), "no action declares a cross-project read any more");
});
