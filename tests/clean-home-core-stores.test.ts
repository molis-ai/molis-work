import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { describeSqliteSchema, openBaselineHomeSqlite, STORAGE_SPACE_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { AssistantStore, ASSISTANT_STORE_BASELINE } from "@molis-ai/molis-work-app-local-host";
import { createFunctionsService } from "@molis-ai/molis-work-module-judgment-rules";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { MainlineStore, openMainlineDatabase } from "@molis-ai/molis-work-service-mainline";

const cases = [
  // V7 (batch 106, user 2026-11-24): functions.db was reset to its v1 baseline.
  { name: "functions", version: 1, file: "functions/functions.db", table: "function_scene_bindings",
    seed: "INSERT INTO function_scene_bindings VALUES ('scene', 'project', '{}', 'revision', 'time')",
    open: (home: string) => { const service = createFunctionsService({ home, credential: () => null }); return () => service.close(); } },
  { name: "assistant", version: 1, file: "assistant/assistant.db", table: "assistant_settings",
    seed: "INSERT INTO assistant_settings VALUES ('owner', 'setting', 1, 'retained')",
    open: (home: string) => { const db = openBaselineHomeSqlite(home, "assistant", ASSISTANT_STORE_BASELINE); try { new AssistantStore(db); return () => db.close(); } catch (error) { db.close(); throw error; } } },
  { name: "characters", version: 1, file: "characters/characters.sqlite", table: "character_drafts",
    seed: "INSERT INTO character_drafts VALUES ('draft', 'owner', 1, 'time', '{}')",
    open: (home: string) => { const store = openCharacters(home, "owner"); return () => store.close(); } },
  { name: "mainline", version: 1, file: "mainline/mainline.db", table: "mainline_items",
    seed: "INSERT INTO mainline_items VALUES ('owner', 'project', 'item', 'name', NULL, NULL, 'time', 1)",
    open: (home: string) => { const db = openMainlineDatabase(home); return () => db.close(); } },
];
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };
for (const item of cases) {
  const sql = readFileSync(new URL(`./fixtures/home-store-schemas/${item.name}.sql`, import.meta.url), "utf8");
  test(`RAC-2364 ${item.name} creates and reopens current complete schema at ${item.version}`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${item.name}-`));
    try {
      item.open(home)(); item.open(home)();
      const db = new DatabaseSync(join(home, item.file), { readOnly: true });
      try {
        assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, item.version);
        assert.deepEqual(describeSqliteSchema(db), shape(STORAGE_SPACE_SCHEMA_SQL + sql));
        assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
        assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      } finally { db.close(); }
    } finally { rmSync(home, { recursive: true, force: true }); }
  });
  for (const version of [0, ...(item.version > 1 ? [item.version - 1] : []), item.version + 1]) test(`RAC-2365 ${item.name} refuses current nonempty schema at version ${version} without changing facts or bytes`, () => {
    const home = mkdtempSync(join(tmpdir(), `clean-home-${item.name}-refusal-`)), file = join(home, item.file);
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const seeded = new DatabaseSync(file); seeded.exec(sql); seeded.exec(item.seed); seeded.exec(`PRAGMA user_version = ${version}`); seeded.close(); chmodSync(file, 0o600);
      const before = readFileSync(file);
      assert.throws(() => item.open(home), (error: { code?: string; details?: { found?: number; expected?: number } }) =>
        error.code === (version === 0 ? "storage.schema_version_mismatch" : version < item.version ? "storage.upgrade_pending" : "storage.store_too_new") && error.details?.found === version && error.details?.expected === item.version);
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

test("MLC-15 mainline refuses pre-revision v1 and starts fresh after its owner sets the old store aside", t => {
  const home = mkdtempSync(join(tmpdir(), "mainline-clean-v1-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = join(home, "mainline", "mainline.db");
  const old = openMainlineDatabase(home);
  try {
    const store = new MainlineStore(old, "owner", "project");
    store.createLight("保留在旧库里的事项");
    old.exec("ALTER TABLE mainline_items DROP COLUMN revision");
  } finally { old.close(); }

  const before = readFileSync(file);
  assert.throws(() => openMainlineDatabase(home), { code: "storage.schema_structure_mismatch" });
  assert.deepEqual(readFileSync(file), before);

  const backup = join(home, "mainline-backup");
  renameSync(dirname(file), backup);
  const fresh = openMainlineDatabase(home);
  let itemId: string;
  try {
    const store = new MainlineStore(fresh, "owner", "project");
    assert.equal(fresh.prepare("SELECT count(*) AS n FROM mainline_items").get()?.n, 0);
    itemId = store.createLight("新事项").item_id;
    assert.equal(store.itemWithRevision(itemId)?.revision, "1");
    store.rename(store.read().revision, itemId, "改名后的事项");
  } finally { fresh.close(); }
  const reopened = openMainlineDatabase(home);
  try {
    const item = new MainlineStore(reopened, "owner", "project").itemWithRevision(itemId);
    assert.equal(reopened.prepare("PRAGMA user_version").get()?.user_version, 1);
    assert.equal(item?.item.name, "改名后的事项");
    assert.equal(item?.revision, "2");
  } finally { reopened.close(); }
  assert.deepEqual(readFileSync(join(backup, "mainline.db")), before);
});
