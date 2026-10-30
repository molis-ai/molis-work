#!/usr/bin/env node
// Feed content ledger backfill (FI-4, specs/repository-anti-corruption/slices/feed-inbox-home-reference-ledger.md §3.4, RAC-495): the Home
// keeps a ledger of which source of which project holds which evidence body (the library `feed-content` of Feed's Home half), and a body is
// released only when the ledger says nobody holds it. A Home that already has bodies starts with an empty ledger, which does not mean nobody
// holds them, so this reads every project once and writes what it finds, then marks the ledger complete. Until it has run, Feed releases
// nothing (a body is kept, never deleted by mistake). Delete this file and tests/feed-content-ledger-maintenance.test.ts together once the
// Homes in use have been done (they stay in Git history).
//
//   node tests/fixtures/feed-content-ledger-maintenance.mjs list --ledger <feed-content.sqlite> --project <project.sqlite> [--project ...] [--json]
//       READ ONLY. Says, per project, how many bodies its sources hold and how many of those the ledger does not have yet.
//   node tests/fixtures/feed-content-ledger-maintenance.mjs backfill --ledger <feed-content.sqlite> --project <project.sqlite> [--project ...] [--all-projects] [--json]
//       Writes the holds into the ledger (only the ledger; the projects are opened read-only). Running it again changes nothing. With
//       --all-projects, which says the listed projects are every project of the Home, it also marks the ledger complete.
//   Run it on copies first; on a real Home only with the Host stopped and the window approved, after the project libraries were opened once
//   with the new build (the ledger library is made then). Exit code: 0 done or nothing to do, 1 a problem (nothing was written), 2 a bad command.
import { lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { describeSqliteBaseline, describeSqliteSchema } from "@molis-ai/molis-work-storage";
import { FEED_HOME_DATABASE } from "@molis-ai/molis-work-plugin-feed";
import { validateProject } from "./project-maintenance.mjs";

const BODY = /^molis-work-feed\/sha256\/[0-9a-f]{64}$/u;
const problem = message => Object.assign(new Error(message), { problem: true });

function open(file, readOnly) {
  if (!lstatSync(file).isFile() || lstatSync(file).nlink !== 1) throw problem("library must be an ordinary unlinked file");
  return new DatabaseSync(file, { readOnly });
}
const hasTable = (db, name) => db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(name).n === 1;

/** Every (source, body) a project holds: the bodies of its materials and the ones its pull receipts name. */
export function readProjectHoldings(projectFile, applying = false) {
  const db = open(projectFile, true);
  try {
    const version = Number(db.prepare("PRAGMA user_version").get().user_version);
    validateProject(db, applying ? 11 : version);
    const roots = db.prepare(version === 7 ? "SELECT project_id FROM boards" : "SELECT project_id FROM project_root").all();
    if (roots.length !== 1) throw problem(`${projectFile} holds ${roots.length} projects, not one`);
    const projectId = roots[0].project_id, holds = new Set();
    const add = (sourceId, ref) => { if (typeof sourceId === "string" && typeof ref === "string" && BODY.test(ref)) holds.add(JSON.stringify([sourceId, ref])); };
    if (hasTable(db, "feed_materials")) {
      for (const row of db.prepare("SELECT i.source_id AS source_id, m.content_ref AS content_ref FROM feed_materials m JOIN feed_items i ON i.project_id = m.project_id AND i.item_id = m.item_id WHERE m.content_ref IS NOT NULL").all()) add(row.source_id, row.content_ref);
    }
    if (hasTable(db, "feed_source_runs")) {
      if (db.prepare("SELECT 1 FROM feed_source_runs WHERE receipt_json IS NOT NULL AND NOT json_valid(receipt_json)").get()) throw problem("a pull receipt is not valid JSON");
      // Only content-reference metadata leaves SQLite; other receipt fields and material bodies are never read.
      for (const row of db.prepare("SELECT source_id, refs.value AS content_ref FROM feed_source_runs,json_each(receipt_json,'$.content_refs') AS refs WHERE receipt_json IS NOT NULL AND json_type(receipt_json,'$.content_refs')='array'").all()) add(row.source_id, row.content_ref);
    }
    return { projectId, holds: [...holds].map(value => JSON.parse(value)) };
  } finally { db.close(); }
}

function readLedger(ledgerFile, readOnly) {
  const db = open(ledgerFile, readOnly);
  try { validateLedger(db); } catch (error) { db.close(); throw error; }
  return db;
}

function validateLedger(db) {
  if (FEED_HOME_DATABASE.version !== 1 || db.prepare("PRAGMA user_version").get().user_version !== 1
    || !isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(FEED_HOME_DATABASE))
    || db.prepare("SELECT 1 FROM sqlite_schema WHERE type NOT IN ('table','index')").get()) throw problem("Feed ledger complete version/structure mismatch");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw problem("Feed ledger integrity check failed");
  return { holds: Number(db.prepare("SELECT count(*) AS n FROM feed_content_holds").get().n), meta: Number(db.prepare("SELECT count(*) AS n FROM feed_content_meta").get().n) };
}

