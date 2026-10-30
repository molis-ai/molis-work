#!/usr/bin/env node
// Offline project maintenance, one file and one transaction. These functions are required by the SQL fixtures.
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { scheduleManifest } from "@molis-ai/molis-work-plugin-schedule";
import { PLUGIN_NOTIFICATIONS_SCHEMA_SQL } from "@molis-ai/molis-work-plugin-runtime";

const PLUGINS = [codingManifest, feedManifest, goalsManifest, inboxManifest, scheduleManifest];
const quote = value => `"${value.replaceAll('"', '""')}"`;
const versionOf = db => Number(db.prepare("PRAGMA user_version").get().user_version);
const tablesOf = db => db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
const countsOf = db => Object.fromEntries(tablesOf(db).map(name => [name, Number(db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n)]));

/** Frozen platform shapes, plus only known Plugin declarations physically present in this library. Unknown objects refuse. */
function expectedSchema(db, version) {
  const scratch = new DatabaseSync(":memory:"), names = new Set(db.prepare("SELECT name FROM sqlite_schema").all().map(row => row.name));
  try {
    const baseline = version === 11 ? 10 : version;
    scratch.exec(readFileSync(new URL(`./project-database-schema-v${baseline}.sql`, import.meta.url), "utf8"));
    if (version === 11) scratch.exec(PLUGIN_NOTIFICATIONS_SCHEMA_SQL);
    if (version !== 7) {
      for (const plugin of PLUGINS) {
        const declaration = plugin.databases?.project;
        if (!declaration) continue;
        const own = new DatabaseSync(":memory:");
        try {
          own.exec(declaration.schema);
          if (tablesOf(own).some(name => names.has(name) && !tablesOf(scratch).includes(name))) scratch.exec(declaration.schema);
        } finally { own.close(); }
      }
    }
    return describeSqliteSchema(scratch);
  } finally { scratch.close(); }
}

export function validateProject(db, version) {
  if (![7, 8, 9, 10, 11].includes(version) || versionOf(db) !== version) throw new Error("project maintenance version mismatch");
  if (!isDeepStrictEqual(describeSqliteSchema(db), expectedSchema(db, version))
    || db.prepare("SELECT name FROM sqlite_schema WHERE type NOT IN ('table','index')").all().length) throw new Error("project maintenance structure mismatch");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("project maintenance integrity check failed");
  return countsOf(db);
}

/** SQL still owns BEGIN/COMMIT; an exception at either guard leaves no maintenance committed. */
export function registerProjectMaintenanceChecks(db) {
  let before, previousTarget;
  db.function("project_maintenance_before", target => { before = validateProject(db, target - 1); previousTarget = target; return 1; });
  db.function("project_maintenance_after", target => {
    const after = validateProject(db, target);
    const added = target === 8 ? { project_root: 1, plugin_project_databases: 4 } : target === 9 ? { schedule_action_bindings: 0 }
      : target === 11 ? { plugin_notifications: 0 } : {};
    if (!before || previousTarget !== target || Object.entries(before).some(([table, count]) => after[table] !== count)
      || Object.entries(after).some(([table, count]) => !(table in before) && count !== added[table])) throw new Error("project maintenance changed an unexpected row count");
    return 1;
  });
}

export function maintainProject(file, target, apply = false) {
  const info = lstatSync(file);
  const canonical = realpathSync(file), inside = (value, root) => value.startsWith(root + path.sep);
  const temporaryAlias = inside(path.resolve(file), path.resolve(tmpdir())) && inside(canonical, realpathSync(tmpdir()));
  if (!info.isFile() || info.nlink !== 1 || (canonical !== path.resolve(file) && !temporaryAlias)) throw new Error("project must be an ordinary unlinked file");
  if (![8, 9, 10, 11].includes(target)) throw new Error("unknown project maintenance target");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    const from = versionOf(db), rows = validateProject(db, from);
    if (from !== target - 1 && from !== target) throw new Error("wrong project maintenance step");
    if (apply && from !== target) {
      registerProjectMaintenanceChecks(db, target);
      try { db.exec(readFileSync(new URL(`./project-maintenance-v${target}.sql`, import.meta.url), "utf8")); }
      catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
    }
    return { from, target, version: versionOf(db), changed: apply && from !== target, rows };
  } finally { db.close(); }
}

function main(args) {
  const command = args.shift(), take = name => { const at = args.indexOf(name); if (at < 0) return undefined; return args.splice(at, 2)[1]; };
  const file = take("--database"), target = Number(take("--target")), window = args.includes("--maintenance-window");
  if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !file || args.length) throw new Error("list|apply --database <explicit file> --target 8|9|10|11 [--maintenance-window]");
  const resolved = path.resolve(file), inside = (value, root) => value === root || value.startsWith(root + path.sep);
  if (inside(resolved, path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs the approved maintenance window");
  if (command === "apply" && !inside(resolved, realpathSync(tmpdir())) && !window) throw new Error("apply outside a disposable Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintainProject(resolved, target, command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
