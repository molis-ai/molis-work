import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import Database from "better-sqlite3";
import { MolisWorkLocalHost, homeStores, molisWorkHostProjectReference, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOST_BUILD_TRUST, MemoryPluginRuntimeRepository, PLUGIN_TRUST_SCHEMA_SQL, PluginRuntime, SqlitePluginConsentLedger, SqlitePluginRuntimeRepository, UNSIGNED_TRUST, alwaysOnAgreed, consentSubject, pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

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

test("RAC-386 S-34 the Runtime refuses to uninstall a plugin while its 常开 agreement stands, and allows it once the agreement is revoked", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(PLUGIN_TRUST_SCHEMA_SQL);
  const runtime = new PluginRuntime(new MemoryPluginRuntimeRepository(), undefined, { hostIds: ISOLATED_HOST_IDS, consents: new SqlitePluginConsentLedger(db) });
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
  assert.deepEqual(catalog.projectPluginMembership(first.project_id).hidden, []);

  // A project that hid Shelf before it was 常开 keeps the mark, but it changes nothing and is not listed.
  const written = new Database(join(homeDirectory, "projects/catalog.db"));
  try { written.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, 'shelf', '2026-10-01T00:00:00.000Z')").run(first.project_id); }
  finally { written.close(); }
  assert.deepEqual(catalog.projectPluginMembership(first.project_id).hidden, []);

  // The person takes the agreement back: at once Goals is an ordinary plugin, in no project's list, and a project can be made without it.
  const store = seedStore(homeDirectory);
  try {
    const goals = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "goals")!.manifest;
    new SqlitePluginConsentLedger(store).record({ plugin_id: goals.plugin_id, publisher_signature: goals.publisher.signature,
      manifest_digest: pluginManifestDigest(goals), granted_by: "host_build", grants: [ALWAYS_ON], at: "2026-10-24T00:00:00.000Z" });
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

test("RAC-386 S-34 the Home route refuses to switch off a 常开 plugin, however often it is asked, and enabling it stays allowed", async t => {
  const f = await serveHomeRuntime(t);
  const route = (operation: string) => f.request(`/api/plugins/${manifestId("shelf")}/${operation}`, { method: "POST", body: {} });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await route("disable");
    assert.equal(response.status, 400);
    assert.equal((await response.json() as { code?: string }).code, "plugin.always_on");
  }
  assert.equal((await route("enable")).status, 200, "it was never switched off");
});


const storePath = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");
function seedStore(home: string): DatabaseSync {
  mkdirSync(join(home, "plugin-runtime"), { recursive: true });
  const db = new DatabaseSync(storePath(home));
  db.exec(readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime-v3.sql", import.meta.url), "utf8"));
  return db;
}

/** Compare actual files and bytes, including new directories, sidecars, timestamps and permission changes. */
function filesAt(root: string, parent = ""): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const file = join(root, entry.name), stat = statSync(file), relative = parent ? `${parent}/${entry.name}` : entry.name;
    // The existing catalog connection updates WAL reader marks in shared memory even for SELECTs. Its database and WAL,
    // and every Runtime file, still compare byte for byte; the catalog's coordination file must keep its size and metadata.
    const content = entry.isDirectory() ? filesAt(file, relative) : relative === "projects/catalog.db-shm" ? stat.size : readFileSync(file);
    return [entry.name, stat.mode, stat.mtimeMs, content];
  });
}

