import { DatabaseSync } from "node:sqlite";
import { realpathSync } from "node:fs";
import pathUtil from "node:path";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { createProcessItemReplication } from "@molis-ai/molis-work-module-artifacts";
import {
  PROCESS_ITEMS_NAMESPACE, PROCESS_ITEMS_RECOVERY_FORMAT, newProcessItemsCaptureId, readProcessItemsRecovery, readProcessItemsSyncEvidence, writeProcessItemsRecovery,
  type ProcessItemsRecovery, type ProcessItemsRecoveryProject, type ProcessItemsSyncEvidence,
} from "@molis-ai/molis-work-module-sync-replication";
import { assertStorageOwner, readDatabaseSpace, readStorageSpace, type StorageOwner } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { layoutOf } from "./project-layout.js";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { readBackProcessItem } from "./process-items-readback.js";

/**
 * The capture of a Home's process items that had not all reached the old stream (specs/batch-06-shared-tools/sync-cutover.md step 2–3,
 * BSH-14-D): before its libraries are adopted, under the Home's storage owner, each project's original journal is kept exactly as it
 * is, with the graph (or deletion intent) of every key it still holds, together with what sync.db holds for the public collection.
 * The file is read back and checked against the libraries before it counts: adoption of a library with unsettled lines needs it, and the
 * person's takeover after the cutover reads from it. The original journal itself is never changed by adoption or takeover.
 */
const ORIGINAL_JOURNAL = "process_items";
const errors = defineErrorCodes("host", { process_recovery_invalid: "invalid" });
const invalid = (message: string) => errors.process_recovery_invalid(message);

type Journal = Omit<ProcessItemsRecoveryProject, "projectId" | "layout" | "graphs">;
export interface ProcessItemsRecoveryCapture {
  /** null when nothing in this Home was unsettled: there is nothing to keep and no file. */
  readonly captureId: string | null;
  readonly path: string | null;
  readonly projects: readonly string[];
}

const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])) : value;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** `[projectId,"process_item",artifactId]`, the collection's own key; anything else is not one of its lines. */
export function processItemKey(key: string): { projectId: string; artifactId: string } {
  let value: unknown;
  try { value = JSON.parse(key); } catch { throw invalid("过程项同步键无效，原件已保留"); }
  if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== "string" || value[1] !== "process_item" || typeof value[2] !== "string") throw invalid("过程项同步键无效，原件已保留");
  return { projectId: value[0], artifactId: value[2] };
}

/** The original journal as stored, in a stable order. Table names are this owner's fixed prefix, never a value read from anywhere. */
function readJournal(db: DatabaseSync): Journal {
  const table = (name: string) => `${ORIGINAL_JOURNAL}_replica_${name}`;
  const state = db.prepare(`SELECT device,cursor FROM ${table("state")} WHERE id=1`).get();
  return {
    state: state ? { device: String(state.device), cursor: Number(state.cursor) } : null,
    changes: db.prepare(`SELECT seq,key FROM ${table("changes")} ORDER BY seq`).all().map(row => ({ seq: Number(row.seq), key: String(row.key) })),
    heads: db.prepare(`SELECT key,revision FROM ${table("heads")} ORDER BY key`).all().map(row => ({ key: String(row.key), revision: Number(row.revision) })),
    outbox: db.prepare(`SELECT key,through_seq,operation FROM ${table("outbox")} ORDER BY key`).all()
      .map(row => ({ key: String(row.key), through_seq: Number(row.through_seq), operation: String(row.operation) })),
    conflicts: db.prepare(`SELECT key,event,reason,waiting FROM ${table("conflicts")} ORDER BY key`).all()
      .map(row => ({ key: String(row.key), event: String(row.event), reason: String(row.reason), waiting: Number(row.waiting) })),
    resolutions: db.prepare(`SELECT id,key,choice,local_json,remote_json FROM ${table("resolutions")} ORDER BY id`).all()
      .map(row => ({ id: Number(row.id), key: String(row.key), choice: String(row.choice), local_json: String(row.local_json), remote_json: String(row.remote_json) })),
  };
}

/** The keys a project still holds unsettled: in its original journal, or as a failure or deferred event of the public collection. */
export function unsettledProcessItemKeys(journal: Pick<Journal, "changes" | "outbox" | "conflicts">, failures: readonly string[]): string[] {
  return [...new Set([...journal.changes, ...journal.outbox, ...journal.conflicts].map(row => row.key).concat(failures))].sort();
}
const failuresOf = (sync: Pick<ProcessItemsSyncEvidence, "failures">, projectId: string) =>
  sync.failures.map(row => row.key).filter(key => processItemKey(key).projectId === projectId);

/** Every project library of this Home, found at its real path, with the project id its directory carries. */
function libraries(home: string) {
  const space = readStorageSpace(home);
  if (!space) throw new ActionError("actions.missing", "这个 Home 还没有账号空间");
  return { space, projects: projectDatabases(home, space).map(relative => ({ projectId: pathUtil.basename(pathUtil.dirname(relative)), path: pathUtil.join(home, relative) })) };
}

/** One library read in a single read transaction, after its bound space is checked. */
function withLibrary<T>(path: string, spaceId: string, read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout=5000");
    if (readDatabaseSpace(db)?.spaceId !== spaceId) throw new ActionError("actions.forbidden", `${path} 不属于这个 Home 的空间`);
    db.exec("BEGIN");
    try { return read(db); } finally { db.exec("COMMIT"); }
  } finally { db.close(); }
}

