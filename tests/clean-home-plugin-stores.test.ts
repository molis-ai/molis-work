import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { bindDatabaseSpace, describeSqliteSchema, ensureStorageSpace, readDatabaseSpace, sqliteBaselineTriggers, STORAGE_SPACE_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { openPartitionPluginDatabase, openPluginDatabase, partitionPluginScope, pluginSyncDatabaseDeclaration } from "@molis-ai/molis-work-app-local-host";
import { PAGES_DATABASE, pagesManifest } from "@molis-ai/molis-work-plugin-pages";
import { FORM_DATABASE, formManifest } from "@molis-ai/molis-work-plugin-form";
import { ISSUES_DATABASE, issuesManifest } from "@molis-ai/molis-work-plugin-issues";

// Pages and Form keep a library in each partition (batch 107), opened there; Issues keeps its one Home library.
const PARTITION = "project-clean";
const cases = [
  { declaration: PAGES_DATABASE, manifest: pagesManifest, table: "pages", seed: "INSERT INTO pages (id,title,body_json,created_at,updated_at,version) VALUES ('kept','title','{}','t','t',1)" },
  { declaration: FORM_DATABASE, manifest: formManifest, table: "forms", seed: "INSERT INTO forms (id,title,description,status,questions_json,created_at,updated_at,version) VALUES ('kept','title','description','draft','[]','t','t',1)" },
  { declaration: ISSUES_DATABASE, manifest: issuesManifest, table: "issues", seed: "INSERT INTO issues VALUES ('kept','title','bug','description','{}','[]','owner','manual','t','t',1)" },
];
const instance = { install_id: "isolated-current", installation_generation: "1" };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
for (const { declaration, manifest, table, seed } of cases) {
  const baseline = pluginSyncDatabaseDeclaration(manifest, declaration);
  const partitioned = manifest.databases?.partition === declaration;
  const scope = (home: string) => partitionPluginScope(home, PARTITION, manifest.plugin_id, instance.install_id);
  const open = (home: string, authorize: (permission: string) => void) => partitioned
    ? openPartitionPluginDatabase(scope(home), home, manifest, authorize, instance) : openPluginDatabase(home, baseline, authorize, instance, manifest);
  const where = (home: string) => partitioned ? scope(home).libraryPath(declaration.store_name) : join(home, declaration.store_name, `${declaration.store_name}.db`);
  const name = declaration.store_name, sql = baseline.schema;
  test(`RAC-2368 ${name} opens and reopens its current complete declared schema at 1`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${name}-`)), file = where(home), permissions: string[] = [];
    try {
      assert.equal(declaration.version, 1);
      assert.equal(declaration.read_permission, `${name}:read`); assert.equal(declaration.write_permission, `${name}:write`);
      open(home, permission => { permissions.push(permission); }).close();
      open(home, permission => { permissions.push(permission); }).close();
      assert.deepEqual(permissions, ["storage:private", "storage:private"]);
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
        assert.deepEqual(readDatabaseSpace(db), ensureStorageSpace(home));
        assert.deepEqual(describeSqliteSchema(db), shape(STORAGE_SPACE_SCHEMA_SQL + sql));
        const triggers = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all();
        assert.deepEqual(new Map(triggers.map(row => [row.name,row.sql])),sqliteBaselineTriggers(sql));
        assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
  test(`RAC-2369 ${name} refuses current schema and a real row at version 2 without changing the file`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${name}-refusal-`)), file = where(home);
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const raw = new DatabaseSync(file); raw.exec(sql); bindDatabaseSpace(raw,ensureStorageSpace(home)); raw.exec(seed); raw.exec("PRAGMA user_version = 2"); raw.close(); chmodSync(file, 0o600);
      const before = readFileSync(file), filesBefore = readdirSync(dirname(file)).sort();
      assert.throws(() => open(home, () => {}), (error: { code?: string; details?: { found?: number; expected?: number } }) =>
        error.code === "storage.store_too_new" && error.details?.found === 2 && error.details?.expected === 1);
      assert.deepEqual(readFileSync(file), before);
      assert.deepEqual(readdirSync(dirname(file)).sort(), filesBefore, "the refusal creates no journal, WAL or SHM sidecar");
      const kept = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(kept.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 1);
        assert.equal(kept.prepare("PRAGMA user_version").get()!.user_version, 2);
        assert.deepEqual(describeSqliteSchema(kept), shape(STORAGE_SPACE_SCHEMA_SQL + sql));
      } finally { kept.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}