async function catalogFixture(t: import("node:test").TestContext) {
  const home = await mkdtemp(join(tmpdir(), "molis-work-always-on-readonly-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  t.after(async () => { catalog.close(); await rm(home, { recursive: true, force: true }); });
  const project = await catalog.createProject({ display_name: "只读常开", actor_id: "test" });
  return { home, catalog, project };
}

function readMembership(f: Awaited<ReturnType<typeof catalogFixture>>) {
  assert.deepEqual(f.catalog.listProjectPlugins(f.project.project_id), ["goals", "schedule"]);
  assert.deepEqual(f.catalog.projectPluginMembership(f.project.project_id).hidden, []);
  for (const plugin_id of ["goals", "shelf"]) {
    assert.throws(() => f.catalog.removeProjectPlugin({ project_id: f.project.project_id, plugin_id, actor_id: "test" }), refused("catalog.plugin_always_on"));
  }
}

test("RAC-401 S-34 catalog queries and refused removals give the Host-build answer without creating a missing Runtime store", async t => {
  const f = await catalogFixture(t);
  assert.equal(readdirSync(f.home).includes("plugin-runtime"), false, "even project creation does not create the Runtime store");
  const before = filesAt(f.home);
  readMembership(f); readMembership(f);
  assert.deepEqual(filesAt(f.home), before, "queries and refusals created no files, tables, consents or catalog events");

  // An existing empty store directory is also left empty, rather than creating a database there.
  mkdirSync(join(f.home, "plugin-runtime"));
  const withDirectory = filesAt(f.home);
  readMembership(f);
  assert.deepEqual(filesAt(f.home), withDirectory);
});

test("RAC-401 S-34 an existing current store stays byte-for-byte unchanged; missing agreements are not written or granted to third parties", async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const ledger = new SqlitePluginConsentLedger(db);
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(db), undefined, { hostIds: ISOLATED_HOST_IDS, consents: ledger });
  const definition = { manifest: exampleManifest(), async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition;
  const { install } = runtime.install({ definition, deployment: "local", trust: UNSIGNED_TRUST, grants: [] });
  const before = filesAt(f.home);
  readMembership(f); readMembership(f);
  assert.deepEqual(filesAt(f.home), before);
  assert.deepEqual(db.prepare("SELECT * FROM plugin_consents").all(), [], "build-backed catalog queries never record consent for anyone");
  assert.equal(alwaysOnAgreed(ledger, install.plugin_id, install.publisher_signature), false);
  await runtime.uninstall(install.install_id);
  assert.equal(runtime.list().find(row => row.install_id === install.install_id)!.state, "uninstalled", "an unsigned always_on declaration without consent is freely removable");
});

test("RAC-401 S-34 each query sees persisted revocation, new consent and installation state without writing or reviving an agreement", async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const ledger = new SqlitePluginConsentLedger(db), repository = new SqlitePluginRuntimeRepository(db);
  const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "shelf")!.manifest;
  const runtime = new PluginRuntime(repository, undefined, { hostIds: ISOLATED_HOST_IDS, consents: ledger });
  const { install } = runtime.install({ deployment: "local", trust: HOST_BUILD_TRUST, grants: [], consents: [ALWAYS_ON],
    definition: { manifest: shelf, async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition });
  const writable = new Database(join(f.home, "projects/catalog.db"));
  try { writable.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, 'shelf', '2026-10-01T00:00:00.000Z')").run(f.project.project_id); }
  finally { writable.close(); }
  const hidden = (expected: string[]) => {
    const before = filesAt(f.home);
    assert.deepEqual(f.catalog.projectPluginMembership(f.project.project_id).hidden, expected);
    assert.deepEqual(filesAt(f.home), before);
  };
  hidden([]);
  const consent = ledger.consents(shelf.plugin_id)[0]!;
  assert.ok(consent, "the installation fixture explicitly recorded the agreement, as the Host supervisor does");
  db.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE consent_id = ?").run("2026-10-24T00:00:00.000Z", consent.consent_id);
  hidden(["shelf"]); hidden(["shelf"]);
  assert.deepEqual(ledger.consents(shelf.plugin_id), [{ ...consent, revoked_at: "2026-10-24T00:00:00.000Z" }], "repeated reads retain the original revoked row");
  ledger.record({ plugin_id: shelf.plugin_id, publisher_signature: shelf.publisher.signature, manifest_digest: pluginManifestDigest(shelf),
    granted_by: "user", grants: [ALWAYS_ON], at: "2026-10-24T01:00:00.000Z" });
  hidden([]);
  assert.equal(ledger.consents(shelf.plugin_id).length, 2, "the person's new agreement is a distinct row");
  for (const state of ["disabled", "quarantined", "uninstalled", "installed", "crashed"] as const) {
    repository.save({ ...install, state });
    hidden(["installed", "crashed"].includes(state) ? [] : ["shelf"]);
  }
});

test("MEM-42 one discovery reads and validates the current Home plugin library once", async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const file = db.location(), before = filesAt(f.home), connections = new Set<DatabaseSync>();
  assert.ok(file);
  let versionReads = 0;
  const prepare = DatabaseSync.prototype.prepare;
  const observation = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (sql === "PRAGMA user_version" && this.location() === file) { versionReads++; connections.add(this); }
    return prepare.call(this, sql);
  });
  const policy = projectActionAvailability(async (_options, work) => work(f.catalog), f.home), caller = person([], f.project.project_id);
  try {
    const discovery = await policy.snapshotForDiscovery(caller);
    for (const key of ["goals", "shelf"]) {
      const pluginId = manifestId(key);
      assert.equal(discovery(caller, { provider: { provider_id: pluginId, plugin_id: pluginId, title: key, kind: "plugin" } }).available, true);
    }
  } finally { observation.mock.restore(); }
  t.diagnostic(`Home plugin validation: ${versionReads} version reads on ${connections.size} connections`);
  assert.equal(versionReads, 1, "one synchronous membership read shares its current always-on result between members and hidden marks");
  assert.equal(connections.size, 1);
  for (const connection of connections) assert.throws(() => connection.prepare("SELECT 1"), /not open/u, "the read retains no connection");
  assert.deepEqual(filesAt(f.home), before, "discovery changes no files, agreements or installation records");
});