/** The graph the current owner reads for a key now, or null for a key whose line no longer exists (a deletion intent). */
function graphOf(db: DatabaseSync, path: string, spaceId: string, projectId: string, key: string): unknown {
  const { projectId: owner, artifactId } = processItemKey(key);
  if (owner !== projectId) throw invalid("过程项同步键不属于这个项目，原件已保留");
  const refuse = (): never => { throw invalid("恢复件读取不能写入项目库"); };
  // A read never opens a transaction of its own: the library stays in this read-only connection's one read transaction.
  const reader = { prepare: (sql: string) => db.prepare(sql), exec: (sql: string) => db.exec(sql), transaction: refuse, name: path, inTransaction: true };
  return createProcessItemReplication(reader, { spaceId, projectId, authorize() {} }, { appendEvent: refuse, eventCursor: refuse }).read(artifactId);
}

/** A captured graph is accepted only if the current owner writes and reads back exactly the same graph in a scratch library. */
function assertGraph(spaceId: string, projectId: string, key: string, graph: unknown) {
  if (graph === null) return;
  const { artifactId } = processItemKey(key);
  const read = readBackProcessItem(spaceId, () => {}, projectId, graph);
  if (!read || read.identity.artifact_id !== artifactId || !same(read, graph)) throw invalid(`恢复件里的过程项 ${key} 读不回，原件已保留`);
}

/**
 * Capture this Home's unsettled process items into one recovery file, under the storage owner the caller holds (the maintenance window,
 * before the libraries are adopted). The file is read back and checked before this returns; on any refusal nothing counts as captured.
 */
export function captureProcessItemsRecovery(input: { home: string; owner: StorageOwner; cutoverId: string }): ProcessItemsRecoveryCapture {
  assertStorageOwner(agentRuntimeDirectory(input.home), input.owner);
  const home = realpathSync(input.home), { space, projects } = libraries(home);
  const sync = readProcessItemsSyncEvidence(home), captured: ProcessItemsRecoveryProject[] = [];
  for (const project of projects) {
    const failures = failuresOf(sync, project.projectId);
    const row = withLibrary(project.path, space.spaceId, db => {
      const journal = readJournal(db), keys = unsettledProcessItemKeys(journal, failures);
      if (!keys.length) return null;
      return { projectId: project.projectId, layout: layoutOf(db, project.path), ...journal, graphs: keys.map(key => ({ key, graph: graphOf(db, project.path, space.spaceId, project.projectId, key) })) };
    });
    if (row) captured.push(row);
  }
  if (!captured.length) return { captureId: null, path: null, projects: [] };
  for (const project of captured) for (const { key, graph } of project.graphs) assertGraph(space.spaceId, project.projectId, key, graph);
  const captureId = newProcessItemsCaptureId();
  const path = writeProcessItemsRecovery(home, {
    header: { format: PROCESS_ITEMS_RECOVERY_FORMAT, captureId, spaceId: space.spaceId, namespace: PROCESS_ITEMS_NAMESPACE, cutoverId: input.cutoverId,
      sourceVersion: PROJECT_DATABASE_BASELINE.version },
    projects: captured, sync,
  });
  verifyProcessItemsRecovery({ home, captureId });
  return { captureId, path, projects: captured.map(project => project.projectId) };
}

/**
 * Reopen a recovery file and check it against this Home as it is now: the same space and library version, each captured project's
 * original journal unchanged, its graphs exactly the keys it holds unsettled and each read back by the current owner, and sync.db's
 * rows of the public collection unchanged (a cached part may since have been dropped or added; a captured one still there must be the same).
 */
export function verifyProcessItemsRecovery(input: { home: string; captureId: string }): ProcessItemsRecovery {
  const home = realpathSync(input.home), { space, projects } = libraries(home);
  const recovery = readProcessItemsRecovery(home, input.captureId), { header } = recovery;
  if (header.spaceId !== space.spaceId || header.sourceVersion !== PROJECT_DATABASE_BASELINE.version) throw invalid("恢复件不属于这个 Home 或这一版项目库，原件已保留");
  const now = readProcessItemsSyncEvidence(home), { parts, ...rows } = now, { parts: kept, ...keptRows } = recovery.sync;
  if (!same(rows, keptRows)) throw invalid("恢复件之后同步队列变了，请重新保全，原件已保留");
  const byPart = new Map(kept.map(part => [`${part.digest}:${part.part}`, part]));
  if (parts.some(part => byPart.has(`${part.digest}:${part.part}`) && !same(byPart.get(`${part.digest}:${part.part}`), part))) throw invalid("恢复件之后同步附件缓存变了，请重新保全，原件已保留");
  for (const project of recovery.projects) {
    const library = projects.find(row => row.projectId === project.projectId);
    if (!library) throw invalid(`恢复件里的项目 ${project.projectId} 不在这个 Home 里，原件已保留`);
    const { projectId: _id, layout: _layout, graphs, ...journal } = project;
    withLibrary(library.path, space.spaceId, db => { if (!same(readJournal(db), journal)) throw invalid(`项目 ${project.projectId} 的原过程项日志在保全后变了，原件已保留`); });
    const keys = unsettledProcessItemKeys(journal, failuresOf(recovery.sync, project.projectId));
    if (!same(graphs.map(graph => graph.key), keys)) throw invalid(`恢复件里项目 ${project.projectId} 的过程项不完整，原件已保留`);
    for (const { key, graph } of graphs) assertGraph(space.spaceId, project.projectId, key, graph);
  }
  return recovery;
}
