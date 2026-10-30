#!/usr/bin/env node
// PG-077 step 2. Explicit catalog v22, after Goals personal planning has moved out and before W5-17 takes v23.
// list|apply --database <copy>/projects/catalog.db [--maintenance-window]. No project database or stored path is opened.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";

const OWNER = "molis-work-project-catalog-v1", VERSION = "22";
const TABLES = ["project_plugins", "project_plugin_exclusions"];
function expectedSchema() {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("./catalog-before-w517.sql", import.meta.url), "utf8"));
    return describeSqliteSchema(db);
  } finally { db.close(); }
}
const quote = name => `"${name.replaceAll('"', '""')}"`;
function inspect(db) {
  if (db.prepare("SELECT value FROM catalog_meta WHERE key='owner'").get()?.value !== OWNER
    || db.prepare("SELECT value FROM catalog_meta WHERE key='schema_version'").get()?.value !== VERSION) throw new Error("catalog owner/version mismatch; nothing changed");
  if (!isDeepStrictEqual(describeSqliteSchema(db), expectedSchema())
    || db.prepare("SELECT name FROM sqlite_schema WHERE type NOT IN ('table','index')").all().length) throw new Error("catalog structure mismatch; nothing changed");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("catalog integrity check failed; nothing changed");
  const counts = Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(({ name }) => [name, db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n]));
  const obsolete = Object.fromEntries(TABLES.map(name => [name, db.prepare(`SELECT count(*) AS n FROM ${name} WHERE plugin_id='artifacts'`).get().n]));
  return { version: Number(VERSION), counts, obsolete };
}

export function maintain(database, apply = false) {
  const file = lstatSync(database);
  const canonical = realpathSync(database), inside = (value, root) => value.startsWith(root + path.sep);
  const temporaryAlias = inside(path.resolve(database), path.resolve(tmpdir())) && inside(canonical, realpathSync(tmpdir()));
  if (!file.isFile() || file.nlink !== 1 || (path.resolve(database) !== canonical && !temporaryAlias)) throw new Error("catalog must be an ordinary file without linked ancestors");
  const db = new DatabaseSync(database, { readOnly: !apply });
  try {
    if (apply) db.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
    const before = inspect(db);
    if (!apply) return { ...before, changed: 0 };
    let changed = 0;
    for (const table of TABLES) {
      const removed = Number(db.prepare(`DELETE FROM ${table} WHERE plugin_id='artifacts'`).run().changes);
      if (removed !== before.obsolete[table]) throw new Error("catalog changed since preflight");
      changed += removed;
    }
    const after = inspect(db);
    for (const [name, count] of Object.entries(before.counts)) {
      if (after.counts[name] !== count - (before.obsolete[name] ?? 0)) throw new Error(`unexpected row count: ${name}`);
    }
    if (Object.values(after.obsolete).some(n => n !== 0)) throw new Error("obsolete membership remains");
    db.exec("COMMIT");
    return { ...after, changed, removed: before.obsolete };
  } catch (error) {
    if (apply && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally { db.close(); }
}

function main(args) {
  const command = args.shift(), at = args.indexOf("--database"), database = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0) args.splice(at, 2);
  const window = args.includes("--maintenance-window");
  if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !database || args.length) throw new Error("list|apply --database <explicit catalog> [--maintenance-window]");
  const file = path.resolve(database), realHome = path.join(homedir(), ".molis-work");
  const inside = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);
  if (inside(file, realHome) && (command === "list" || !window)) throw new Error("use a copy for list; real apply needs the approved maintenance window");
  if (command === "apply" && !inside(file, realpathSync(tmpdir())) && !window) throw new Error("apply outside a disposable Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintain(file, command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
