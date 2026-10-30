#!/usr/bin/env node
// Explicit offline creation of new declared stores, before moving Inbox bindings or backfilling Feed holds. No Host startup.
import fs from "node:fs";
import path from "node:path";
import { homedir, tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { applySqliteBaseline, describeSqliteSchema, describeSqliteBaseline, listSqliteObjects } from "@molis-ai/molis-work-storage";
import { openPluginProjectDatabase, inspectPluginProjectSchema } from "@molis-ai/molis-work-plugin-runtime";
import { inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { FEED_HOME_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { validateProject } from "./project-maintenance.mjs";

const inspector = { scratch: () => new DatabaseSync(":memory:"), objects: listSqliteObjects, shape: describeSqliteSchema };
const ordinary = file => { const info = fs.lstatSync(file); if (!info.isFile() || info.nlink !== 1) throw new Error("store must be an ordinary unlinked file"); };
function inboxState(db) {
  const declaration = inboxManifest.databases.project, expected = inspectPluginProjectSchema(declaration, inspector);
  const row = db.prepare("SELECT publisher_signature,store_name,version,tables_json FROM plugin_project_databases WHERE plugin_id=?").get(inboxManifest.plugin_id);
  const objects = new Set(listSqliteObjects(db).map(object => object.name)), present = expected.objects.filter(name => objects.has(name)).length;
  if (!row && present === 0) return { needs_create: true, tables_added: expected.tables.length, ledger_rows_added: 1 };
  if (!row || present !== expected.objects.length || row.publisher_signature !== inboxManifest.publisher.signature || row.store_name !== declaration.store_name
    || row.version !== declaration.version || !isDeepStrictEqual(JSON.parse(row.tables_json), expected.objects)) throw new Error("Inbox declared store and ledger do not match");
  return { needs_create: false, tables_added: 0, ledger_rows_added: 0 };
}
export function prepareInboxStore(file, apply = false) {
  ordinary(file); const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    const before = validateProject(db, 11), state = inboxState(db);
    if (apply) {
      openPluginProjectDatabase(db, { plugin_id: inboxManifest.plugin_id, publisher_signature: inboxManifest.publisher.signature, declaration: inboxManifest.databases.project }, inspector, { path: file });
      const after = validateProject(db, 11);
      if (Object.entries(before).some(([table, count]) => after[table] !== count + (table === "plugin_project_databases" ? state.ledger_rows_added : 0))
        || after.inbox_scene_bindings !== (before.inbox_scene_bindings ?? 0)) throw new Error("new Inbox store changed existing facts; STOP");
    }
    return { ...state, changed: apply && state.needs_create };
  } finally { db.close(); }
}
function validateFeed(db) {
  if (FEED_HOME_DATABASE.version !== 1 || db.prepare("PRAGMA user_version").get().user_version !== 1
    || !isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(FEED_HOME_DATABASE))
    || db.prepare("SELECT 1 FROM sqlite_schema WHERE type NOT IN ('table','index')").get()
    || db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Feed Home ledger version/structure/integrity mismatch");
}
export function prepareFeedStore(file, apply = false) {
  const existed = fs.existsSync(file); if (existed) ordinary(file);
  if (!existed && !apply) return { needs_create: true, version: 1, changed: false };
  if (!existed) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.closeSync(fs.openSync(file, "wx", 0o600)); }
  let db, succeeded = false;
  try {
    db = new DatabaseSync(file, { readOnly: !apply });
    if (!existed) applySqliteBaseline(db, file, FEED_HOME_DATABASE);
    validateFeed(db); succeeded = true;
    return { needs_create: !existed, version: 1, changed: !existed };
  } finally { db?.close(); if (!succeeded && !existed) fs.unlinkSync(file); }
}
function main(args) {
  const command = args.shift(), take = flag => { const at = args.indexOf(flag); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const project = take("--project"), feed = take("--feed-ledger"), window = args.includes("--maintenance-window"); if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || Boolean(project) === Boolean(feed) || args.length) throw new Error("list|apply --project <v11 copy> OR --feed-ledger <explicit file> [--maintenance-window]; one library per call");
  for (const given of [project, feed].filter(Boolean)) {
    const file = path.resolve(given); let ancestor = file;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    const canonical = path.join(fs.realpathSync(ancestor), path.relative(ancestor, file));
    const inside = root => canonical === root || canonical.startsWith(root + path.sep);
    if (inside(path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved maintenance window");
    if (command === "apply" && !inside(fs.realpathSync(tmpdir())) && !window) throw new Error("apply outside temporary Home needs --maintenance-window");
  }
  const report = {};
  if (project) report.inbox = prepareInboxStore(path.resolve(project), command === "apply");
  if (feed) report.feed = prepareFeedStore(path.resolve(feed), command === "apply");
  process.stdout.write(JSON.stringify(report) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
