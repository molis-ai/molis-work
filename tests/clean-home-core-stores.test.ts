import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { AssistantStore } from "@molis-ai/molis-work-app-local-host";
import { createFunctionsService } from "@molis-ai/molis-work-module-functions";
import { openCharacters } from "@molis-ai/molis-work-module-characters";

const cases = [
  { name: "functions", file: "functions/functions.db", table: "function_scene_bindings",
    seed: "INSERT INTO function_scene_bindings VALUES ('scene', 'project', '{}', 'revision', 'time')",
    open: (home: string) => { const service = createFunctionsService({ home, credential: () => null }); return () => service.close(); } },
  { name: "assistant", file: "assistant/assistant.db", table: "assistant_settings",
    seed: "INSERT INTO assistant_settings VALUES ('owner', 'setting', 1, 'retained')",
    open: (home: string) => { const db = openHomeSqliteDatabase(home, "assistant"); try { new AssistantStore(db); return () => db.close(); } catch (error) { db.close(); throw error; } } },
  { name: "characters", file: "characters/characters.sqlite", table: "character_drafts",
    seed: "INSERT INTO character_drafts VALUES ('draft', 'owner', 1, 'time', '{}')",
    open: (home: string) => { const store = openCharacters(home, "owner"); return () => store.close(); } },
];
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
for (const item of cases) {
  const sql = readFileSync(new URL(`./fixtures/home-store-schemas/${item.name}.sql`, import.meta.url), "utf8");
  test(`RAC-2364 ${item.name} creates and reopens current complete schema at 1`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${item.name}-`));
    try {
      item.open(home)(); item.open(home)();
      const db = new DatabaseSync(join(home, item.file), { readOnly: true });
      try {
        assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
        assert.deepEqual(describeSqliteSchema(db), shape(sql));
        assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
  for (const version of [0, 2]) test(`RAC-2365 ${item.name} refuses current nonempty schema at version ${version} without changing facts or bytes`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${item.name}-refusal-`)), file = join(home, item.file);
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const seeded = new DatabaseSync(file); seeded.exec(sql); seeded.exec(item.seed); seeded.exec(`PRAGMA user_version = ${version}`); seeded.close(); chmodSync(file, 0o600);
      const before = readFileSync(file);
      assert.throws(() => item.open(home), (error: { code?: string; found?: number; expected?: number }) =>
        error.code === "storage.schema_version_mismatch" && error.found === version && error.expected === 1);
      assert.deepEqual(readFileSync(file), before);
      const kept = new DatabaseSync(file, { readOnly: true });
      try {
        assert.equal(kept.prepare(`SELECT count(*) AS n FROM ${item.table}`).get()!.n, 1);
        assert.equal(kept.prepare("PRAGMA user_version").get()!.user_version, version);
        assert.deepEqual(describeSqliteSchema(kept), shape(sql));
      } finally { kept.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
}
