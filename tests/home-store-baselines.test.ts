import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applySqliteBaseline, describeSqliteSchema, readDatabaseSpace, ensureStorageSpace, releaseHeldHomeSqlite, STORAGE_SPACE_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { CHARACTERS_STORE_BASELINE, openCharacters } from "@molis-ai/molis-work-module-characters";
import { cogniaManifest } from "@molis-ai/molis-work-plugin-cognia";
import { HomeConsentLedger, MolisWorkLocalHost, MolisWorkProjectCatalog, homeStores } from "@molis-ai/molis-work-app-local-host";

const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
const libraries = homeStores().stores.flatMap(store => store.library ? [[store.path, store.library.baseline] as const] : []);
const pluginRuntimeBaseline = () => homeStores().stores.find(store => store.path === "plugin-runtime")!.library!.baseline;

for (const [name, baseline] of libraries) {
  test(`N41-PERSONAL-01 the ${name} store stays at v1 with zero upgrade steps, initializes cleanly and reopens intact`, () => {
    assert.equal(baseline.version, 1, `${name}: pre-release Home store baseline stays at version 1`);
    assert.deepEqual(baseline.upgrades ?? [], [], `${name}: pre-release Home store baseline declares no upgrade steps`);
    const root = mkdtempSync(join(tmpdir(), `home-baseline-${name.replace(/[^a-z0-9_-]/giu, "_")}-`));
    const file = join(root, "store.db");
    try {
      const db = new DatabaseSync(file);
      try {
        applySqliteBaseline(db, file, baseline);
        assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
        assert.ok(Object.keys(describeSqliteSchema(db).tables).length > 0);
        assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
      const reopened = new DatabaseSync(file);
      try {
        applySqliteBaseline(reopened, file, baseline);
        assert.deepEqual(describeSqliteSchema(reopened), shape(baseline.schema));
      } finally { reopened.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

// RAC-44 (library version and shape kept when Cognia moved to a Home Runtime): since batch 108 Cognia's library lives in each partition
// (specs/unified-partition-plugins §4.2), so the Home store registry no longer carries it; the partition declaration keeps version 1.
test("RAC-44: Cognia's library is no Home store; each partition's library is the one its Manifest declares, at version 1", () => {
  assert.ok(!homeStores().stores.some(store => store.path === "cognia"));
  assert.equal(homeStores().get("materials"), undefined, "retired transcription materials/ entry is removed under Decision 69 clean v1");
  assert.equal(cogniaManifest.databases?.partition?.version, 1);
  assert.equal(cogniaManifest.databases?.home, undefined);
});

test("W3-06-F-04 Home Runtime created by the public Host is the complete independent current baseline at 1", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-runtime-baseline-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let db: DatabaseSync | undefined;
  try {
    await host.homePlugins!.ready();
    db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
    assert.deepEqual(readDatabaseSpace(db), ensureStorageSpace(home));
    assert.deepEqual(describeSqliteSchema(db), shape(STORAGE_SPACE_SCHEMA_SQL + pluginRuntimeBaseline().schema));
    assert.equal(pluginRuntimeBaseline().schema.includes("'always_on'"), false, "clean v1 plugin_consents CHECK no longer includes retired 'always_on'");
  } finally { db?.close(); try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } }
});

test("RAC-2645 the prior Runtime consent shape falsely labeled as current is refused intact, with no implicit schema conversion", () => {
  const home = mkdtempSync(join(tmpdir(), "project-reach-old-baseline-")), directory = join(home, "plugin-runtime"), file = join(directory, "plugin-runtime.db");
  try {
    mkdirSync(directory);
    const current = pluginRuntimeBaseline().schema;
    const old = current.replace(", 'project_reach'", "").replace(/revoked_at TEXT,\s*approved_capability_ids TEXT,\s*CHECK \(\(kind = 'project_reach'[\s\S]*?approved_capability_ids IS NULL\)\)/u, "revoked_at TEXT");
    assert.ok(!old.includes("approved_capability_ids"));
    const db = new DatabaseSync(file);
    db.exec(old + " PRAGMA user_version=1;");
    db.prepare("INSERT INTO plugin_consents VALUES (?,?,?,?,?,?,?,?,?)").run("kept", "com.example.old", "publisher", "default_wiring", "default_wiring", "old", "then", "user", null);
    db.close();
    const bytes = readFileSync(file), files = readdirSync(directory);
    assert.throws(() => new HomeConsentLedger(home).revokeProjectReach({ project_id: "A" }, "now"), /结构与当前基线不一致/u);
    assert.deepEqual(readFileSync(file), bytes); assert.deepEqual(readdirSync(directory), files);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("RAR-01 repeated Home consent reads and revocations do not rebuild the expected schema", t => {
  const home = mkdtempSync(join(tmpdir(), "home-shape-cost-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const ledger = new HomeConsentLedger(home);
  ledger.publishers();
  ledger.revokeProjectReach({ project_id: "missing" }, "now");
  const execute = DatabaseSync.prototype.exec, ddl: string[] = [];
  t.mock.method(DatabaseSync.prototype, "exec", function (this: DatabaseSync, sql: string) {
    if (/CREATE\s+TABLE/iu.test(sql)) ddl.push(sql);
    return execute.call(this, sql);
  });
  const started = performance.now();
  for (let i = 0; i < 10; i += 1) {
    assert.deepEqual(ledger.publishers(), []);
    assert.equal(ledger.revokeProjectReach({ project_id: "missing" }, "now"), 0);
  }
  t.diagnostic(`20 public ledger operations: ${(performance.now() - started).toFixed(1)} ms; ${ddl.length} schema executions`);
  assert.equal(ddl.length, 0, "warm reads must inspect the actual store without executing the immutable reference DDL again");
});

test("RAR-02 cached expectations keep both space shapes and still refuse changed stores intact", t => {
  const root = mkdtempSync(join(tmpdir(), "home-shape-refusal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const schema = `${pluginRuntimeBaseline().schema};\nPRAGMA user_version = 1;`;
  // Exercise a bound store first, then a complete unbound store. The latter's read-only check must use its own shape;
  // its subsequent writable open binds the space, and later reads must select the bound shape again.
  const bound = new HomeConsentLedger(join(root, "bound"));
  assert.deepEqual(bound.publishers(), []);
  for (const damage of ["extra", "missing", "version", "owner"] as const) {
    const home = join(root, damage), directory = join(home, "plugin-runtime"), file = join(directory, "plugin-runtime.db");
    mkdirSync(directory, { recursive: true });
    const fixture = new DatabaseSync(file);
    try { fixture.exec(schema); } finally { fixture.close(); }
    const ledger = new HomeConsentLedger(home);
    assert.equal(ledger.revokeProjectReach({ project_id: "missing" }, "now"), 0);
    assert.deepEqual(ledger.publishers(), []);
    const db = new DatabaseSync(file);
    try {
      assert.deepEqual(readDatabaseSpace(db), ensureStorageSpace(home));
      if (damage === "extra") db.exec("CREATE TABLE unexpected (kept TEXT);");
      if (damage === "missing") db.exec("DROP TABLE plugin_private_values;");
      if (damage === "version") db.exec("PRAGMA user_version=99;");
      if (damage === "owner") {
        const other = ensureStorageSpace(join(root, "other-owner"));
        db.prepare("UPDATE molis_storage_space SET space_id=?, descriptor=?").run(other.spaceId, JSON.stringify(other));
      }
    } finally { db.close(); }
    const bytes = readFileSync(file), files = readdirSync(directory);
    const operation = damage === "owner" ? () => ledger.publishers() : () => ledger.revokeProjectReach({ project_id: "missing" }, "now");
    assert.throws(operation, damage === "owner" ? /SPACE_OWNERSHIP_MISMATCH/u
      : damage === "version" ? /结构版本是 99/u : /结构与当前基线不一致/u);
    assert.deepEqual(readFileSync(file), bytes, `${damage}: refusal must leave the store unchanged`);
    assert.deepEqual(readdirSync(directory), files, `${damage}: refusal must leave no new sidecar`);
  }
});

test("RAR-02 held RO plugin-runtime reads reuse their handle, see live writes, and reject external tampering intact", async t => {
  const root = mkdtempSync(join(tmpdir(), "home-ro-plugin-store-"));
  const home = join(root, "home");
  const catalog = await MolisWorkProjectCatalog.open({ homeDirectory: home });
  t.after(() => { catalog.close(); releaseHeldHomeSqlite(home); rmSync(root, { recursive: true, force: true }); });
  const ledger = new HomeConsentLedger(home);
  assert.deepEqual(ledger.observedPublishers(), [], "missing plugin-runtime store stays absent");
  // Initialize bound store through the writable ledger.
  assert.deepEqual(ledger.publishers(), []);
  assert.deepEqual(ledger.observedPublishers(), []);
  // Pin a publisher via RW ledger; held RO observedPublishers sees it immediately.
  ledger.pinPublisher({ key_id: "pub-1", public_key_spki_base64: "spki-1", label: "Publisher 1", pinned_at: "2026-11-22T00:00:00Z", pinned_by: "user" });
  assert.deepEqual(ledger.observedPublishers().map(pin => pin.key_id), ["pub-1"]);
  // External tampering, dropped space binding, and removed storage-space.json are all rejected intact.
  const file = join(home, "plugin-runtime", "plugin-runtime.db");
  const directory = join(home, "plugin-runtime");
  releaseHeldHomeSqlite(home);
  const checkTamper = (mutate: () => void, expected: RegExp | { code: string; message: RegExp }) => {
    const backup = readFileSync(file), spaceBackup = readFileSync(join(home, "storage-space.json"));
    try {
      mutate();
      const bytes = readFileSync(file), files = readdirSync(directory);
      assert.throws(() => ledger.observedPublishers(), expected);
      assert.deepEqual(readFileSync(file), bytes);
      assert.deepEqual(readdirSync(directory), files);
    } finally {
      releaseHeldHomeSqlite(home);
      mkdirSync(directory, { recursive: true });
      writeFileSync(file, backup);
      writeFileSync(join(home, "storage-space.json"), spaceBackup);
    }
  };
  checkTamper(() => { const db = new DatabaseSync(file); try { db.exec("CREATE TABLE unexpected (kept TEXT);"); } finally { db.close(); } }, { code: "actions.execution_failed", message: /结构与当前基线不一致/u });
  checkTamper(() => { const db = new DatabaseSync(file); try { db.exec("DROP TABLE plugin_private_values;"); } finally { db.close(); } }, { code: "actions.execution_failed", message: /结构与当前基线不一致/u });
  checkTamper(() => { const db = new DatabaseSync(file); try { db.exec("PRAGMA user_version=99;"); } finally { db.close(); } }, { code: "storage.store_too_new", message: /结构版本是 99/u });
  checkTamper(() => {
    const other = ensureStorageSpace(join(root, "other-owner"));
    const db = new DatabaseSync(file);
    try { db.prepare("UPDATE molis_storage_space SET space_id=?, descriptor=?").run(other.spaceId, JSON.stringify(other)); } finally { db.close(); }
  }, { code: "actions.forbidden", message: /不属于当前空间/u });
  checkTamper(() => { rmSync(join(home, "storage-space.json")); }, { code: "actions.forbidden", message: /不属于当前空间/u });
});

// C-06 (anti-corruption code audit 2026-10-15): the Characters store had its own opening that stamped version 1 over any
// table it found. It now opens through the common baseline: a store without a version, or from a newer build, is refused untouched.
test("the Characters store refuses tables without a version and a newer version, and leaves the file as it was", t => {
  const home = mkdtempSync(join(tmpdir(), "characters-baseline-")); t.after(() => rmSync(home, { recursive: true, force: true }));
  const store = (name: string, setup: string) => {
    const root = join(home, name); mkdirSync(join(root, "characters"), { recursive: true });
    const db = new DatabaseSync(join(root, "characters", "characters.sqlite")); db.exec(setup); db.close();
    return root;
  };
  const state = (root: string) => {
    const db = new DatabaseSync(join(root, "characters", "characters.sqlite"), { readOnly: true });
    try { return { version: (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, rows: (db.prepare("SELECT count(*) AS n FROM character_drafts").get() as { n: number }).n }; }
    finally { db.close(); }
  };
  const mismatch = (error: unknown) => (error as { code?: string }).code === "storage.schema_version_mismatch";
  const tooNew = (error: unknown) => (error as { code?: string }).code === "storage.store_too_new";
  const unversioned = store("unversioned", "CREATE TABLE character_drafts (id TEXT PRIMARY KEY, body TEXT); INSERT INTO character_drafts VALUES ('old', '旧草稿');");
  assert.throws(() => openCharacters(unversioned, "actor"), mismatch);
  assert.deepEqual(state(unversioned), { version: 0, rows: 1 }, "the unversioned store keeps its row and is not stamped");
  const missingTrigger = store("missing-trigger", CHARACTERS_STORE_BASELINE.schema + `DROP TRIGGER characters_sync_delete; PRAGMA user_version=${CHARACTERS_STORE_BASELINE.version};`);
  assert.throws(() => openCharacters(missingTrigger,"actor"), {code:"storage.schema_structure_mismatch"});
  const refused = new DatabaseSync(join(missingTrigger,"characters","characters.sqlite"),{ readOnly:true });
  try { assert.equal(refused.prepare("SELECT 1 FROM sqlite_schema WHERE name='characters_sync_delete'").get(),undefined); } finally { refused.close(); }
  const newer = store("newer", `${CHARACTERS_STORE_BASELINE.schema} PRAGMA user_version = ${CHARACTERS_STORE_BASELINE.version+1};`);
  assert.throws(() => openCharacters(newer, "actor"), tooNew);
  assert.deepEqual(state(newer), { version: CHARACTERS_STORE_BASELINE.version+1, rows: 0 });
  const fresh = openCharacters(join(home, "fresh"), "actor");
  try { assert.deepEqual(fresh.service.list(), []); } finally { fresh.close(); }
  assert.deepEqual(state(join(home, "fresh")), { version: CHARACTERS_STORE_BASELINE.version, rows: 0 });
  openCharacters(join(home, "fresh"), "actor").close();
});
