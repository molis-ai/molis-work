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
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const BODY = /^molis-work-feed\/sha256\/[0-9a-f]{64}$/u;
const problem = message => Object.assign(new Error(message), { problem: true });

function open(file, readOnly) {
  if (!existsSync(file)) throw problem(`${file} does not exist`);
  return new DatabaseSync(file, { readOnly });
}
const hasTable = (db, name) => db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?").get(name).n === 1;

/** Every (source, body) a project holds: the bodies of its materials and the ones its pull receipts name. */
export function readProjectHoldings(projectFile) {
  const db = open(projectFile, true);
  try {
    const roots = db.prepare("SELECT project_id FROM project_root").all();
    if (roots.length !== 1) throw problem(`${projectFile} holds ${roots.length} projects, not one`);
    const projectId = roots[0].project_id, holds = new Set();
    const add = (sourceId, ref) => { if (typeof sourceId === "string" && typeof ref === "string" && BODY.test(ref)) holds.add(JSON.stringify([sourceId, ref])); };
    if (hasTable(db, "feed_materials")) {
      for (const row of db.prepare("SELECT i.source_id AS source_id, m.content_ref AS content_ref FROM feed_materials m JOIN feed_items i ON i.project_id = m.project_id AND i.item_id = m.item_id WHERE m.content_ref IS NOT NULL").all()) add(row.source_id, row.content_ref);
    }
    if (hasTable(db, "feed_source_runs")) {
      for (const row of db.prepare("SELECT source_id, receipt_json FROM feed_source_runs WHERE receipt_json IS NOT NULL").all()) {
        let receipt; try { receipt = JSON.parse(row.receipt_json); } catch { throw problem(`${projectFile}: a pull receipt of ${row.source_id} is not JSON`); }
        for (const ref of Array.isArray(receipt?.content_refs) ? receipt.content_refs : []) add(row.source_id, ref);
      }
    }
    return { projectId, holds: [...holds].map(value => JSON.parse(value)) };
  } finally { db.close(); }
}

function readLedger(ledgerFile, readOnly) {
  const db = open(ledgerFile, readOnly);
  if (!hasTable(db, "feed_content_holds") || !hasTable(db, "feed_content_meta")) { db.close(); throw problem(`${ledgerFile} has no ledger tables: start the Home once with the new build first`); }
  return db;
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
  const read = projectFiles.map(file => ({ file, ...readProjectHoldings(file) }));
  const ledger = readLedger(ledgerFile, false);
  try {
    ledger.exec("BEGIN IMMEDIATE");
    try {
      const insert = ledger.prepare("INSERT OR IGNORE INTO feed_content_holds (content_ref, project_id, source_id) VALUES (?, ?, ?)");
      let added = 0;
      for (const { projectId, holds } of read) for (const [sourceId, ref] of holds) added += Number(insert.run(ref, projectId, sourceId).changes);
      if (options.allProjects) ledger.prepare("INSERT OR IGNORE INTO feed_content_meta (key, value) VALUES ('complete_since', ?)").run(new Date().toISOString());
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
    if (error?.problem === true) return { code: 1, text: `problem, nothing written: ${error.message}` };
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outcome = run(process.argv.slice(2));
  (outcome.code === 0 ? process.stdout : process.stderr).write(`${outcome.text}\n`);
  process.exit(outcome.code);
}
