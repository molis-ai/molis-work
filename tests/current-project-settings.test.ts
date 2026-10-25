import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { projectSettingsCapabilities as settings, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ProjectBrowsingSettings } from "../apps/local-host/dist/project-browsing-settings.js";

const workspace = (id: string) => ({ workspace_id: id, canonical_path: "/test/" + id, realpath_verified: true, display_name: id });

test("Manifest gates individual settings; host scopes and projects records, rejects injected selectors", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-settings-"));
  const host = new MolisWorkLocalHost({ workspacesFor: id => [{ ...workspace(id), project_ids: [id, "secret-project"], created_at: "private" }] });
  const client = (projectId: string) => host.client(molisWorkHostProjectReference({ databasePath: join(home, projectId + ".db"), projectId: projectId }));
  try {
    const a = client("a"), b = client("b");
    const none = createPluginCapabilityClient({ ...filesManifest, capabilities: { provides: [], consumes: [] } }, a);
    await assert.rejects(none.invoke(settings.workspaces, []), /没有声明/);
    await assert.rejects(none.invoke(settings.browsingWorkspace, []), /没有声明/);
    const files = createPluginCapabilityClient(filesManifest, a);
    assert.deepEqual(await files.invoke(settings.browsingWorkspace, []), workspace("a"));
    await assert.rejects(files.invoke(settings.workspaces, []), /没有声明/);
    // Coding reads the project's current directory (one directory for new rounds, Files and Git) as well as the list.
    const coding = createPluginCapabilityClient(codingManifest, a);
    assert.deepEqual(await coding.invoke(settings.workspaces, []), [workspace("a")]);
    assert.deepEqual(await coding.invoke(settings.browsingWorkspace, []), workspace("a"));
    // Each setting is gated on its own: declaring the list does not grant the current directory.
    const listOnly = createPluginCapabilityClient({ ...codingManifest, capabilities: { ...codingManifest.capabilities,
      consumes: codingManifest.capabilities.consumes.filter(id => id !== settings.browsingWorkspace.capability_id) } }, a);
    assert.deepEqual(await listOnly.invoke(settings.workspaces, []), [workspace("a")]);
    await assert.rejects(listOnly.invoke(settings.browsingWorkspace, []), /没有声明/);
    assert.deepEqual(await b.invoke(settings.workspaces, []), [workspace("b")]);
    assert.deepEqual(await a.invoke(projectsCapabilities.listWorkspaces, []), [workspace("a")]);
    await assert.rejects(a.invoke(settings.workspaces, { project_id: "b" } as never), { code: "actions.input_invalid" });
    await assert.rejects(a.invoke(settings.browsingWorkspace, ["b"] as never), { code: "actions.input_invalid" });
    const unavailable = new MolisWorkLocalHost();
    try { await assert.rejects(unavailable.client(a.project).invoke(settings.workspaces, [])); }
    finally { await unavailable.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
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
  const a = reference("a"), b = reference("b");
  const user = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, audience: "user" as const, project_id: "a", permissions: ["projects:settings"] };
  const hasTable = (projectId: string) => {
    const database = new DatabaseSync(join(home, projectId + ".db"), { readOnly: true });
    try { return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_runtime_settings'").all().length === 1; } finally { database.close(); }
  };
  try {
    const coding = createPluginCapabilityClient(codingManifest, host.client(a)), codingOfB = createPluginCapabilityClient(codingManifest, host.client(b));
    assert.equal(await coding.invoke(settings.runtime, []), null, "no pick is the Home default");
    assert.equal(hasTable("a"), false, "reading leaves the project's database as it was");
    assert.equal(await host.actionClient(a).invoke(user, settings.selectRuntime, ["engine-b"]), "engine-b");
    assert.equal(await coding.invoke(settings.runtime, []), "engine-b");
    assert.equal(hasTable("a"), true);
    assert.equal(await codingOfB.invoke(settings.runtime, []), null, "another project does not see it");
    await assert.rejects(createPluginCapabilityClient(filesManifest, host.client(a)).invoke(settings.runtime, []), /没有声明/);
    await assert.rejects(coding.invoke(settings.selectRuntime, ["engine-c"]), /没有声明/, "a plugin reads the pick and never makes it");
    for (const input of [[], [5], ["x", "y"], [""]]) await assert.rejects(host.actionClient(a).invoke(user, settings.selectRuntime, input as never), { code: "actions.input_invalid" });
    assert.equal(await host.actionClient(a).invoke(user, settings.selectRuntime, [null]), null);
    assert.equal(await coding.invoke(settings.runtime, []), null, "null puts the project back on the Home default");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
