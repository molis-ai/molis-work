import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { CHARACTERS_STORE_BASELINE, openCharacters } from "@molis-ai/molis-work-module-characters";
import { ALCHEMIST_SEARCH_BASELINE, MolisWorkLocalHost, homeStores } from "@molis-ai/molis-work-app-local-host";

/** Stores past their first baseline: the memory ledger without its first facts table, the assistant without its memory candidates,
 * Functions with one scene binding per scene and project (keyed by project_id) and judgments keyed by the installation that recorded them, Form answers that always keep their questions,
 * Characters with its own native runs (Sessions cleanup SC-2). */
const STORE_VERSIONS: Record<string, number> = { connectors: 1, pages: 1, memory: 1, assistant: 1, functions: 1, form: 1, characters: 1 };
const shape = (sql: string) => { const db = new DatabaseSync(":memory:"); try { db.exec(sql); return describeSqliteSchema(db); } finally { db.close(); } };

/**
 * The registered libraries with no schema fixture taken from a real Home: Issues and the discussion store had no real-Home schema taken when the fixtures were; project knowledge's cards
 * (specs/project-knowledge K1), the original-file registrations plugins keep (plugin-originals, 2026-10-20) and the installations'
 * remembered Agent declarations (agent-declarations, PG-051 2026-10-23) and the local directories the person granted plugins
 * (plugin-directories, PG-049 2026-10-25) are new, so no Home has them yet. A new library either
 * comes with a fixture or is named here. Goals' new Home library (PG-094 S13) has no real-Home schema receipt yet;
 * its personal-method writes and isolated catalog-to-Home move are covered separately, not presented as an existing-Home fixture.
 * Feed's Home reference ledger (feed-content, FI-6) is new with the Feed Home half, so no Home has it either; its v1 is frozen below.
 */
const WITHOUT_REAL_HOME_FIXTURE = ["plugin-libraries", "agent-declarations", "plugin-originals", "plugin-directories", "knowledge", "server", "goals", "feed-content"];
const libraries = homeStores().stores.flatMap(store => store.library ? [[store.path, store.library.baseline] as const] : []);
test("every library in the Home's store registry has a schema fixture or is named as having none", () => {
  const fixtures = new Set(readdirSync(new URL("./fixtures/home-store-schemas/", import.meta.url)).filter(file => file.endsWith(".sql")).map(file => file.slice(0, -4)));
  assert.deepEqual(libraries.map(([name]) => name).filter(name => !fixtures.has(name)), WITHOUT_REAL_HOME_FIXTURE);
});

test("RAC-790 RAC-791: the new Goals Home library freezes its accepted v1 personal-method schema, with no real-Home receipt implied", () => {
  const goals = homeStores().stores.find(store => store.path === "goals");
  assert.equal(goals?.owner, "io.molis.work.goals");
  assert.equal(goals?.library?.baseline.version, 1);
  assert.deepEqual(shape(goals!.library!.baseline.schema), shape(readFileSync(new URL("./fixtures/goals-home-v1.sql", import.meta.url), "utf8")));
});

test("FI-6: Feed's Home reference ledger freezes its accepted v1 schema, with no real-Home receipt implied", () => {
  const ledger = homeStores().stores.find(store => store.path === "feed-content");
  assert.equal(ledger?.owner, "io.molis.work.feed");
  assert.equal(ledger?.library?.baseline.version, 1);
  assert.deepEqual(shape(ledger!.library!.baseline.schema), shape(readFileSync(new URL("./fixtures/feed-content-home-v1.sql", import.meta.url), "utf8")));
});

// Each Home store's baseline (repository-anti-corruption §4.1) is the structure existing stores already have: the
// fixtures began as real-Home schema statements (schema only); the connectors fixture now freezes its complete current
// owner DDL, including authorization_results, not another real-Home receipt.
// The Alchemist search store's is what the previous build created, since no real Home had one; it lives inside the
// Alchemist store's directory, one per project, so it is not a registered library of its own. Changing a baseline means a
// new version and a new fixture, never a silent drift.
for (const [name, baseline] of [...libraries.filter(([name]) => !WITHOUT_REAL_HOME_FIXTURE.includes(name)), ["alchemist-search", ALCHEMIST_SEARCH_BASELINE] as const]) {
  test(`the ${name} store's baseline is version ${STORE_VERSIONS[name] ?? 1} and the structure existing stores have`, () => {
    assert.equal(baseline.version, STORE_VERSIONS[name] ?? 1);
    const existing = shape(readFileSync(new URL(`./fixtures/home-store-schemas/${name}.sql`, import.meta.url), "utf8")), want = shape(baseline.schema);
    // RAC-2384: the fixture carries the complete current schema; no missing-table allowance remains.
    assert.deepEqual(want, existing, `${name}: complete frozen schema`);
  });
}

// RAC-44 (library version and shape kept when Cognia moved to a Home Runtime): the cognia row above compares the library
// Cognia's own Home Runtime entry declares with the real-Home fixture. The registry only carries that library while the
// declaration exists, and the row would silently go with it, so its presence is asserted here.
test("RAC-44: the cognia library is the one Cognia's Home Runtime declares, at version 1, so the row above checks its shape", () => {
  const cognia = homeStores().stores.find(store => store.path === "cognia");
  assert.equal(cognia?.owner, "io.molis.work.cognia");
  assert.equal(cognia?.library?.baseline.version, 1);
  assert.ok(libraries.some(([name]) => name === "cognia") && !WITHOUT_REAL_HOME_FIXTURE.includes("cognia"));
});

test("W3-06-F-04 Home Runtime created by the public Host is the complete independent current baseline at 1", async () => {
  const home = mkdtempSync(join(tmpdir(), "home-runtime-baseline-")), host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  let db: DatabaseSync | undefined;
  try {
    await host.homePlugins!.ready();
    db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
    assert.deepEqual(describeSqliteSchema(db), shape(readFileSync(new URL("./fixtures/home-store-schemas/plugin-runtime.sql", import.meta.url), "utf8")));
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
  const newer = store("newer", `${CHARACTERS_STORE_BASELINE.schema} PRAGMA user_version = 3;`);
  assert.throws(() => openCharacters(newer, "actor"), mismatch);
  assert.deepEqual(state(newer), { version: 3, rows: 0 });
  const fresh = openCharacters(join(home, "fresh"), "actor");
  try { assert.deepEqual(fresh.service.list(), []); } finally { fresh.close(); }
  assert.deepEqual(state(join(home, "fresh")), { version: 1, rows: 0 });
  openCharacters(join(home, "fresh"), "actor").close();
});
