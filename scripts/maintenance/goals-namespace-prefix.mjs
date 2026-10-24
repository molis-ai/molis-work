#!/usr/bin/env node
// Maintenance: the names Goals wrote into a project library's shared tables get the plugin's namespace (PG-094 S9-2, RAC-286..).
//
//   node scripts/maintenance/goals-namespace-prefix.mjs list    <project.sqlite>   read only; says what a rewrite would do and what stops it
//   node scripts/maintenance/goals-namespace-prefix.mjs rewrite <project.sqlite>   backs the library up beside itself, then renames in one transaction
//
// Exit 0: nothing to do, or done. 1: a conflict, so nothing was written (`list` prints it too). 2: the arguments, or the library, could not be used.
// Stop the service that holds the Home (4207/4208) first: a library that is busy is refused, never waited for.
//
// It also records Goals' store at version 2 in the library's ledger (`plugin_project_databases`), in the same transaction: a library
// still at 1 is refused for Goals alone (PLIB-14), so a build that expects the prefix never reads one that has not been renamed.
//
// Not run by anything: not at start, not by the installer. A person runs it, in the window the user confirmed, on a Home they chose.
// The code reads only the current names (CONTRACT-CHANGES.md), so a library is renamed before the build that expects it opens it.
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const NAMESPACE = "io.molis.work.goals.";
/** Goals' own tables are recorded in the library's ledger at a store version; 2 is the one whose names carry the namespace. */
export const GOALS_PLUGIN_ID = "io.molis.work.goals";
export const STORE_VERSION_BEFORE = 1;
export const STORE_VERSION_AFTER = 2;

/** The object types Goals and Governance write into `events`: the discriminator for "this event is Goals'". */
export const GOALS_OBJECT_TYPES = [
  "board", "goal", "relation", "project_guidance", "goal_work_event", "goal_event_config", "policy_binding", "planning_method",
  "goal_tree_proposal", "goal_tree_proposal_item",
  // Written by builds before the event workflow and still in the history of a library that old (`policy.added_from_tree_proposal`,
  // found in the four libraries of tests/fixtures/goal-event-history, which were made from real ones).
  "policy",
];
/** The event types Goals writes start with one of these; a Goals object with a type outside them is a name nobody listed. */
export const GOALS_EVENT_FAMILIES = [
  "goal.", "relation.", "board.", "planning.", "policy.", "project.guidance_", "goal_tree_proposal.",
  // The contract workflow Goals had before the event workflow (`contract.downstream_revalidation_required` on a goal object, 65 rows
  // in the 18 libraries of the real Home that a read-only trial on a disposable copy listed on 2026-10-24).
  "contract.",
];
/**
 * Another owner's events that sit on an object type Goals also uses: Feed's migration wrote `feed.relay_ownership_migrated` against the
 * `board` object (3 rows in that same trial). They keep their names, and are reported as outside rather than stopping the run.
 */
export const FOREIGN_EVENT_FAMILIES = ["feed."];
/** The edges Goals writes into the context ledger (`relation_type`); their keys are renamed with them. */
export const GOALS_EDGE_TYPES = ["goal.input", "goal.output", "goal.input.proposal", "goal.output.proposal"];

const own = value => typeof value === "string" && value.startsWith(NAMESPACE);
const sha = value => createHash("sha256").update(value).digest("hex");

