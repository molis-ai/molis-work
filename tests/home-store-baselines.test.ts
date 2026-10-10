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
import { AGENT_DEFINITIONS_BASELINE, ALCHEMIST_SEARCH_BASELINE, ASSISTANT_STORE_BASELINE, CONNECTORS_BASELINE, CONTEXT_ONBOARDING_BASELINE, PLACEMENT_BASELINE } from "@molis-ai/molis-work-app-local-host";

/** Stores past their first baseline: the memory ledger without its first facts table, the assistant without its memory candidates,
 * Functions with one scene binding per scene and project (keyed by project_id), Form answers that always keep their questions. */
const STORE_VERSIONS: Record<string, number> = { memory: 2, assistant: 2, functions: 3, form: 2 };
/** Baseline tables a real Home had not created yet (made on first use); the one-time stamping run created them empty. */
const LAZY_TABLES: Record<string, string[]> = { connectors: ["connector_authorization_results"] };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };

// Each Home store's baseline (repository-anti-corruption §4.1) is the structure existing stores already have: the
// fixtures are the schema statements of a real Home's stores (schema only), the reference a store was stamped against.
// The Alchemist search store's is what the previous build created, since no real Home had one. Changing a baseline means a new version and a new fixture, never a silent drift.
for (const [name, baseline] of Object.entries<SqliteBaseline>({ pages: PAGES_STORE_BASELINE, form: FORM_STORE_BASELINE, dataset: DATASET_STORE_BASELINE,
  ppt: PPT_STORE_BASELINE, lingguang: LINGGUANG_STORE_BASELINE, todo: TODO_STORE_BASELINE, jelly: JELLY_STORE_BASELINE, cognia: COGNIA_STORE_BASELINE,
  workflows: WORKFLOWS_STORE_BASELINE, functions: FUNCTIONS_STORE_BASELINE, images: IMAGES_STORE_BASELINE, connectors: CONNECTORS_BASELINE,
  "context-onboarding": CONTEXT_ONBOARDING_BASELINE, "agent-definitions": AGENT_DEFINITIONS_BASELINE, placement: PLACEMENT_BASELINE, assistant: ASSISTANT_STORE_BASELINE, memory: MEMORY_LEDGER_BASELINE,
  "alchemist-search": ALCHEMIST_SEARCH_BASELINE })) {
  test(`the ${name} store's baseline is version ${STORE_VERSIONS[name] ?? 1} and the structure existing stores have`, () => {
    assert.equal(baseline.version, STORE_VERSIONS[name] ?? 1);
    const existing = shape(readFileSync(new URL(`./fixtures/home-store-schemas/${name}.sql`, import.meta.url), "utf8")), want = shape(baseline.schema);
    // Every table an existing store has is exactly the baseline's; a table made lazily on first use may be missing there.
    for (const [table, structure] of Object.entries(existing.tables)) assert.deepEqual(want.tables[table], structure, `${name}.${table}`);
    assert.deepEqual(Object.keys(want.tables).filter(table => !existing.tables[table]), LAZY_TABLES[name] ?? [], `${name}: tables only the baseline has`);
  });
}
