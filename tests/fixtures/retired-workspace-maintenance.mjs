#!/usr/bin/env node
// Retired Workspace only, coordinator 6517042142. Explicit four-category decisions, before project v9 -> v10 trust.
import { lstatSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateProject } from "./project-maintenance.mjs";
const PLUGIN = "io.molis.work.workspace";
const installs = "SELECT install_id FROM plugin_runtime_installs WHERE json_extract(record_json,'$.plugin_id')=?";
const categories = {
  bindings: ["plugin_port_bindings", "? IN (source_plugin_id,target_plugin_id)"],
  outputs: ["plugin_port_outputs", "plugin_id=?"],
  "private-values": ["plugin_private_values", `install_id IN (${installs})`],
  installs: ["plugin_runtime_installs", "json_extract(record_json,'$.plugin_id')=?"],
};
const related = [
  ["plugin_runtime_release_artifacts", "plugin_id=?"], ["plugin_events", `source_install_id IN (${installs})`],
  ["plugin_event_cursors", `subscriber_install_id IN (${installs})`],
  ["plugin_event_resolutions", `json_extract(record_json,'$.subscriber_install_id') IN (${installs})`],
  ["schedule_action_bindings", `install_id IN (${installs})`], ["plugin_notifications", `sender_install_id IN (${installs})`],
  ["plugin_input_groups", "plugin_id=?"], ["plugin_port_artifact_bindings", "target_plugin_id=?"], ["plugin_project_databases", "plugin_id=?"],
];
const hasTable = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table));
function counts(db, pairs) {
  return Object.fromEntries(pairs.filter(([, [table]]) => hasTable(db, table))
    .map(([name, [table, predicate]]) => [name, Number(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${predicate}`).get(PLUGIN).n)]));
}
function plan(db) {
  if (db.prepare("SELECT 1 FROM plugin_runtime_installs WHERE NOT json_valid(record_json)").get()) throw new Error("invalid installation metadata; refuse");
  return { rows: counts(db, Object.entries(categories)), blockers: counts(db, related.map(([table, predicate]) => [table, [table, predicate]])) };
}
export function maintainRetiredWorkspace(file, choices) {
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1) throw new Error("project must be an ordinary unlinked file");
  if (choices && (Object.keys(choices).length !== 4 || Object.keys(categories).some(key => !["delete", "keep"].includes(choices[key])))) throw new Error("all four delete/keep choices are required");
  const db = new DatabaseSync(file, { readOnly: !choices });
  try {
    if (choices) db.exec("BEGIN IMMEDIATE");
    const version = Number(db.prepare("PRAGMA user_version").get().user_version), before = validateProject(db, version), proposed = plan(db);
    if (!choices) return { version, ...proposed, changed: false };
    if (version !== 9) throw new Error("retired Workspace cleanup requires project 9, before trust assigns owners at 10");
    if (Object.values(proposed.blockers).some(count => count !== 0)) throw new Error("other retired Workspace records require a separate decision");
    const deleted = {};
    // Delete the installation last; its IDs select private values without ever reading those values.
    for (const [name, [table, predicate]] of Object.entries(categories)) {
      deleted[name] = choices[name] === "delete" ? Number(db.prepare(`DELETE FROM ${table} WHERE ${predicate}`).run(PLUGIN).changes) : 0;
      if (deleted[name] !== (choices[name] === "delete" ? proposed.rows[name] : 0)) throw new Error("Workspace row count differs from preflight");
    }
    const after = validateProject(db, 9), allowed = Object.fromEntries(Object.entries(categories).map(([name, [table]]) => [table, deleted[name]]));
    if (Object.entries(before).some(([table, count]) => after[table] !== count - (allowed[table] ?? 0))) throw new Error("Workspace cleanup changed unrelated row counts");
    db.exec("COMMIT");
    return { version, ...proposed, deleted, retired_installs_remaining: proposed.rows.installs - deleted.installs, changed: Object.values(deleted).some(count => count !== 0) };
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
function main(args) {
  const command = args.shift(), take = key => { const at = args.indexOf(key); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const file = take("--database"), choices = command === "apply" ? Object.fromEntries(Object.keys(categories).map(key => [key, take("--" + key)])) : undefined;
  const window = args.includes("--maintenance-window"); if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !file || args.length) throw new Error("list|apply --database <copy> [--installs delete|keep --bindings delete|keep --outputs delete|keep --private-values delete|keep] [--maintenance-window]");
  const canonical = realpathSync(file), inside = root => canonical === root || canonical.startsWith(root + path.sep);
  if (inside(path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved window");
  if (command === "apply" && !inside(realpathSync(tmpdir())) && !window) throw new Error("apply outside a disposable Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintainRetiredWorkspace(canonical, choices)) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