/** Per table: the columns that carry a name, the key that says which rows are Goals', and the columns nobody may touch. */
function plan(db) {
  const events = db.prepare("SELECT seq, type, object_type FROM events").all();
  const eventChanges = []; const conflicts = []; const outside = new Map();
  for (const row of events) {
    const goalsObject = GOALS_OBJECT_TYPES.includes(row.object_type) || own(row.object_type);
    const goalsType = GOALS_EVENT_FAMILIES.some(prefix => row.type.startsWith(prefix)) || own(row.type);
    if (FOREIGN_EVENT_FAMILIES.some(prefix => row.type.startsWith(prefix))) {
      outside.set(`events ${row.type} / ${row.object_type}`, (outside.get(`events ${row.type} / ${row.object_type}`) ?? 0) + 1);
      continue;
    }
    if (!goalsObject) {
      if (goalsType && !own(row.type)) conflicts.push(`events seq ${row.seq}: type ${row.type} looks like Goals' but its object type ${row.object_type} is not`);
      else outside.set(`events ${row.type} / ${row.object_type}`, (outside.get(`events ${row.type} / ${row.object_type}`) ?? 0) + 1);
      continue;
    }
    const typeOwn = own(row.type); const objectOwn = own(row.object_type);
    if (typeOwn !== objectOwn) { conflicts.push(`events seq ${row.seq}: type ${row.type} and object type ${row.object_type} are not both ${typeOwn ? "renamed" : "old"}`); continue; }
    if (typeOwn) continue;
    if (!goalsType) { conflicts.push(`events seq ${row.seq}: type ${row.type} of object ${row.object_type} is in no list of Goals' names`); continue; }
    eventChanges.push({ seq: row.seq, type: NAMESPACE + row.type, object_type: NAMESPACE + row.object_type, from: `${row.type} / ${row.object_type}` });
  }

  // Only Goals and Governance write idempotency records (every other owner keeps its own table), so every old name is Goals'.
  const records = db.prepare("SELECT project_id, actor_id, operation, idempotency_key FROM idempotency_records").all();
  const taken = new Set(records.map(row => JSON.stringify([row.project_id, row.actor_id, row.operation, row.idempotency_key])));
  const recordChanges = [];
  for (const row of records) {
    if (own(row.operation)) continue;
    const next = JSON.stringify([row.project_id, row.actor_id, NAMESPACE + row.operation, row.idempotency_key]);
    if (taken.has(next)) { conflicts.push(`idempotency_records ${row.project_id}/${row.actor_id}/${row.operation}/${row.idempotency_key}: the new name already exists`); continue; }
    recordChanges.push({ ...row, operation: NAMESPACE + row.operation, from: row.operation });
  }

  const edges = db.prepare("SELECT scope_kind, scope_id, edge_key, revision, relation_type FROM context_edges").all();
  const keys = new Map(); // scope + key → { own, old, types } over all revisions
  for (const row of edges) {
    const id = JSON.stringify([row.scope_kind, row.scope_id, row.edge_key.startsWith(NAMESPACE) ? row.edge_key.slice(NAMESPACE.length) : row.edge_key]);
    const entry = keys.get(id) ?? { own: 0, old: 0, goals: false, row };
    if (own(row.edge_key)) entry.own += 1; else entry.old += 1;
    if (GOALS_EDGE_TYPES.includes(row.relation_type)) entry.goals = true;
    keys.set(id, entry);
  }
  const edgeChanges = [];
  for (const [id, entry] of keys) {
    const [scopeKind, scopeId, key] = JSON.parse(id);
    if (!entry.goals) { if (!entry.own) outside.set(`context_edges ${key.split(":")[0]}`, (outside.get(`context_edges ${key.split(":")[0]}`) ?? 0) + entry.old); continue; }
    if (entry.own && entry.old) { conflicts.push(`context_edges ${scopeKind}/${scopeId}/${key}: some revisions are renamed and some are not`); continue; }
    if (entry.own) continue;
    edgeChanges.push({ scope_kind: scopeKind, scope_id: scopeId, key, from: key });
  }

  const bindings = db.prepare("SELECT binding_id, source_edge_key FROM input_bindings WHERE source_edge_key IS NOT NULL").all()
    .filter(row => !own(row.source_edge_key));

  // A column of Goals' tables that holds one of the old names and that nothing above renames is a name the code writes in a place
  // this list does not know: the rename stops there rather than leave half of a name behind.
  const ledger = db.prepare("SELECT version FROM plugin_project_databases WHERE plugin_id = ?").get(GOALS_PLUGIN_ID);
  const version = ledger ? Number(ledger.version) : null;
  const pending = eventChanges.length + recordChanges.length + edgeChanges.length + bindings.length;
  if (version === null && pending) conflicts.push(`plugin_project_databases: no row for ${GOALS_PLUGIN_ID}, but there are ${pending} name(s) to rename`);
  else if (version === STORE_VERSION_AFTER && pending) conflicts.push(`plugin_project_databases: ${GOALS_PLUGIN_ID} is recorded at ${version}, yet ${pending} name(s) are still without the prefix`);
  else if (version !== null && version !== STORE_VERSION_BEFORE && version !== STORE_VERSION_AFTER) conflicts.push(`plugin_project_databases: ${GOALS_PLUGIN_ID} is recorded at ${version}, which this script does not know`);
  const stray = strayNames(db, new Set([
    ...eventChanges.map(change => change.from.split(" / ")[0]),
    ...recordChanges.map(change => change.from),
  ]));
  for (const hit of stray) conflicts.push(hit);
  return { eventChanges, recordChanges, edgeChanges, bindings, version, conflicts, outside: [...outside].map(([name, count]) => ({ name, count })) };
}

