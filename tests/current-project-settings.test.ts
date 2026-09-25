import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { projectSettingsCapabilities as settings, projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { ProjectBrowsingSettings } from "../apps/local-host/src/project-browsing-settings.js";

const workspace = (id: string) => ({ workspace_id: id, canonical_path: "/test/" + id, realpath_verified: true, display_name: id });

test("Manifest gates individual settings; host scopes and projects records, rejects injected selectors", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-settings-"));
  const host = new MolisWorkLocalHost({ workspacesFor: id => [{ ...workspace(id), project_ids: [id, "secret-project"], created_at: "private" }] });
  const client = (projectId: string) => host.client(molisWorkHostProjectReference({ databasePath: join(home, projectId + ".db"), boardId: projectId, projectId }));
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

test("legacy browsing choice migrates once; membership remains authoritative across restart and revocation", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE plugin_runtime_installs (install_id TEXT, record_json TEXT);
      CREATE TABLE plugin_private_values (install_id TEXT, item_key TEXT, item_value TEXT);`);
    db.prepare("INSERT INTO plugin_runtime_installs VALUES (?, ?)").run("old", JSON.stringify({ plugin_id: "io.molis.work.workspace", updated_at: "2026-01-01" }));
    db.prepare("INSERT INTO plugin_private_values VALUES (?, ?, ?)").run("old", "selected-workspace", "two");
    const workspaces = [workspace("one"), workspace("two")];
    const preferences = new ProjectBrowsingSettings(db);
    assert.deepEqual(preferences.read("a", workspaces), workspace("two"));
    preferences.select("a", "one", workspaces);
    assert.deepEqual(new ProjectBrowsingSettings(db).read("a", workspaces), workspace("one"));
    assert.throws(() => preferences.select("a", "foreign", workspaces), /当前项目/);
    assert.equal(preferences.read("a", [workspace("two")]), null);
    assert.equal(preferences.read("a", [{ ...workspace("one"), realpath_verified: false }]), null);
    assert.deepEqual(preferences.read("a", workspaces), workspace("one"));
    assert.deepEqual(db.prepare("SELECT * FROM project_browsing_settings").all(), [{ board_id: "a", workspace_id: "one" }]);
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
