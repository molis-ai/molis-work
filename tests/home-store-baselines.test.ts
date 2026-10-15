import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, MEMORY_LEDGER_BASELINE, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { PAGES_STORE_BASELINE } from "@molis-ai/molis-work-plugin-pages";
import { FORM_STORE_BASELINE } from "@molis-ai/molis-work-plugin-form";
import { DATASET_STORE_BASELINE } from "@molis-ai/molis-work-plugin-dataset";
import { PPT_STORE_BASELINE } from "@molis-ai/molis-work-plugin-ppt";
import { LINGGUANG_STORE_BASELINE } from "@molis-ai/molis-work-plugin-lingguang";
import { TODO_STORE_BASELINE } from "@molis-ai/molis-work-plugin-todo";
import { JELLY_STORE_BASELINE } from "@molis-ai/molis-work-plugin-jelly";
import { COGNIA_STORE_BASELINE } from "@molis-ai/molis-work-plugin-cognia";
import { WORKFLOWS_STORE_BASELINE } from "@molis-ai/molis-work-plugin-workflows";
import { FUNCTIONS_STORE_BASELINE } from "@molis-ai/molis-work-module-functions";
import { IMAGES_STORE_BASELINE } from "@molis-ai/molis-work-plugin-images";
import { CHARACTERS_STORE_BASELINE, openCharacters } from "@molis-ai/molis-work-module-characters";
import { AGENT_DEFINITIONS_BASELINE, ALCHEMIST_SEARCH_BASELINE, ASSISTANT_STORE_BASELINE, CONNECTORS_BASELINE, CONTEXT_ONBOARDING_BASELINE, MolisWorkLocalHost, PLACEMENT_BASELINE } from "@molis-ai/molis-work-app-local-host";

/** Stores past their first baseline: the memory ledger without its first facts table, the assistant without its memory candidates,
 * Functions with one scene binding per scene and project (keyed by project_id), Form answers that always keep their questions. */
const STORE_VERSIONS: Record<string, number> = { pages: 2, memory: 2, assistant: 2, functions: 3, form: 2 };
/** Baseline tables a real Home had not created yet (made on first use); the one-time stamping run created them empty. */
const LAZY_TABLES: Record<string, string[]> = { connectors: ["connector_authorization_results"] };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };

// Each Home store's baseline (repository-anti-corruption §4.1) is the structure existing stores already have: the
// fixtures are the schema statements of a real Home's stores (schema only), the reference a store was stamped against.
// The Alchemist search store's is what the previous build created, since no real Home had one. Changing a baseline means a new version and a new fixture, never a silent drift.
for (const [name, baseline] of Object.entries<SqliteBaseline>({ pages: PAGES_STORE_BASELINE, form: FORM_STORE_BASELINE, dataset: DATASET_STORE_BASELINE,
  ppt: PPT_STORE_BASELINE, lingguang: LINGGUANG_STORE_BASELINE, todo: TODO_STORE_BASELINE, jelly: JELLY_STORE_BASELINE, cognia: COGNIA_STORE_BASELINE,
  workflows: WORKFLOWS_STORE_BASELINE, functions: FUNCTIONS_STORE_BASELINE, images: IMAGES_STORE_BASELINE, connectors: CONNECTORS_BASELINE,
  "context-onboarding": CONTEXT_ONBOARDING_BASELINE, "agent-definitions": AGENT_DEFINITIONS_BASELINE, placement: PLACEMENT_BASELINE, assistant: ASSISTANT_STORE_BASELINE, memory: MEMORY_LEDGER_BASELINE, characters: CHARACTERS_STORE_BASELINE,
  "alchemist-search": ALCHEMIST_SEARCH_BASELINE })) {
  test(`the ${name} store's baseline is version ${STORE_VERSIONS[name] ?? 1} and the structure existing stores have`, () => {
    assert.equal(baseline.version, STORE_VERSIONS[name] ?? 1);
    const existing = shape(readFileSync(new URL(`./fixtures/home-store-schemas/${name}.sql`, import.meta.url), "utf8")), want = shape(baseline.schema);
    // Every table an existing store has is exactly the baseline's; a table made lazily on first use may be missing there.
    for (const [table, structure] of Object.entries(existing.tables)) assert.deepEqual(want.tables[table], structure, `${name}.${table}`);
    assert.deepEqual(Object.keys(want.tables).filter(table => !existing.tables[table]), LAZY_TABLES[name] ?? [], `${name}: tables only the baseline has`);
  });
}

test("W3-06-F-04 Home Runtime created by the public Host is the complete independent v2 baseline", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-runtime-baseline-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let db: DatabaseSync | undefined;
  try {
    await host.homePlugins!.ready();
    db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 2);
    assert.deepEqual(describeSqliteSchema(db), shape(readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime-v2.sql", import.meta.url), "utf8")));
  } finally { db?.close(); try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } }
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
  const unversioned = store("unversioned", "CREATE TABLE character_drafts (id TEXT PRIMARY KEY, body TEXT); INSERT INTO character_drafts VALUES ('old', '旧草稿');");
  assert.throws(() => openCharacters(unversioned, "actor"), mismatch);
  assert.deepEqual(state(unversioned), { version: 0, rows: 1 }, "the unversioned store keeps its row and is not stamped");
  const newer = store("newer", `${CHARACTERS_STORE_BASELINE.schema} PRAGMA user_version = 2;`);
  assert.throws(() => openCharacters(newer, "actor"), mismatch);
  assert.deepEqual(state(newer), { version: 2, rows: 0 });
  const fresh = openCharacters(join(home, "fresh"), "actor");
  try { assert.deepEqual(fresh.service.list(), []); } finally { fresh.close(); }
  assert.deepEqual(state(join(home, "fresh")), { version: 1, rows: 0 });
  openCharacters(join(home, "fresh"), "actor").close();
});