const PLATFORM_TABLES = new Set(["events", "idempotency_records", "context_edges", "input_bindings", "project_root", "inbox_entries", "attention_events", "plugin_project_databases"]);

function strayNames(db, names) {
  const hits = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  for (const table of tables) {
    if (PLATFORM_TABLES.has(table)) continue;
    for (const column of db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all()) {
      if (!/CHAR|CLOB|TEXT/i.test(column.type) && column.type !== "") continue;
      const found = db.prepare(`SELECT ${JSON.stringify(column.name)} AS value, COUNT(*) AS n FROM ${JSON.stringify(table)} GROUP BY 1`).all()
        .filter(row => typeof row.value === "string" && (names.has(row.value) || /^goal\.(input|output)(\.proposal)?:/.test(row.value)));
      for (const row of found) hits.push(`${table}.${column.name}: ${row.n} row(s) hold ${row.value}, which this script does not rename`);
    }
  }
  return hits;
}

export function listGoalsNames(db) {
  const { eventChanges, recordChanges, edgeChanges, bindings, version, conflicts, outside } = plan(db);
  const count = (items, name) => { const map = new Map(); for (const item of items) map.set(name(item), (map.get(name(item)) ?? 0) + 1); return [...map].map(([from, rows]) => ({ from, rows })); };
  return {
    events: count(eventChanges, change => change.from),
    idempotency_records: count(recordChanges, change => change.from),
    context_edges: edgeChanges.length,
    input_bindings: bindings.length,
    store_version: { recorded: version, after: STORE_VERSION_AFTER },
    outside,
    conflicts,
  };
}

/** The rows with the name columns blanked: what has to be the same before and after. */
function fingerprint(db) {
  const hash = (sql) => sha(JSON.stringify(db.prepare(sql).all()));
  return {
    counts: Object.fromEntries(["events", "idempotency_records", "context_edges", "input_bindings"].map(table => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n])),
    events: hash("SELECT seq, event_id, project_id, actor_id, object_id, reason, payload_json, at FROM events ORDER BY seq"),
    idempotency_records: hash("SELECT project_id, actor_id, idempotency_key, request_hash, outcome_json, created_at FROM idempotency_records ORDER BY project_id, actor_id, idempotency_key, request_hash"),
    context_edges: hash("SELECT scope_kind, scope_id, revision, relation_type, source_json, target_json, actor_id, cause, recorded_at, state FROM context_edges ORDER BY scope_kind, scope_id, relation_type, revision, source_json, target_json, recorded_at"),
    ledger: hash("SELECT plugin_id, publisher_signature, store_name, tables_json, created_at FROM plugin_project_databases ORDER BY plugin_id"),
    input_bindings: hash("SELECT binding_id, project_id, goal_id, input_name, source_type, source_ref, snapshot_digest, state, reason, created_by, created_at FROM input_bindings ORDER BY binding_id"),
  };
}

/**
 * Renames inside one `BEGIN IMMEDIATE`, then checks the library before it commits: no old name left, every count as before, every
 * other column unchanged, the foreign keys and the file intact. `hooks.afterUpdate(n)` is for the rehearsal, which breaks the run
 * after the n-th statement to see the rollback; nothing in the command line reaches it.
 */
