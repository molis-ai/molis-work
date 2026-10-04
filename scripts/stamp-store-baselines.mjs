#!/usr/bin/env node
// Stamp a Home's stores with their baseline version (repository-anti-corruption §4.1).
//
//   node scripts/stamp-store-baselines.mjs <home>            report only
//   node scripts/stamp-store-baselines.mjs <home> --apply    write `PRAGMA user_version` where the structure matches
//
// A store gets its version only when every table it has is exactly the baseline's — columns in order, indexes, foreign
// keys and CHECK clauses. A baseline table the store never created (one made lazily, on first use) is created empty in
// the same transaction. Nothing existing is ever changed: a store with a differing or extra table is reported and left
// alone. Run it with every Molis Work process of that Home stopped, after a backup.
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { homeSqlitePath, describeSqliteSchema } from "@molis-ai/molis-work-storage";

export const STORE_BASELINES = [
  ["pages", "@molis-ai/molis-work-plugin-pages", "PAGES_STORE_BASELINE"],
  ["form", "@molis-ai/molis-work-plugin-form", "FORM_STORE_BASELINE"],
  ["dataset", "@molis-ai/molis-work-plugin-dataset", "DATASET_STORE_BASELINE"],
  ["ppt", "@molis-ai/molis-work-plugin-ppt", "PPT_STORE_BASELINE"],
  ["lingguang", "@molis-ai/molis-work-plugin-lingguang", "LINGGUANG_STORE_BASELINE"],
  ["todo", "@molis-ai/molis-work-plugin-todo", "TODO_STORE_BASELINE"],
  ["jelly", "@molis-ai/molis-work-plugin-jelly", "JELLY_STORE_BASELINE"],
  ["cognia", "@molis-ai/molis-work-plugin-cognia", "COGNIA_STORE_BASELINE"],
  ["workflows", "@molis-ai/molis-work-plugin-workflows", "WORKFLOWS_STORE_BASELINE"],
  ["functions", "@molis-ai/molis-work-module-functions", "FUNCTIONS_STORE_BASELINE"],
  ["images", "@molis-ai/molis-work-plugin-images", "IMAGES_STORE_BASELINE"],
  ["connectors", "@molis-ai/molis-work-app-local-host", "CONNECTORS_BASELINE"],
  ["context-onboarding", "@molis-ai/molis-work-app-local-host", "CONTEXT_ONBOARDING_BASELINE"],
  ["agent-definitions", "@molis-ai/molis-work-app-local-host", "AGENT_DEFINITIONS_BASELINE"],
  ["placement", "@molis-ai/molis-work-app-local-host", "PLACEMENT_BASELINE"],
  ["assistant", "@molis-ai/molis-work-app-local-host", "ASSISTANT_STORE_BASELINE"],
  ["memory", "@molis-ai/molis-work-storage", "MEMORY_LEDGER_BASELINE"],
];

/** Each store's verdict: absent, already at the version, stampable (or stamped), or different. */
export async function stampStoreBaselines(home, { apply = false } = {}) {
  const results = [];
  for (const [name, module, exportName] of STORE_BASELINES) {
    const baseline = (await import(module))[exportName];
    if (!baseline) throw new Error(`${module} 没有导出 ${exportName}`);
    const path = homeSqlitePath(home, name);
    if (!existsSync(path)) { results.push({ name, verdict: "absent" }); continue; }
    const expected = new DatabaseSync(":memory:");
    expected.exec(baseline.schema);
    const want = describeSqliteSchema(expected);
    const statements = expected.prepare("SELECT type, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all();
    expected.close();
    const db = new DatabaseSync(path, apply ? {} : { readOnly: true });
    try {
      const version = db.prepare("PRAGMA user_version").get().user_version;
      if (version === baseline.version) { results.push({ name, verdict: "current", version }); continue; }
      if (version !== 0) { results.push({ name, verdict: "other-version", version, expected: baseline.version }); continue; }
      const have = describeSqliteSchema(db);
      const differing = Object.keys(have.tables).filter(table => !isDeepStrictEqual(have.tables[table], want.tables[table]));
      if (differing.length) { results.push({ name, verdict: "different", tables: differing }); continue; }
      const missing = Object.keys(want.tables).filter(table => !have.tables[table]);
      if (apply) {
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const kind of ["table", "index"]) {
            for (const row of statements) if (row.type === kind && missing.includes(row.tbl_name)) db.exec(row.sql);
          }
          db.exec(`PRAGMA user_version = ${baseline.version}`);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
      }
      results.push({ name, verdict: apply ? "stamped" : "stampable", version: baseline.version, ...(missing.length ? { created: missing } : {}) });
    } finally { db.close(); }
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const home = process.argv[2];
  if (!home) { console.error("usage: node scripts/stamp-store-baselines.mjs <home> [--apply]"); process.exit(2); }
  const results = await stampStoreBaselines(home, { apply: process.argv.includes("--apply") });
  for (const result of results) console.log(JSON.stringify(result));
  process.exitCode = results.some(result => result.verdict === "different" || result.verdict === "other-version") ? 1 : 0;
}
