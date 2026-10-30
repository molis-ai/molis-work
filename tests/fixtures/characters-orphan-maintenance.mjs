#!/usr/bin/env node
// CHR-1 orphan cleanup. This offline tool is never imported by runtime readers.
import { lstatSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateProject } from "./project-maintenance.mjs";

const CHARACTER = "io.molis.work.characters";
const installs = "SELECT install_id FROM plugin_runtime_installs WHERE json_extract(record_json,'$.plugin_id')=?";
const scoped = [
  ["plugin_private_values", `install_id IN (${installs})`],
  ["plugin_events", `source_install_id IN (${installs})`],
  ["plugin_event_cursors", `subscriber_install_id IN (${installs})`],
  ["plugin_event_resolutions", `json_extract(record_json,'$.subscriber_install_id') IN (${installs})`],
  ["plugin_notifications", `sender_install_id IN (${installs})`],
  ["plugin_runtime_release_artifacts", "plugin_id=?"],
  ["plugin_runtime_installs", "json_extract(record_json,'$.plugin_id')=?"],
];
const blockers = [
  ["schedule_action_bindings", `install_id IN (${installs})`],
  ["plugin_input_groups", "plugin_id=?"],
  ["plugin_port_artifact_bindings", "target_plugin_id=?"],
  ["plugin_port_bindings", "? IN (target_plugin_id,source_plugin_id)"],
  ["plugin_port_outputs", "plugin_id=?"],
  ["plugin_project_databases", "plugin_id=?"],
];
const exists = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table));
function plan(db) {
  for (const table of ["plugin_runtime_installs", "plugin_event_resolutions"]) {
    if (db.prepare(`SELECT count(*) AS n FROM ${table} WHERE NOT json_valid(record_json)`).get().n) throw new Error("invalid runtime metadata JSON; no cleanup");
  }
  const count = pairs => Object.fromEntries(pairs.filter(([table]) => exists(db, table)).map(([table, predicate]) =>
    [table, Number(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${predicate}`).get(CHARACTER).n)]));
  return { remove: count(scoped), blocked: count(blockers) };
}

export function maintainCharactersOrphans(file, apply = false) {
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1) throw new Error("project must be an ordinary unlinked file");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    if (apply) db.exec("BEGIN IMMEDIATE");
    const version = Number(db.prepare("PRAGMA user_version").get().user_version), before = validateProject(db, apply ? 11 : version), proposed = plan(db);
    if (!apply) return { ...proposed, changed: false };
    if (Object.values(proposed.blocked).some(count => count !== 0)) throw new Error("Characters still has bindings or a database; report the blocker for a separate decision");
    for (const [table, predicate] of scoped) {
      const deleted = Number(db.prepare(`DELETE FROM ${table} WHERE ${predicate}`).run(CHARACTER).changes);
      if (deleted !== proposed.remove[table]) throw new Error("orphan count differs from preflight; no cleanup committed");
    }
    const after = validateProject(db, 11);
    if (Object.entries(before).some(([table, count]) => after[table] !== count - (proposed.remove[table] ?? 0))) throw new Error("cleanup changed unrelated row counts");
    db.exec("COMMIT");
    return { ...proposed, changed: Object.values(proposed.remove).some(count => count !== 0) };
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}

function main(args) {
  const command = args.shift(), at = args.indexOf("--database"), given = at < 0 ? undefined : args.splice(at, 2)[1];
  const window = args.includes("--maintenance-window"); if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !given || args.length) throw new Error("list|apply --database <explicit copy file> [--maintenance-window]");
  if (!lstatSync(given).isFile()) throw new Error("project must be an ordinary file");
  const file = realpathSync(given), inside = root => file === root || file.startsWith(root + path.sep);
  if (inside(path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved maintenance window");
  if (command === "apply" && !inside(realpathSync(tmpdir())) && !window) throw new Error("apply outside temporary Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintainCharactersOrphans(file, command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
