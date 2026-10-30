import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { openPluginDatabase } from "@molis-ai/molis-work-app-local-host";
import { PAGES_DATABASE } from "@molis-ai/molis-work-plugin-pages";
import { FORM_DATABASE } from "@molis-ai/molis-work-plugin-form";
import { ISSUES_DATABASE } from "@molis-ai/molis-work-plugin-issues";

const cases = [
  { declaration: PAGES_DATABASE, table: "pages", seed: "INSERT INTO pages (id,title,body_json,created_at,updated_at,version) VALUES ('kept','title','{}','t','t',1)" },
  { declaration: FORM_DATABASE, table: "forms", seed: "INSERT INTO forms (id,title,description,status,questions_json,created_at,updated_at,version) VALUES ('kept','title','description','draft','[]','t','t',1)" },
  { declaration: ISSUES_DATABASE, table: "issues", seed: "INSERT INTO issues VALUES ('kept','title','bug','description','{}','[]','owner','manual','t','t',1)" },
];
const instance = { install_id: "isolated-current", installation_generation: "1" };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
for (const { declaration, table, seed } of cases) {
  const name = declaration.store_name, sql = readFileSync(new URL(`./fixtures/home-store-schemas/${name}.sql`, import.meta.url), "utf8");
  test(`RAC-2368 ${name} opens and reopens its current complete declared schema at 1`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${name}-`)), file = join(home, name, `${name}.db`), permissions: string[] = [];
    try {
      assert.equal(declaration.version, 1);
      assert.equal(declaration.read_permission, `${name}:read`); assert.equal(declaration.write_permission, `${name}:write`);
      openPluginDatabase(home, declaration, permission => { permissions.push(permission); }, instance).close();
      openPluginDatabase(home, declaration, permission => { permissions.push(permission); }, instance).close();
      assert.deepEqual(permissions, ["storage:private", "storage:private"]);
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
        assert.deepEqual(describeSqliteSchema(db), shape(sql));
        assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
  test(`RAC-2369 ${name} refuses current schema and a real row at version 2 without changing the file`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${name}-refusal-`)), file = join(home, name, `${name}.db`);
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const raw = new DatabaseSync(file); raw.exec(sql); raw.exec(seed); raw.exec("PRAGMA user_version = 2"); raw.close(); chmodSync(file, 0o600);
      const before = readFileSync(file);
      assert.throws(() => openPluginDatabase(home, declaration, () => {}, instance), (error: { code?: string; found?: number; expected?: number }) =>
        error.code === "storage.schema_version_mismatch" && error.found === 2 && error.expected === 1);
      assert.deepEqual(readFileSync(file), before);
      const kept = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(kept.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n, 1);
        assert.equal(kept.prepare("PRAGMA user_version").get()!.user_version, 2);
        assert.deepEqual(describeSqliteSchema(kept), shape(sql));
      } finally { kept.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}