export function rewriteGoalsNames(db, hooks = {}) {
  const found = plan(db);
  if (found.conflicts.length) return { written: false, conflicts: found.conflicts };
  const changes = found.eventChanges.length + found.recordChanges.length + found.edgeChanges.length + found.bindings.length;
  const stamp = found.version === STORE_VERSION_BEFORE;
  if (!changes && !stamp) return { written: false, conflicts: [] };
  const before = fingerprint(db);
  let updates = 0;
  const step = () => { updates += 1; hooks.afterUpdate?.(updates); };
  db.exec("BEGIN IMMEDIATE");
  try {
    const event = db.prepare("UPDATE events SET type = ?, object_type = ? WHERE seq = ?");
    for (const change of found.eventChanges) { event.run(change.type, change.object_type, change.seq); step(); }
    const record = db.prepare("UPDATE idempotency_records SET operation = ? WHERE project_id = ? AND actor_id = ? AND operation = ? AND idempotency_key = ?");
    for (const change of found.recordChanges) { record.run(change.operation, change.project_id, change.actor_id, change.from, change.idempotency_key); step(); }
    const edge = db.prepare("UPDATE context_edges SET edge_key = ? WHERE scope_kind = ? AND scope_id = ? AND edge_key = ?");
    for (const change of found.edgeChanges) { edge.run(NAMESPACE + change.key, change.scope_kind, change.scope_id, change.key); step(); }
    const binding = db.prepare("UPDATE input_bindings SET source_edge_key = ? WHERE binding_id = ?");
    for (const change of found.bindings) { binding.run(NAMESPACE + change.source_edge_key, change.binding_id); step(); }

    if (stamp) {
      const done = db.prepare("UPDATE plugin_project_databases SET version = ? WHERE plugin_id = ? AND version = ?").run(STORE_VERSION_AFTER, GOALS_PLUGIN_ID, STORE_VERSION_BEFORE);
      if (done.changes !== 1) throw new Error("the ledger row of Goals was not at the version this script expects");
      step();
    }
    const after = fingerprint(db);
    const problems = [];
    for (const key of Object.keys(before)) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) problems.push(`${key} changed beyond its names`);
    const left = plan(db);
    if (left.eventChanges.length || left.recordChanges.length || left.edgeChanges.length || left.bindings.length || left.conflicts.length) problems.push("an old name is left after the rename");
    const missing = db.prepare(`SELECT COUNT(*) AS n FROM input_bindings b WHERE b.source_edge_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM context_edges e WHERE e.edge_key = b.source_edge_key)`).get().n;
    if (missing) problems.push(`${missing} input binding(s) point at an edge that does not exist`);
    if (stamp && Number(db.prepare("SELECT version FROM plugin_project_databases WHERE plugin_id = ?").get(GOALS_PLUGIN_ID)?.version) !== STORE_VERSION_AFTER) problems.push("the ledger row of Goals is not at the new version");
    if (db.pragma("integrity_check", { simple: true }) !== "ok") problems.push("integrity_check failed");
    if (db.pragma("foreign_key_check").length) problems.push("foreign_key_check failed");
    if (problems.length) throw new Error(problems.join("; "));
    db.exec("COMMIT");
    return { written: true, conflicts: [], stamped: stamp, renamed: { events: found.eventChanges.length, idempotency_records: found.recordChanges.length, context_edges: found.edgeChanges.length, input_bindings: found.bindings.length } };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function main(argv) {
  const [mode, path] = argv;
  if (!["list", "rewrite"].includes(mode) || !path) { console.error("usage: goals-namespace-prefix.mjs list|rewrite <project.sqlite>"); return 2; }
  if (!existsSync(path)) { console.error(`not found: ${path}`); return 2; }
  const db = new Database(path, { fileMustExist: true, readonly: mode === "list", timeout: 0 });
  try {
    if (mode === "list") {
      const report = listGoalsNames(db);
      console.log(JSON.stringify(report, null, 2));
      return report.conflicts.length ? 1 : 0;
    }
    const pending = listGoalsNames(db);
    if (pending.conflicts.length) { console.error(`stopped, nothing written:\n${pending.conflicts.join("\n")}`); return 1; }
    const nothing = !pending.events.length && !pending.idempotency_records.length && !pending.context_edges && !pending.input_bindings
      && pending.store_version.recorded !== STORE_VERSION_BEFORE;
    if (nothing) { console.log("nothing to rename"); return 0; }
    const backup = join(dirname(path), `${basename(path)}.before-goals-namespace-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    db.prepare("VACUUM INTO ?").run(backup);
    console.log(`backup: ${backup}`);
    const result = rewriteGoalsNames(db);
    console.log(JSON.stringify({ ...result.renamed, store_version: result.stamped ? STORE_VERSION_AFTER : "unchanged" }));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return /SQLITE_BUSY|database is locked/i.test(String(error?.code ?? error?.message)) ? 2 : 1;
  } finally { db.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