test("MEM-HOME-EXPECTED-01 repeated public reads reuse only the declared expectation and validate each real connection", async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const baseline = homeStores().get("plugin-runtime")!.library!.baseline, original = baseline.schema;
  // The public declaration is the same object; a harmless SQL comment forces a new declaration value without changing the real schema.
  const schema = original + "\n-- expected-schema repeated-read fixture\n";
  const file = db.location(), before = filesAt(f.home), connections = new Set<DatabaseSync>();
  let compiled = 0, versions = 0, structures = 0;
  const exec = DatabaseSync.prototype.exec, prepare = DatabaseSync.prototype.prepare;
  const compilation = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (this.location() === null && sql === schema) compiled++;
    return exec.call(this, sql);
  });
  const validation = t.mock.method(DatabaseSync.prototype, "prepare", function(this: DatabaseSync, sql: string) {
    if (this.location() === file) {
      if (sql === "PRAGMA user_version") { versions++; connections.add(this); }
      if (sql.startsWith("SELECT name, sql FROM sqlite_master WHERE type = 'table'")) structures++;
    }
    return prepare.call(this, sql);
  });
  const policy = projectActionAvailability(async (_options, work) => work(f.catalog), f.home), caller = person([], f.project.project_id);
  const pluginId = manifestId("goals"), action = { provider: { provider_id: pluginId, plugin_id: pluginId, title: "Goals", kind: "plugin" as const } };
  try {
    Reflect.set(baseline, "schema", schema);
    for (let read = 1; read <= 2; read++) {
      assert.equal((await policy.snapshotForDiscovery(caller))(caller, action).available, true);
      assert.equal(versions, read, "each public read checks the actual database version");
      assert.equal(structures, read, "each public read describes the complete actual schema");
      assert.equal(connections.size, read, "a later read opens its own current connection");
    }
  } finally { Reflect.set(baseline, "schema", original); compilation.mock.restore(); validation.mock.restore(); }
  for (const connection of connections) assert.throws(() => connection.prepare("SELECT 1"), /not open/u);
  assert.deepEqual(filesAt(f.home), before, "real files and authorization records are unchanged");
  assert.equal(compiled, 1, "unchanged declaration SQL is executed in the expected in-memory database only once");
});

test("MEM-HOME-EXPECTED-02 changed public declaration values and failed compilation cannot borrow an earlier expectation", async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const baseline = homeStores().get("plugin-runtime")!.library!.baseline, original = { schema: baseline.schema, version: baseline.version };
  const policy = projectActionAvailability(async (_options, work) => work(f.catalog), f.home), caller = person([], f.project.project_id);
  const pluginId = manifestId("goals"), action = { provider: { provider_id: pluginId, plugin_id: pluginId, title: "Goals", kind: "plugin" as const } };
  const read = async () => assert.equal((await policy.snapshotForDiscovery(caller))(caller, action).available, true);
  const invalid = original.schema + "\nTHIS IS NOT SQL;", exec = DatabaseSync.prototype.exec;
  let failedCompilations = 0, successfulCompilations = 0;
  const observation = t.mock.method(DatabaseSync.prototype, "exec", function(this: DatabaseSync, sql: string) {
    if (this.location() === null && sql === invalid) failedCompilations++;
    const result = exec.call(this, sql);
    if (this.location() === null && sql === original.schema) successfulCompilations++;
    return result;
  });
  try {
    await read();
    Reflect.set(baseline, "schema", original.schema + "\nCREATE TABLE changed_expectation (id TEXT PRIMARY KEY);\n");
    await assert.rejects(policy.snapshotForDiscovery(caller), { code: "actions.execution_failed" }, "same object with different SQL must reject the old on-disk shape");
    Reflect.set(baseline, "schema", original.schema); await read();
    Reflect.set(baseline, "schema", invalid);
    await assert.rejects(policy.snapshotForDiscovery(caller), { code: "ERR_SQLITE_ERROR" });
    await assert.rejects(policy.snapshotForDiscovery(caller), { code: "ERR_SQLITE_ERROR" });
    assert.equal(failedCompilations, 2, "failed compilation is attempted again, never retained as a result");
    Reflect.set(baseline, "schema", original.schema); await read();
    Reflect.set(baseline, "version", original.version + 1);
    await assert.rejects(policy.snapshotForDiscovery(caller), { code: "storage.schema_version_mismatch" });
    db.exec(`PRAGMA user_version = ${original.version + 1}`);
    const before = successfulCompilations;
    await read();
    assert.equal(successfulCompilations, before + 1, "a changed declaration version is not an identity-cache hit");
  } finally {
    Reflect.set(baseline, "schema", original.schema); Reflect.set(baseline, "version", original.version);
    db.exec(`PRAGMA user_version = ${original.version}`); observation.mock.restore();
  }
  await read();
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'changed_expectation'").get()!.count, 0, "declaration changes never create or repair real schema");
  assert.deepEqual(db.prepare("SELECT * FROM plugin_consents").all(), [], "queries never write agreements");
});