export function listLedger(ledgerFile, projectFiles) {
  const ledger = readLedger(ledgerFile, true);
  try {
    const marked = ledger.prepare("SELECT value FROM feed_content_meta WHERE key = 'complete_since'").get() ?? null;
    const projects = projectFiles.map(file => {
      const { projectId, holds } = readProjectHoldings(file);
      const missing = holds.filter(([sourceId, ref]) => ledger.prepare("SELECT 1 AS present FROM feed_content_holds WHERE project_id = ? AND source_id = ? AND content_ref = ?").get(projectId, sourceId, ref) === undefined);
      return { project_id: projectId, holds: holds.length, missing: missing.length };
    });
    return { complete_since: marked?.value ?? null, projects };
  } finally { ledger.close(); }
}

export function backfillLedger(ledgerFile, projectFiles, options = {}) {
  const read = projectFiles.map(file => ({ file, ...readProjectHoldings(file, true) }));
  if (new Set(read.map(item => item.projectId)).size !== read.length) throw problem("duplicate project identity; completeness cannot be confirmed");
  const ledger = readLedger(ledgerFile, false);
  try {
    ledger.exec("BEGIN IMMEDIATE");
    try {
      const before = validateLedger(ledger), markedBefore = Boolean(ledger.prepare("SELECT 1 FROM feed_content_meta WHERE key='complete_since'").get());
      const insert = ledger.prepare("INSERT OR IGNORE INTO feed_content_holds (content_ref, project_id, source_id) VALUES (?, ?, ?)");
      let added = 0;
      for (const { projectId, holds } of read) for (const [sourceId, ref] of holds) added += Number(insert.run(ref, projectId, sourceId).changes);
      if (options.allProjects) ledger.prepare("INSERT OR IGNORE INTO feed_content_meta (key, value) VALUES ('complete_since', ?)").run(new Date().toISOString());
      const after = validateLedger(ledger);
      if (after.holds !== before.holds + added || after.meta !== before.meta + (options.allProjects && !markedBefore ? 1 : 0)) throw problem("Feed ledger row counts changed unexpectedly");
      ledger.exec("COMMIT");
      return { projects: read.length, holds_added: added, marked: options.allProjects === true };
    } catch (error) { ledger.exec("ROLLBACK"); throw error; }
  } finally { ledger.close(); }
}

function run(argv) {
  const [mode, ...rest] = argv;
  const values = name => rest.flatMap((item, at) => item === name && rest[at + 1] ? [path.resolve(rest[at + 1])] : []);
  const [ledgerFile] = values("--ledger"), projects = values("--project");
  if (!["list", "backfill"].includes(mode) || !ledgerFile || projects.length === 0) {
    return { code: 2, text: "usage: feed-content-ledger-maintenance.mjs list|backfill --ledger <feed-content.sqlite> --project <project.sqlite> [--project ...] [--all-projects] [--json]" };
  }
  try {
    const report = mode === "list" ? listLedger(ledgerFile, projects) : backfillLedger(ledgerFile, projects, { allProjects: rest.includes("--all-projects") });
    const text = rest.includes("--json") ? JSON.stringify(report, null, 2)
      : mode === "list" ? [`ledger ${report.complete_since ? "complete since " + report.complete_since : "not yet complete"}`, ...report.projects.map(item => `${item.project_id}: ${item.holds} held, ${item.missing} not in the ledger`)].join("\n")
        : `${report.projects} project(s) read, ${report.holds_added} hold(s) added${report.marked ? ", ledger marked complete" : ""}`;
    return { code: 0, text };
  } catch (error) {
    return { code: 1, text: `problem, nothing written: ${error.message}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outcome = run(process.argv.slice(2));
  (outcome.code === 0 ? process.stdout : process.stderr).write(`${outcome.text}\n`);
  process.exit(outcome.code);
}
