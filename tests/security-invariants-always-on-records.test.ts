import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MemoryPluginRuntimeRepository, PLUGIN_TRUST_SCHEMA_SQL, PluginRuntime, SqlitePluginConsentLedger, UNSIGNED_TRUST, consentSubject } from "@molis-ai/molis-work-plugin-runtime";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// ac-trust T3 (specs/repository-anti-corruption/slices/ac-trust-install.md §3.4): the 常开 list is worked out from the consent ledger and the
// install records each time it is asked, nothing names a plugin, and the server refuses to uninstall, switch off or remove a 常开 plugin.

const ALWAYS_ON = { kind: "always_on", subject: consentSubject.alwaysOn() } as const;
const manifestId = (projectPluginId: string) => BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === projectPluginId)!.manifest.plugin_id;
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

function exampleManifest(): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.stays", version: "1.0.0", name: "Stays on", kind: "app",
    publisher: { publisher_id: "someone", signature: "stays-on-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, always_on: true,
  };
}

test("RAC-386 S-X1 the Runtime refuses to uninstall a plugin while its 常开 agreement stands, and allows it once the agreement is revoked", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(PLUGIN_TRUST_SCHEMA_SQL);
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { consents: new SqlitePluginConsentLedger(db) });
  const definition = { manifest: exampleManifest(), async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition;
  const { install } = runtime.install({ trust: UNSIGNED_TRUST, definition, deployment: "local", grants: [], consents: [ALWAYS_ON] });
  await runtime.start(install.install_id);

  await assert.rejects(runtime.uninstall(install.install_id), refused("plugin.always_on"));
  assert.equal(runtime.list()[0]!.state, "running", "a refusal changes nothing");
  // Stopping is the Host's own to do (shutdown, a project closing); a person's switch-off is refused where the Host takes it.
  await runtime.stop(install.install_id, { preserve_enabled: true });
  assert.equal(runtime.list()[0]!.state, "installed");
  await assert.rejects(runtime.uninstall(install.install_id), refused("plugin.always_on"));

  db.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE plugin_id = ? AND kind = 'always_on'").run("2026-10-25T00:00:00.000Z", install.plugin_id);
  await runtime.uninstall(install.install_id);
  assert.equal(runtime.list()[0]!.state, "uninstalled");
});

test("RAC-386 RAC-400 the 常开 plugins come from the ledger and the records: Goals is not stored, cannot be removed, and is an ordinary plugin once the agreement is taken back", async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-always-on-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  t.after(async () => { catalog.close(); await rm(homeDirectory, { recursive: true, force: true }); });
  const first = await catalog.createProject({ display_name: "常开", actor_id: "test" });
  const stored = (projectId: string) => {
    const db = new Database(join(homeDirectory, "projects/catalog.db"), { readonly: true });
    try { return (db.prepare("SELECT plugin_id FROM project_plugins WHERE project_id = ? ORDER BY plugin_id").all(projectId) as Array<{ plugin_id: string }>).map(row => row.plugin_id); }
    finally { db.close(); }
  };
  // Goals is in the project without a row of its own: creating a project no longer writes a name into it.
  assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["goals", "schedule"]);
  assert.deepEqual(stored(first.project_id), ["schedule"]);
  for (const plugin_id of ["goals", "shelf"]) {
    assert.throws(() => catalog.removeProjectPlugin({ project_id: first.project_id, plugin_id, actor_id: "test" }), refused("catalog.plugin_always_on"), plugin_id);
  }
  assert.deepEqual(catalog.listHiddenPlugins(first.project_id), []);

  // A project that hid Shelf before it was 常开 keeps the mark, but it changes nothing and is not listed.
  const written = new Database(join(homeDirectory, "projects/catalog.db"));
  try { written.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, 'shelf', '2026-10-01T00:00:00.000Z')").run(first.project_id); }
  finally { written.close(); }
  assert.deepEqual(catalog.listHiddenPlugins(first.project_id), []);

  // The person takes the agreement back: at once Goals is an ordinary plugin, in no project's list, and a project can be made without it.
  const store = new DatabaseSync(join(homeDirectory, "plugin-runtime", "plugin-runtime.db"));
  try {
    store.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE plugin_id = ? AND kind = 'always_on'").run("2026-10-25T00:00:00.000Z", manifestId("goals"));
    assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["schedule"]);
    const without = await catalog.createProject({ display_name: "没有 Goals", actor_id: "test" });
    assert.deepEqual(catalog.listProjectPlugins(without.project_id), ["schedule"]);
    assert.deepEqual(stored(without.project_id), ["schedule"]);
    // The Host's own agreement does not come back by itself, however many times it is asked.
    assert.deepEqual(catalog.listProjectPlugins(without.project_id), ["schedule"]);
    assert.throws(() => catalog.removeProjectPlugin({ project_id: first.project_id, plugin_id: "shelf", actor_id: "test" }), refused("catalog.plugin_always_on"));

    // A project made before holds Goals as a stored row: it can be removed now, and the row goes.
    const old = await catalog.createProject({ display_name: "旧项目", actor_id: "test" });
    const writable = new Database(join(homeDirectory, "projects/catalog.db"));
    try { writable.prepare("INSERT INTO project_plugins (project_id, plugin_id, added_at) VALUES (?, 'goals', '2026-10-01T00:00:00.000Z')").run(old.project_id); }
    finally { writable.close(); }
    assert.deepEqual(catalog.listProjectPlugins(old.project_id), ["goals", "schedule"]);
    assert.deepEqual(catalog.removeProjectPlugin({ project_id: old.project_id, plugin_id: "goals", actor_id: "test" }).plugins, ["schedule"]);
    assert.deepEqual(stored(old.project_id), ["schedule"]);

    // A person's own agreement later is a new row and counts at once.
    new SqlitePluginConsentLedger(store).record({ plugin_id: manifestId("goals"), manifest_digest: "agreed-by-the-person", granted_by: "user", at: "2026-10-26T00:00:00.000Z",
      publisher_signature: BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "goals")!.manifest.publisher.signature, grants: [ALWAYS_ON] });
    assert.deepEqual(catalog.listProjectPlugins(without.project_id), ["goals", "schedule"]);
  } finally { store.close(); }
});

test("RAC-386 S-X1 the Home route refuses to switch off a 常开 plugin, however often it is asked, and enabling it stays allowed", async t => {
  const f = await serveHomeRuntime(t);
  const route = (operation: string) => f.request(`/api/plugins/${manifestId("shelf")}/${operation}`, { method: "POST", body: {} });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await route("disable");
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code?: string }).code, "plugin.always_on");
  }
  assert.equal((await route("enable")).status, 200, "it was never switched off");
});
