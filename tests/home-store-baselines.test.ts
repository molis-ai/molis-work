import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
import { AGENT_DEFINITIONS_BASELINE, ASSISTANT_STORE_BASELINE, CONNECTORS_BASELINE, CONTEXT_ONBOARDING_BASELINE, PLACEMENT_BASELINE } from "@molis-ai/molis-work-app-local-host";

/** Stores past their first baseline: the memory ledger without its first facts table, the assistant without its memory candidates,
 * Functions with one scene binding per scene and project, Form answers that always keep their questions. */
const STORE_VERSIONS: Record<string, number> = { memory: 2, assistant: 2, functions: 2, form: 2 };
/** Baseline tables a real Home had not created yet (made on first use); the stamping run creates them empty. */
const LAZY_TABLES: Record<string, string[]> = { connectors: ["connector_authorization_results"] };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };

// Each Home store's baseline (repository-anti-corruption §4.1) is the structure existing stores already have: the
// fixtures are the schema statements of a real Home's stores (schema only), the reference a store is stamped against.
// Changing a baseline means a new version and a new fixture, never a silent drift.
for (const [name, baseline] of Object.entries<SqliteBaseline>({ pages: PAGES_STORE_BASELINE, form: FORM_STORE_BASELINE, dataset: DATASET_STORE_BASELINE,
  ppt: PPT_STORE_BASELINE, lingguang: LINGGUANG_STORE_BASELINE, todo: TODO_STORE_BASELINE, jelly: JELLY_STORE_BASELINE, cognia: COGNIA_STORE_BASELINE,
  workflows: WORKFLOWS_STORE_BASELINE, functions: FUNCTIONS_STORE_BASELINE, images: IMAGES_STORE_BASELINE, connectors: CONNECTORS_BASELINE,
  "context-onboarding": CONTEXT_ONBOARDING_BASELINE, "agent-definitions": AGENT_DEFINITIONS_BASELINE, placement: PLACEMENT_BASELINE, assistant: ASSISTANT_STORE_BASELINE, memory: MEMORY_LEDGER_BASELINE })) {
  test(`the ${name} store's baseline is version ${STORE_VERSIONS[name] ?? 1} and the structure existing stores have`, () => {
    assert.equal(baseline.version, STORE_VERSIONS[name] ?? 1);
    const existing = shape(readFileSync(new URL(`./fixtures/home-store-schemas/${name}.sql`, import.meta.url), "utf8")), want = shape(baseline.schema);
    // Every table an existing store has is exactly the baseline's; a table made lazily on first use may be missing there.
    for (const [table, structure] of Object.entries(existing.tables)) assert.deepEqual(want.tables[table], structure, `${name}.${table}`);
    assert.deepEqual(Object.keys(want.tables).filter(table => !existing.tables[table]), LAZY_TABLES[name] ?? [], `${name}: tables only the baseline has`);
  });
}

// The one-time stamping run for an existing Home: only an exact structural match gets the version, a dry run writes
// nothing, a differing store is reported and left as it is, and a stamped store then opens through its baseline.
test("stamping an existing Home gives matching stores their version and leaves the rest alone", async t => {
  const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { homeSqlitePath } = await import("@molis-ai/molis-work-storage");
  const { openPagesStore } = await import("@molis-ai/molis-work-plugin-pages");
  const { stampStoreBaselines } = await import("../scripts/stamp-store-baselines.mjs");
  const home = mkdtempSync(join(tmpdir(), "molis-stamp-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const make = (name: string, sql: string) => { mkdirSync(join(home, name), { recursive: true }); const db = new DatabaseSync(homeSqlitePath(home, name)); db.exec(sql); db.close(); };
  make("pages", readFileSync(new URL("./fixtures/home-store-schemas/pages.sql", import.meta.url), "utf8"));
  make("form", "CREATE TABLE forms (id TEXT PRIMARY KEY);");
  const version = (name: string) => { const db = new DatabaseSync(homeSqlitePath(home, name), { readOnly: true }); try { return (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version; } finally { db.close(); } };
  const verdicts = (rows: Array<{ name: string; verdict: string }>) => Object.fromEntries(rows.filter(row => row.verdict !== "absent").map(row => [row.name, row.verdict]));

  assert.deepEqual(verdicts(await stampStoreBaselines(home)), { pages: "stampable", form: "different" });
  assert.deepEqual([version("pages"), version("form")], [0, 0], "a dry run writes nothing");
  assert.deepEqual(verdicts(await stampStoreBaselines(home, { apply: true })), { pages: "stamped", form: "different" });
  assert.deepEqual([version("pages"), version("form")], [1, 0]);
  assert.deepEqual(verdicts(await stampStoreBaselines(home)), { pages: "current", form: "different" });
  const pages = openPagesStore(home);
  pages.close();
});
