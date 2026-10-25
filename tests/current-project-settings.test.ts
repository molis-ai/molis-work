import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { projectSettingsCapabilities as settings, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ProjectBrowsingSettings } from "../apps/local-host/dist/project-browsing-settings.js";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";

const workspace = (id: string) => ({ workspace_id: id, canonical_path: "/test/" + id, realpath_verified: true, display_name: id });

test("Manifest gates individual settings; host scopes and projects records, rejects injected selectors", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-settings-"));
  const host = new MolisWorkLocalHost({ workspacesFor: id => [{ ...workspace(id), project_ids: [id, "secret-project"], created_at: "private" }] });
  const reference = (projectId: string) => molisWorkHostProjectReference({ databasePath: join(home, projectId + ".db"), projectId: projectId });
  const client = (projectId: string) => host.client(reference(projectId));
  const store = new LocalProjectDatabase(join(home, "plugins.db"));
  // A plugin consuming `consumes`, started through the Host's plugin executor; its `services.actions` is what a plugin calls.
  const consumer = async (name: string, consumes: readonly string[]) => {
    const plugin = callerPlugin(name, "project", {}, consumes);
    await startPlugin(host, reference("a"), store, plugin);
    return plugin.actions("a");
  };
  const control = { beforeEffect: async () => {} };
  try {
    const a = client("a"), b = client("b");
    await a.invoke(projectsCapabilities.listWorkspaces, []);
    // Files reads the current directory only; Coding reads the current directory (one directory for new rounds, Files and Git) as well as the list.
    assert.deepEqual([settings.workspaces, settings.browsingWorkspace].map(item => filesManifest.capabilities.consumes.includes(item.capability_id)), [false, true]);
    assert.deepEqual([settings.workspaces, settings.browsingWorkspace].map(item => codingManifest.capabilities.consumes.includes(item.capability_id)), [true, true]);
    const none = await consumer("none", []);
    await assert.rejects(none.invoke(settings.workspaces, [], control), /没有声明/);
    await assert.rejects(none.invoke(settings.browsingWorkspace, [], control), /没有声明/);
    const files = await consumer("files", [settings.browsingWorkspace.capability_id]);
    assert.deepEqual(await files.invoke(settings.browsingWorkspace, [], control), workspace("a"));
    await assert.rejects(files.invoke(settings.workspaces, [], control), /没有声明/);
    const coding = await consumer("coding", [settings.workspaces.capability_id, settings.browsingWorkspace.capability_id]);
    assert.deepEqual(await coding.invoke(settings.workspaces, [], control), [workspace("a")]);
    assert.deepEqual(await coding.invoke(settings.browsingWorkspace, [], control), workspace("a"));
    // Each setting is gated on its own: declaring the list does not grant the current directory.
    const listOnly = await consumer("listonly", [settings.workspaces.capability_id]);
    assert.deepEqual(await listOnly.invoke(settings.workspaces, [], control), [workspace("a")]);
    await assert.rejects(listOnly.invoke(settings.browsingWorkspace, [], control), /没有声明/);
    assert.deepEqual(await b.invoke(settings.workspaces, []), [workspace("b")]);
    assert.deepEqual(await a.invoke(projectsCapabilities.listWorkspaces, []), [workspace("a")]);
    await assert.rejects(a.invoke(settings.workspaces, { project_id: "b" } as never), { code: "actions.input_invalid" });
    await assert.rejects(a.invoke(settings.browsingWorkspace, ["b"] as never), { code: "actions.input_invalid" });
    const unavailable = new MolisWorkLocalHost();
    try { await assert.rejects(unavailable.client(a.project).invoke(settings.workspaces, [])); }
    finally { await unavailable.close(); }
  } finally { store.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("browsing choice persists; membership remains authoritative across restart and revocation", () => {
  const db = new Database(":memory:");
  try {
    const workspaces = [workspace("one"), workspace("two")];
    const preferences = new ProjectBrowsingSettings(db);
    assert.equal(preferences.read("a", workspaces), null, "nothing is chosen for the person among two");
    assert.deepEqual(preferences.read("a", [workspace("two")]), workspace("two"), "the one linked workspace needs no choice");
    preferences.select("a", "one", workspaces);
    assert.deepEqual(new ProjectBrowsingSettings(db).read("a", workspaces), workspace("one"));
    assert.throws(() => preferences.select("a", "foreign", workspaces), /当前项目/);
    assert.equal(preferences.read("a", [workspace("two")]), null);
    assert.equal(preferences.read("a", [{ ...workspace("one"), realpath_verified: false }]), null);
    assert.deepEqual(preferences.read("a", workspaces), workspace("one"));
    assert.deepEqual(db.prepare("SELECT * FROM project_browsing_settings").all(), [{ project_id: "a", workspace_id: "one" }]);
  } finally { db.close(); }
});

test("empty and multi-directory settings do not invent a selection", () => {
  const db = new Database(":memory:");
  try {
    const settings = new ProjectBrowsingSettings(db);
    assert.equal(settings.read("a", []), null);
    assert.equal(settings.read("a", [workspace("one"), workspace("two")]), null);
    assert.deepEqual(settings.read("a", [workspace("one")]), workspace("one"));
  } finally { db.close(); }
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
  const consumer = async (name: string, manifest: { capabilities: { consumes: readonly string[] } }, projectId: string) => {
    const plugin = callerPlugin(name, "project", {}, manifest.capabilities.consumes.filter(id => pick.includes(id)));
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
    await assert.rejects(coding.invoke(settings.selectRuntime, ["engine-c"], control), /没有声明/, "a plugin reads the pick and never makes it");
    for (const input of [[], [5], ["x", "y"], [""]]) await assert.rejects(host.actionClient(a).invoke(user, settings.selectRuntime, input as never), { code: "actions.input_invalid" });
    assert.equal(await host.actionClient(a).invoke(user, settings.selectRuntime, [null]), null);
    assert.equal(await coding.invoke(settings.runtime, [], control), null, "null puts the project back on the Home default");
  } finally { store.close(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