for (const corruption of ["version", "structure"] as const) test(`MEM-42 later discovery and live reads see consent changes and refuse ${corruption} damage before missing-project fallback`, async t => {
  const f = await catalogFixture(t), db = seedStore(f.home);
  t.after(() => db.close());
  const ledger = new SqlitePluginConsentLedger(db), entries = ["goals", "shelf"].map(key => BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === key)!.manifest);
  const record = (granted_by: "host_build" | "user", at: string) => entries.flatMap(manifest => ledger.record({
    plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, manifest_digest: pluginManifestDigest(manifest),
    granted_by, grants: [ALWAYS_ON], at,
  }));
  const consents = record("host_build", "2026-10-25T00:00:00.000Z");
  assert.equal(consents.length, 2);
  // A historical personal-plugin exclusion is ineffective while its current always-on agreement stands.
  const writable = new Database(join(f.home, "projects/catalog.db"));
  try { writable.prepare("INSERT INTO project_plugin_exclusions (project_id, plugin_id, removed_at) VALUES (?, 'shelf', '2026-10-01T00:00:00.000Z')").run(f.project.project_id); }
  finally { writable.close(); }
  const policy = projectActionAvailability(async (_options, work) => work(f.catalog), f.home), caller = person([], f.project.project_id);
  const actions: Array<Pick<ActionView, "provider">> = entries.map(manifest => ({ provider: {
    provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin",
  } }));
  const read = async (available: boolean) => {
    const before = filesAt(f.home), discovery = await policy.snapshotForDiscovery(caller);
    for (const action of actions) {
      assert.equal(discovery(caller, action).available, available);
      assert.equal((await policy(caller, action)).available, available, "live admission reads current membership independently");
    }
    assert.deepEqual(filesAt(f.home), before);
  };
  await read(true);
  for (const consent of consents) ledger.revoke(consent.consent_id, "2026-10-25T01:00:00.000Z");
  await read(false);
  assert.equal(record("user", "2026-10-25T02:00:00.000Z").length, 2);
  await read(true);
  if (corruption === "version") db.exec("PRAGMA user_version = 2");
  else db.exec("DROP TABLE plugin_private_values");
  const before = filesAt(f.home), refusal = { code: corruption === "version" ? "storage.schema_version_mismatch" : "actions.execution_failed" };
  for (const project_id of [f.project.project_id, "absent-project"]) {
    const context = { ...caller, project_id };
    await assert.rejects(policy.snapshotForDiscovery(context), refusal);
    await assert.rejects(Promise.resolve(policy(context, actions[1]!)), refusal, "an absent project must not bypass the Home refusal for a personal plugin");
  }
  assert.deepEqual(filesAt(f.home), before, "refusal neither repairs the library nor revives consent");
});

test("RAC-401 S-34 a query before Host startup records nothing and the real supervisor still records consent at startup", async t => {
  const f = await catalogFixture(t);
  readMembership(f);
  const host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try {
    await host.homePlugins!.ready();
    const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "shelf")!.manifest;
    const db = new DatabaseSync(storePath(f.home), { readOnly: true });
    try {
      const rows = new SqlitePluginConsentLedger(db).consents(shelf.plugin_id).filter(row => row.kind === "always_on");
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.granted_by, "host_build");
      assert.equal(rows[0]!.publisher_signature, shelf.publisher.signature);
      assert.equal(rows[0]!.manifest_digest, pluginManifestDigest(shelf));
    } finally { db.close(); }
    const before = filesAt(f.home);
    readMembership(f);
    assert.deepEqual(filesAt(f.home), before, "queries after startup do not change the supervisor's ledger or files");
  } finally { await host.homePlugins!.close(); await host.close(); }
});

