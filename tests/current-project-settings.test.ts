import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { SqlitePluginEventsRepository, SqlitePluginPrivateStorage, SqlitePluginRuntimeReleaseArtifactRepository,
  SqlitePluginRuntimeRepository, SqlitePluginWiringRepository } from "@molis-ai/molis-work-plugin-runtime";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { DatabaseSync } from "node:sqlite";
import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { projectDirectoryActions, projectSettingsCapabilities as settings } from "@molis-ai/molis-work-contracts/modules/projects";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";

const workspace = (id: string) => ({ workspace_id: id, canonical_path: "/test/" + id, realpath_verified: true, display_name: id });

// SSC-05: the browsing position is in no contract — its actions and table are gone; a plugin reads the project's folders with
// `projects.directories.get@1`, declared in its Manifest, for the project of its call only.
test("Manifest gates the project's directories; host scopes them to the call's project, rejects injected selectors, and keeps no browsing choice", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-settings-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const [projectA, projectB] = [await catalog.createProject({ display_name: "A", actor_id: "user" }), await catalog.createProject({ display_name: "B", actor_id: "user" })];
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  const references = new Map([projectA, projectB].map(row => [row.project_id, molisWorkHostProjectReference({ databasePath: row.database_path, projectId: row.project_id })]));
  const reference = (projectId: string) => references.get(projectId)!;
  const a = projectA.project_id, b = projectB.project_id;
  const store = new LocalProjectDatabase(join(home, "plugins.db"));
  // A plugin consuming `consumes`, started through the Host's plugin executor; its `services.actions` is what a plugin calls.
  const consumer = async (name: string, consumes: readonly string[], projectId = a) => {
    const plugin = callerPlugin(name, "project", {}, consumes);
    await startPlugin(host, reference(projectId), store, plugin);
    return plugin.actions(projectId);
  };
  const control = { beforeEffect: async () => {} };
  const get = projectDirectoryActions.get;
  try {
    const person = host.client(reference(a));
    const own = await person.invoke(get, {});
    assert.equal(own.project_id, a);
    assert.equal(own.directories.filter(item => item.roles.includes("output")).length, 1);
    const registered = host.status().capabilities;
    assert.ok(registered.some(row => row.capability_id === get.capability_id && row.version === 1 && row.action));
    for (const id of ["projects.workspaces.list", "projects.settings.workspaces.read", "projects.settings.browsing-workspace.read", "projects.settings.browsing-workspace.select"]) {
      assert.ok(!registered.some(row => row.capability_id === id || row.capability_id === id + ".v1"), `${id} is not registered`);
    }
    // Files and Coding read the folders with their roles; neither declares a browsing setting.
    for (const manifest of [filesManifest, codingManifest]) {
      assert.ok(manifest.capabilities.consumes.includes(get.capability_id), manifest.plugin_id);
      assert.ok(!manifest.capabilities.consumes.some(id => id.startsWith("projects.settings.workspaces") || id.startsWith("projects.settings.browsing-workspace")), manifest.plugin_id);
    }
    const none = await consumer("none", []);
    await assert.rejects(none.invoke(get, {}, control), /没有声明/);
    const files = await consumer("files", [get.capability_id]);
    assert.deepEqual(await files.invoke(get, {}, control), own);
    const ofB = await consumer("files-b", [get.capability_id], b);
    const theirs = await ofB.invoke(get, {}, control);
    assert.equal(theirs.project_id, b);
    assert.equal(theirs.directories.some(item => own.directories.some(mine => mine.workspace_id === item.workspace_id)), false, "another project's folders are not offered");
    await assert.rejects(files.invoke(get, { project_id: b } as never, control), { code: "actions.input_invalid" });
    await assert.rejects(person.invoke(get, { project_id: b } as never), { code: "actions.input_invalid" });
    // Reading keeps no browsing choice in the project's database.
    const database = new DatabaseSync(projectA.database_path, { readOnly: true });
    try { assert.deepEqual(database.prepare("SELECT name FROM sqlite_master WHERE name = 'project_browsing_settings'").all(), []); } finally { database.close(); }
    const unavailable = new MolisWorkLocalHost();
    try { await assert.rejects(unavailable.client(reference(a)).invoke(get, {}), { code: "actions.service_unavailable" }); }
    finally { await unavailable.close(); }
  } finally { store.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("RAC-454 the project's Runtime pick is the person's own setting: Coding reads it by its declaration, nothing else picks it, a project that never picked has no table, and another project does not see it", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-runtime-pick-"));
  const host = new MolisWorkLocalHost({ workspacesFor: id => [workspace(id)] });
  const reference = (projectId: string) => molisWorkHostProjectReference({ databasePath: join(home, projectId + ".db"), projectId });
  const a = reference("a");
  const user = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, audience: "user" as const, project_id: "a", permissions: ["projects:settings"] };
  const store = new LocalProjectDatabase(join(home, "plugins.db"));
  // A plugin started in `projectId` through the Host's plugin executor, consuming what `manifest` declares of the Runtime pick.
  const pick = [settings.runtime, settings.selectRuntime].map(item => item.capability_id);
  const consumer = async (name: string, manifest: { capabilities: { consumes: readonly string[] } }, projectId: string, permissions: Readonly<Record<string, boolean>> = {}) => {
    const plugin = callerPlugin(name, "project", permissions, manifest.capabilities.consumes.filter(id => pick.includes(id)));
    await startPlugin(host, reference(projectId), store, plugin);
    return plugin.actions(projectId);
  };
  const control = { beforeEffect: async () => {} };
  const hasTable = (projectId: string) => {
    const database = new DatabaseSync(join(home, projectId + ".db"), { readOnly: true });
    try { return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_runtime_settings'").all().length === 1; } finally { database.close(); }
  };
  try {
    const coding = await consumer("coding", codingManifest, "a"), codingOfB = await consumer("coding-b", codingManifest, "b");
    assert.equal(await coding.invoke(settings.runtime, [], control), null, "no pick is the Home default");
    assert.equal(hasTable("a"), false, "reading leaves the project's database as it was");
    assert.equal(await host.actionClient(a).invoke(user, settings.selectRuntime, ["engine-b"]), "engine-b");
    assert.equal(await coding.invoke(settings.runtime, [], control), "engine-b");
    assert.equal(hasTable("a"), true);
    assert.equal(await codingOfB.invoke(settings.runtime, [], control), null, "another project does not see it");
    await assert.rejects((await consumer("files", filesManifest, "a")).invoke(settings.runtime, [], control), /没有声明/);
    await assert.rejects(coding.invoke(settings.selectRuntime, ["engine-c"], control), { code: "plugin.grant_denied" }, "Coding has no grant to choose the person's Runtime");
    const granted = await consumer("granted-unconsumed", codingManifest, "a", { "projects:settings": true });
    await assert.rejects(granted.invoke(settings.selectRuntime, ["engine-c"], control), { code: "actions.forbidden", message: /没有声明/ }, "a granted plugin must still declare the specific action");
    assert.equal(await coding.invoke(settings.runtime, [], control), "engine-b", "both refusals retain the person's existing pick");
    for (const input of [[], [5], ["x", "y"], [""]]) await assert.rejects(host.actionClient(a).invoke(user, settings.selectRuntime, input as never), { code: "actions.input_invalid" });
    assert.equal(await host.actionClient(a).invoke(user, settings.selectRuntime, [null]), null);
    assert.equal(await coding.invoke(settings.runtime, [], control), null, "null puts the project back on the Home default");
  } finally { store.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("B4: composing project repositories cannot repair a database outside its baseline", () => {
  const db = openTestSqlite(":memory:");
  try {
    db.exec("PRAGMA user_version = 9");
    new AttentionModule(db, { exists: () => false });
    new SqlitePluginEventsRepository(db);
    new SqlitePluginPrivateStorage(db);
    new SqlitePluginRuntimeReleaseArtifactRepository(db);
    const installs = new SqlitePluginRuntimeRepository(db);
    new SqlitePluginWiringRepository(db);
    assert.throws(() => installs.list(), /no such table: plugin_runtime_installs/);
    assert.equal(db.pragma("user_version", { simple: true }), 9);
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all(), []);
  } finally { db.close(); }
});
