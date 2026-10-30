#!/usr/bin/env node
// Offline, one-store maintenance. SQL files require these checks and refuse to run without them.
// list|apply --store characters|functions|assistant --database <explicit copy path> [--maintenance-window]
// No default Home, business startup, key access or runtime migration. Real writes still require the user's approved window.
import { isDeepStrictEqual } from "node:util";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteBaseline, describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { CHARACTERS_STORE_BASELINE } from "@molis-ai/molis-work-module-characters";
import { FUNCTIONS_STORE_BASELINE } from "@molis-ai/molis-work-module-functions";
import { ASSISTANT_STORE_BASELINE } from "@molis-ai/molis-work-app-local-host";

const stores = {
  characters: { from: 1, to: 2, baseline: CHARACTERS_STORE_BASELINE },
  functions: { from: 3, to: 4, baseline: FUNCTIONS_STORE_BASELINE },
  assistant: { from: 2, to: 3, baseline: ASSISTANT_STORE_BASELINE },
};
const quote = name => `"${name.replaceAll('"', '""')}"`;
const counts = db => Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all().map(row => [row.name, Number(db.prepare(`SELECT count(*) AS n FROM ${quote(row.name)}`).get().n)]));
const versionOf = db => Number(db.prepare("PRAGMA user_version").get().user_version);
const expected = (owner, current) => describeSqliteBaseline(current ? stores[owner].baseline
  : { version: stores[owner].from, schema: readFileSync(new URL(`./${owner}-before-maintenance.sql`, import.meta.url), "utf8") });

function validate(db, owner, current) {
  const store = stores[owner];
  if (!store || store.baseline.version !== store.to) throw new Error("unknown or changed maintenance definition");
  if (versionOf(db) !== (current ? store.to : store.from)) throw new Error(`${owner}: unexpected maintenance version`);
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('view', 'trigger') LIMIT 1").get()
    || !isDeepStrictEqual(describeSqliteSchema(db), expected(owner, current))) throw new Error(`${owner}: maintenance schema mismatch`);
  const integrity = db.prepare("PRAGMA integrity_check").all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error(`${owner}: integrity_check failed`);
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error(`${owner}: foreign_key_check failed`);
  return counts(db);
}

/** Both functions run inside the SQL's existing single transaction; no error may be followed by COMMIT. */
export function registerMaintenanceChecks(db, owner) {
  let before;
  db.function("maintenance_before", () => { before = validate(db, owner, false); return 1; });
  db.function("maintenance_after", () => {
    const after = validate(db, owner, true);
    if (!before || Object.entries(before).some(([table, count]) => after[table] !== count)
      || Object.entries(after).some(([table, count]) => !(table in before) && count !== 0)) throw new Error(`${owner}: maintenance row counts changed`);
    return 1;
  });
}

export function maintainStore(file, owner, apply = false) {
  if (!stores[owner]) throw new Error("unknown store");
  if (!existsSync(file) || !lstatSync(file).isFile() || lstatSync(file).nlink !== 1) throw new Error("expected an existing ordinary store file");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    const current = versionOf(db) === stores[owner].to;
    const before = validate(db, owner, current);
    if (apply && !current) {
      registerMaintenanceChecks(db, owner);
      try { db.exec(readFileSync(new URL(`./${owner}-maintenance-v${stores[owner].to}.sql`, import.meta.url), "utf8")); }
      catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
    }
    return { store: owner, version: versionOf(db), target: stores[owner].to, current: current || apply, changed: apply && !current, rows: before };
  } finally { db.close(); }
}

function main(args) {
  const [mode, ...rest] = args, options = {};
  for (let index = 0; index < rest.length; index++) {
    if (["--store", "--database"].includes(rest[index])) options[rest[index]] = rest[++index];
    else if (rest[index] === "--maintenance-window") options.window = true;
    else throw new Error("unknown maintenance argument");
  }
  if (!["list", "apply"].includes(mode) || !options["--store"] || !options["--database"]) throw new Error("list|apply --store <owner> --database <copy path> [--maintenance-window]");
  const file = path.resolve(options["--database"]), source = path.join(homedir(), ".molis-work");
  if (mode === "list" && (file === source || file.startsWith(source + path.sep))) throw new Error("list requires a copy outside the real Home");
  const temporary = realpathSync(tmpdir());
  if (mode === "apply" && !file.startsWith(temporary + path.sep) && !options.window) throw new Error("apply outside a temporary Home requires --maintenance-window");
  process.stdout.write(JSON.stringify(maintainStore(file, options["--store"], mode === "apply")) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`home-store-maintenance: ${error.message}\n`); process.exitCode = 1; }
}