for (const [name, corrupt, expected] of [
  ["non-SQLite bytes", (file: string) => writeFileSync(file, "not a SQLite database"), /not a database/u],
  ["empty existing file", (file: string) => writeFileSync(file, ""), { code: "storage.schema_version_mismatch" }],
  ["old baseline", (file: string) => { const db = new DatabaseSync(file); try { db.exec("PRAGMA user_version = 2"); } finally { db.close(); } }, { code: "storage.schema_version_mismatch" }],
  ["current version with missing tables", (file: string) => { const db = new DatabaseSync(file); try { db.exec("PRAGMA user_version = 3"); } finally { db.close(); } }, { code: "actions.execution_failed" }],
] as const) {
  test(`RAC-401 S-34 an existing Runtime store with ${name} is refused, never treated as missing or repaired by a query`, async t => {
    const f = await catalogFixture(t);
    mkdirSync(join(f.home, "plugin-runtime")); corrupt(storePath(f.home));
    const before = filesAt(f.home);
    assert.throws(() => f.catalog.listProjectPlugins(f.project.project_id), expected);
    assert.throws(() => f.catalog.projectPluginMembership(f.project.project_id).hidden, expected);
    assert.throws(() => f.catalog.removeProjectPlugin({ project_id: f.project.project_id, plugin_id: "goals", actor_id: "test" }), expected);
    assert.deepEqual(filesAt(f.home), before);
  });
}

