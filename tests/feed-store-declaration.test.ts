import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { FeedModule, ListenerHost, SignalsModule, SourcesModule, type FeedSql } from "@molis-ai/molis-work-plugin-feed/store";
import { WORKSPACE_PACKAGES } from "../scripts/workspace-packages.mjs";

/**
 * FI-5 (specs/repository-anti-corruption/slices/feed-inbox-store-into-feed.md): the Feed, Sources, Signals and Listener Host tables are
 * Feed's declaration's, and the code that reads them is Feed's own store, which reaches them only through `FeedSql`.
 */
const ROOT = new URL("..", import.meta.url).pathname;
const STORE = join(ROOT, "plugins", "native", "feed", "src", "store");

/** A `FeedSql` over `node:sqlite`, not over better-sqlite3: the interface is the whole of what the store needs of a driver. It counts its calls. */
function sqlOver(db: DatabaseSync): FeedSql & { calls: number } {
  const counted = { calls: 0 };
  return {
    get calls() { return counted.calls; },
    get: <Row>(sql: string, ...params: unknown[]) => { counted.calls++; return db.prepare(sql).get(...params as never[]) as Row | undefined; },
    all: <Row>(sql: string, ...params: unknown[]) => { counted.calls++; return db.prepare(sql).all(...params as never[]) as Row[]; },
    run: (sql, ...params) => { counted.calls++; return { changes: Number(db.prepare(sql).run(...params as never[]).changes) }; },
    transaction: <T>(operation: () => T) => {
      counted.calls++;
      db.exec("BEGIN IMMEDIATE");
      try { const result = operation(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

const objects = (db: DatabaseSync) => (db.prepare("SELECT type, name FROM sqlite_master").all() as { type: string; name: string }[]).map(row => `${row.type}:${row.name}`);

test("RAC-498 a Feed store Module is built over a database that has none of its tables without reading it, writing it or making a table", () => {
  const db = new DatabaseSync(":memory:"), sql = sqlOver(db);
  try {
    assert.deepEqual(objects(db), []);
    const signals = new SignalsModule(sql);
    new FeedModule(sql, {} as never, { ledger: {} as never });
    new SourcesModule(sql);
    new ListenerHost(sql, {} as never, signals.commands);
    assert.equal(sql.calls, 0, "no Module reads or writes in its constructor: they only keep the reference they are given");
    assert.deepEqual(objects(db), [], "and none makes a table: the tables are the declaration's, made by the platform");
    assert.throws(() => signals.query.list("project", "source"), /no such table/, "a path that needs a table finds there is none rather than making it");
    assert.deepEqual(objects(db), [], "that did not make one either");
  } finally { db.close(); }
});

/** The module specifiers a source file imports or re-exports from. */
const specifiersOf = (source: string) => [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(match => match[1] ?? match[2] ?? match[3]!);

const filesUnder = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

test("RAC-498 Feed's store does not import a database driver or the storage package's connection", () => {
  const files = filesUnder(STORE);
  assert.ok(files.length > 10, "the store's files are found");
  for (const file of files) {
    for (const specifier of specifiersOf(readFileSync(file, "utf8"))) {
      assert.doesNotMatch(specifier, /^(better-sqlite3|node:sqlite|@molis-ai\/molis-work-storage)(\/|$)/, `${file.slice(ROOT.length)} reaches a database only through FeedSql`);
    }
  }
});

test("RAC-498 the four packages that held the Feed, Sources, Signals and Listener Host tables are gone from the workspace", () => {
  for (const path of ["modules/feed", "modules/sources", "modules/signals", "horizontal/listener-host"]) {
    assert.equal(existsSync(join(ROOT, path, "package.json")), false, `${path} has no package`);
    assert.equal(WORKSPACE_PACKAGES.some((item: { path: string }) => item.path === path), false, `${path} is not a registered workspace package`);
  }
});
