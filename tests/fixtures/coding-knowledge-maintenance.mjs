#!/usr/bin/env node
// Finite offline adoption rehearsal. Remove with its tests after the approved private stores have been adopted.
// list|apply --home <stopped copy> [--project-database <file> --publisher <original>] [--knowledge] --backup <new directory>
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { DatabaseSync, backup } from "node:sqlite";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { CODING_PLUGIN_ID, CODING_PROJECT_DATABASE, codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { knowledgeManageActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { inspectExistingPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { acquireStorageOwner, assertStorageOwner, inspectExistingSqlitePath, inspectExistingStoragePath, openExistingBaselineSqlite,
  KNOWLEDGE_CARDS_BASELINE, homeSqlitePath, describeSqliteSchema, listSqliteObjects } from "@molis-ai/molis-work-storage";

const within = (root, file) => { const relative = path.relative(root, file); return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
const invalid = message => { throw new Error(message); };
const inspector = { scratch: () => new DatabaseSync(":memory:"), objects: listSqliteObjects, shape: describeSqliteSchema };
const version = db => Number(db.prepare("PRAGMA user_version").get().user_version);
const cardValid = compileActionSchema(knowledgeManageActions.cards.action.output_schema.properties.cards.items);
const archiveValid = compileActionSchema(codingRouteActions["coding.archive-preview"].definition.action.output_schema);
const restoreValid = compileActionSchema(codingRouteActions["coding.unarchive-preview"].definition.action.output_schema);

function codingRows(db, from) {
  if (from === 1) return [];
  return db.prepare("SELECT project_id, session_id, lifecycle_json FROM coding_sessions WHERE lifecycle_json IS NOT NULL ORDER BY project_id, session_id").all().map(row => {
    const original = JSON.parse(row.lifecycle_json);
    const fields = from === 2 ? ["archived", "request", "at", "completed"] : ["archived", "request", "at", "completed", "content_revision"];
    if (!original || Object.keys(original).sort().join() !== fields.sort().join() || typeof original.archived !== "boolean"
      || typeof original.completed !== "boolean" || typeof original.at !== "string" || !Number.isFinite(Date.parse(original.at))
      || !["local", "runtime"].includes(original.request?.mode) || original.request.observed?.session_id !== row.session_id
      || !(original.archived ? archiveValid({ archive_decision: original.request }) : restoreValid({ unarchive_decision: original.request }))
      || from === 3 && (typeof original.content_revision !== "string" || !original.content_revision)) invalid("Coding lifecycle original is invalid");
    return { ...row, next: from === 2 ? JSON.stringify({ ...original, content_revision: null }) : row.lifecycle_json };
  });
}

function knowledgeRows(db, from) {
  return db.prepare("SELECT card_id, project_id, kind, object_id, body FROM knowledge_cards ORDER BY card_id").all().map(row => {
    const original = JSON.parse(row.body);
    if (!cardValid(original) || original.project_id !== row.project_id || original.subject.kind !== row.kind || original.subject.id !== row.object_id
      || original.adoption || from === 1 && original.retention !== undefined) invalid("Knowledge card original is invalid");
    return { ...row, next: from === 1 ? JSON.stringify({ ...original, retention: { generation: null, restoration_operation_id: null } }) : row.body };
  });
}

function inspectCoding(file, publisher) {
  if (typeof publisher !== "string" || !publisher) invalid("The selected original publisher is required");
  const uri = pathToFileURL(file); uri.searchParams.set("mode", "rw");
  const db = new DatabaseSync(uri.href);
  try {
    if (version(db) !== 10) invalid("Finish the original project v8/v9/v10 maintenance first");
    const row = db.prepare("SELECT version FROM plugin_project_databases WHERE plugin_id = ?").get(CODING_PLUGIN_ID);
    const from = Number(row?.version);
    if (![1, 2, 3, 4].includes(from)) invalid("Unsupported Coding private version");
    const declaration = { ...CODING_PROJECT_DATABASE, version: from,
      schema: from === 1 ? CODING_PROJECT_DATABASE.schema.replace(/\s*lifecycle_json TEXT,/, "") : CODING_PROJECT_DATABASE.schema };
    inspectExistingPluginProjectDatabase(db, { plugin_id: CODING_PLUGIN_ID, publisher_signature: publisher, declaration }, inspector, { path: file });
    const rows = from === 4 ? [] : codingRows(db, from);
    return { file, db, kind: "coding", from, to: 4, rows, publisher };
  } catch (error) { db.close(); throw error; }
}

function inspectKnowledge(file) {
  const initial = new DatabaseSync(file, { readOnly: true });
  let from;
  try { from = version(initial); } finally { initial.close(); }
  if (![1, 2, 3].includes(from)) invalid("Unsupported Knowledge private version");
  const db = openExistingBaselineSqlite(file, { ...KNOWLEDGE_CARDS_BASELINE, version: from });
  try { return { file, db, kind: "knowledge", from, to: 3, rows: from === 3 ? [] : knowledgeRows(db, from) }; }
  catch (error) { db.close(); throw error; }
}

/** No automatic discovery or runtime upgrade: the operator selects exact existing files on a stopped copy. */
export async function maintainCodingKnowledge(mode, options) {
  if (!["list", "apply"].includes(mode) || typeof options.home !== "string") invalid("Explicit list/apply and offline Home required");
  const home = path.resolve(options.home), root = inspectExistingStoragePath(home, "directory");
  if (!root.exists) invalid("Home does not exist");
  const actual = [path.join(homedir(), ".molis-work"), process.env.MOLIS_WORK_HOME].filter(Boolean).map(file => path.resolve(file));
  if (actual.includes(home)) invalid("This rehearsal accepts an offline copy, not the current Home");
  const selected = [];
  if (options.projectDatabase) selected.push({ kind: "coding", file: path.resolve(options.projectDatabase) });
  if (options.knowledge) selected.push({ kind: "knowledge", file: homeSqlitePath(home, "knowledge") });
  if (!selected.length) invalid("Select at least one original private store");
  for (const entry of selected) {
    if (!within(home, entry.file)) invalid("Selected database is outside this Home copy");
    entry.path = inspectExistingSqlitePath(entry.file);
    if (!entry.path.exists) invalid("Selected database is absent");
  }
  let owner, failed, backupDirectory, backupParent, backupPath;
  const check = () => {
    options.signal?.throwIfAborted(); root.assertCurrent();
    if (owner) assertStorageOwner(path.join(home, "agent-runtime"), owner);
    backupParent?.assertCurrent(); backupPath?.assertCurrent();
    for (const entry of selected) entry.path.assertCurrent();
  };
  const opened = [], completed = [];
  try {
    check();
    if (mode === "apply") owner = acquireStorageOwner(path.join(home, "agent-runtime"));
    for (const entry of selected) {
      check(); opened.push(entry.kind === "coding" ? inspectCoding(entry.file, options.publisher) : inspectKnowledge(entry.file));
    }
    const pending = opened.filter(entry => entry.from !== entry.to);
    if (mode === "apply" && pending.length) {
      if (typeof options.backupDirectory !== "string") invalid("A new backup directory outside Home is required");
      backupDirectory = path.resolve(options.backupDirectory);
      if (backupDirectory === home || within(home, backupDirectory) || within(backupDirectory, home)) invalid("Backup must be outside Home");
      backupParent = inspectExistingStoragePath(path.dirname(backupDirectory), "directory");
      if (!backupParent.exists) invalid("Backup parent is absent");
      check();
      fs.mkdirSync(backupDirectory, { mode: 0o700 });
      backupPath = inspectExistingStoragePath(backupDirectory, "directory");
      for (const entry of pending) { check(); await backup(entry.db, path.join(backupDirectory, entry.kind + ".sqlite")); check(); }
      for (const entry of pending) {
        const db = entry.db;
        check(); db.exec("BEGIN IMMEDIATE");
        try {
          check();
          if (entry.kind === "coding") {
            const current = db.prepare("SELECT version, publisher_signature FROM plugin_project_databases WHERE plugin_id = ?").get(CODING_PLUGIN_ID);
            if (Number(current?.version) !== entry.from || current.publisher_signature !== entry.publisher) invalid("Coding selection changed");
            if (JSON.stringify(codingRows(db, entry.from)) !== JSON.stringify(entry.rows)) invalid("Coding originals changed");
            if (entry.from === 1) db.exec("ALTER TABLE coding_sessions ADD COLUMN lifecycle_json TEXT");
            for (const row of entry.rows) db.prepare("UPDATE coding_sessions SET lifecycle_json = ? WHERE project_id = ? AND session_id = ?").run(row.next, row.project_id, row.session_id);
            db.prepare("UPDATE plugin_project_databases SET version = 4 WHERE plugin_id = ?").run(CODING_PLUGIN_ID);
            inspectExistingPluginProjectDatabase(db, { plugin_id: CODING_PLUGIN_ID, publisher_signature: entry.publisher, declaration: CODING_PROJECT_DATABASE }, inspector, { path: entry.file });
          } else {
            if (version(db) !== entry.from || JSON.stringify(knowledgeRows(db, entry.from)) !== JSON.stringify(entry.rows)) invalid("Knowledge originals changed");
            for (const row of entry.rows) db.prepare("UPDATE knowledge_cards SET body = ? WHERE card_id = ?").run(row.next, row.card_id);
            db.exec("PRAGMA user_version = 3");
          }
          check(); db.exec("COMMIT"); completed.push(entry.kind);
        } catch (error) {
          try { db.exec("ROLLBACK"); } catch (rollback) { throw new AggregateError([error, rollback], "Commit or rollback outcome requires reconciliation"); }
          throw error;
        }
      }
    }
  } catch (error) { failed = error; }
  let closeFailed = false;
  for (const entry of opened) {
    try { entry.db.close(); } catch (error) { closeFailed = true; failed = failed ? new AggregateError([failed, error], "Maintenance and close failed") : error; }
  }
  if (!closeFailed) {
    try { owner?.release(); } catch (error) { failed = failed ? new AggregateError([failed, error], "Maintenance and owner release failed") : error; }
  }
  if (failed) throw Object.assign(new Error("Private adoption did not complete; keep writers stopped and inspect or restore the selected backups", { cause: failed }), { completed, backupDirectory });
  return { stores: opened.map(({ kind, from, to }) => ({ kind, from, to })), completed, ...(backupDirectory ? { backupDirectory } : {}) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, ...args] = process.argv.slice(2), value = flag => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
  try { process.stdout.write(JSON.stringify(await maintainCodingKnowledge(mode, { home: value("--home"), projectDatabase: value("--project-database"),
    publisher: value("--publisher"), knowledge: args.includes("--knowledge"), backupDirectory: value("--backup") })) + "\n"); }
  catch (error) { process.stderr.write(`${error.message} ${JSON.stringify({ completed: error.completed, backupDirectory: error.backupDirectory })}\n`); process.exitCode = 1; }
}