for (const corruption of ["version", "structure"] as const) {
  test(`RAC-402 RAC-403 S-34 revoked and disabled records survive ${corruption} failure; only the page gets stored membership`, { timeout: 60_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), "molis-work-revoked-invalid-"));
    const availability = projectActionAvailability(withMolisWorkProjectCatalog, home);
    const f = await serveHomeRuntime(t, { homeDirectory: home, actionAvailability: availability });
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const project = await catalog.createProject({ display_name: "保留撤回与隐藏", actor_id: "test" });
      const db = seedStore(home), ledger = new SqlitePluginConsentLedger(db), repository = new SqlitePluginRuntimeRepository(db);
      const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "shelf")!.manifest;
      const goals = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "goals")!.manifest;
      const runtime = new PluginRuntime(repository, undefined, { consents: ledger, hostIds: new Set([shelf.plugin_id, goals.plugin_id]) });
      const { install } = runtime.install({ deployment: "local", trust: HOST_BUILD_TRUST, grants: [], consents: [ALWAYS_ON],
        definition: { manifest: shelf, async start() { return { kind: "app", views: [] }; }, async stop() {} } as PluginDefinition });
      ledger.record({ plugin_id: goals.plugin_id, publisher_signature: goals.publisher.signature, manifest_digest: pluginManifestDigest(goals),
        granted_by: "host_build", grants: [ALWAYS_ON], at: "2026-10-25T00:00:00.000Z" });
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "test" });
      db.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE kind = 'always_on'").run("2026-10-25T01:00:00.000Z");
      repository.save({ ...install, state: "disabled" });
      catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "test" });
      catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "shelf", actor_id: "test" });
      const stored = { plugins: ["schedule"], hidden: ["shelf"] };
      assert.deepEqual(catalog.storedProjectPluginMembership(project.project_id), stored);
      assert.deepEqual(catalog.listProjectPlugins(project.project_id), stored.plugins);
      assert.deepEqual(catalog.projectPluginMembership(project.project_id).hidden, stored.hidden);
      const caller = person(["goals:read"], project.project_id);
      const action = { provider: { provider_id: goals.plugin_id, plugin_id: goals.plugin_id, title: "Goals", kind: "plugin" as const } };
      assert.equal((await availability(caller, action)).available, false);
      if (corruption === "version") db.exec("PRAGMA user_version = 2");
      else db.exec("DROP TABLE plugin_private_values");
      const consents = ledger.consents(goals.plugin_id), installs = repository.list();
      db.close();
      const before = filesAt(home), bytes = readFileSync(storePath(home));
      const refusal = { code: corruption === "version" ? "storage.schema_version_mismatch" : "actions.execution_failed" };
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.throws(() => catalog.listProjectPlugins(project.project_id), refusal);
        assert.throws(() => catalog.projectPluginMembership(project.project_id).hidden, refusal);
        for (const plugin_id of ["goals", "shelf"]) assert.throws(() => catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "test" }), refusal);
        await assert.rejects(Promise.resolve().then(() => availability(caller, action)), refusal);
      }
      assert.deepEqual(filesAt(home), before, "strict reads and refused commands write no files or business records");
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      const client = f.host.actionClient(reference, false);
      await assert.rejects(client.invoke(caller, goalsActions.snapshot, {}), { code: "actions.missing" });
      await assert.rejects(client.discover(caller), refusal);
      for (const path of [`/projects/${project.project_id}/`, `/projects/${project.project_id}/settings/general`, `/settings/appearance?project=${project.project_id}`, `/projects/${project.project_id}/side/pages/comments`]) {
        const page = await f.request(path);
        assert.equal(page.status, 200, await page.clone().text());
        const html = await page.text();
        assert.match(html, /Home 插件运行库不可用/u);
        assert.match(html, /data-stored-project-plugin="schedule"/u);
        assert.match(html, /data-stored-project-plugin="shelf" data-plugin-hidden="true"/u);
        assert.doesNotMatch(html, /data-stored-project-plugin="goals"|data-issue-composer|id="molis-work-data"/u);
        assert.equal([...html.matchAll(/data-work-surface="issues"/gu)].length, 1);
        assert.match(html, /href="\/plugins\/issues"/u);
      }
      for (const path of ["/api/board", "/api/board/refresh"]) {
        const response = await f.request(`/projects/${project.project_id}${path}`);
        assert.equal(response.status, 503, "read APIs retain refusal and return no substitute plugin content");
        const body = await response.json() as Record<string, unknown>;
        assert.equal(body.error, "Home 插件运行库不可用"); assert.equal(body.code, refusal.code);
        assert.equal("snapshot" in body, false); assert.equal("goals" in body, false);
      }
      const membership = await f.request("/api/settings/project-plugins");
      assert.equal(membership.status, 503, "the live plugin picker sees the unavailable state instead of treating stored rows as current authority");
      const payload = await membership.json() as { projects: Array<{ project_id: string; plugins: string[]; hidden: string[]; unavailable?: string }> };
      assert.deepEqual(payload.projects.find(item => item.project_id === project.project_id), { project_id: project.project_id, display_name: project.display_name,
        ...stored, unavailable: "Home 插件运行库不可用" });
      assert.deepEqual(readFileSync(storePath(home)), bytes, "page recovery never repairs or writes the damaged ledger");
      const restored = new DatabaseSync(storePath(home));
      try {
        assert.deepEqual(new SqlitePluginConsentLedger(restored).consents(goals.plugin_id), consents);
        assert.deepEqual(new SqlitePluginRuntimeRepository(restored).list(), installs);
        // Restoring only the missing structure/version makes the next read authoritative again, while preserving every revoked row.
        if (corruption === "version") restored.exec("PRAGMA user_version = 3");
        else {
          const schema = readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime-v3.sql", import.meta.url), "utf8");
          const table = schema.match(/CREATE TABLE plugin_private_values \([\s\S]*?\n\);/u)?.[0];
          assert.ok(table); restored.exec(table);
        }
      } finally { restored.close(); }
      assert.deepEqual(catalog.listProjectPlugins(project.project_id), stored.plugins);
      assert.deepEqual(catalog.projectPluginMembership(project.project_id).hidden, stored.hidden);
      assert.equal((await availability(caller, action)).available, false);
    } finally { catalog.close(); }
  });
}

for (const error of [new SqliteSchemaVersionError("unrelated.db", 1, 3), new ActionError("actions.execution_failed", "Home 插件运行库结构与当前 v3 基线不一致，请保留故障库并检查其来源")]) {
  test(`RAC-403 a ${error.name} from outside the Home store is not swallowed even with the same code or message`, { timeout: 60_000 }, async t => {
    const f = await serveHomeRuntime(t, { actionAvailability: (_caller, action) => {
      if (action.capability_id === goalsActions.collection.capability_id) throw error;
      return { available: true };
    } });
    const one = await f.project("Other errors stay visible");
    for (const path of ["/", "/api/board", "/api/board/refresh"]) {
      const page = await f.request(`/projects/${one.project_id}${path}`);
      assert.equal(page.status, 500);
      assert.doesNotMatch(await page.text(), /data-home-plugin-store-unavailable/u);
    }
  });
}
