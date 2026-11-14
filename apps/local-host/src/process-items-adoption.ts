import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import pathUtil from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SYSTEM_MATERIALS_SOURCE } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { planProcessItemReassignment, reassignProcessItems, type ProcessItemProducer } from "@molis-ai/molis-work-module-artifacts";
import { applyPrivateValueAdoption, applyPrivateValueMove, planPrivateValueAdoption, planPrivateValueMove, planRetiredInstalls, planWiringReassignment, reassignWiringSource, retireInstalls, SqlitePluginConsentLedger, type PrivateValueAdoptionPlan } from "@molis-ai/molis-work-plugin-runtime";
import { projectsHoldingPlugin, retireProjectPlugin } from "@molis-ai/molis-work-module-projects";
import { assertCurrentCatalog, assertOwnedCatalog } from "./catalog-schema.js";
import { preflightProjectCatalog } from "./project-catalog-replication.js";
import { MATERIALS_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { PROJECT_POSITION_KEY, parsePosition } from "./system-materials-actions.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { assertStorageOwner, LocalSqliteStorage, openSqliteConnection, readDatabaseSpace, readStorageSpace, type SqliteDatabase, type StorageOwner } from "@molis-ai/molis-work-storage";
import { PROCESS_ITEMS_TRIGGER_NAMES } from "./project-database-schema.js";
import { ADOPTED_PROCESS_ITEMS_JOURNAL, ADOPTED_PROCESS_ITEMS_JOURNAL_SQL, ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL } from "./project-replication-schema.js";
import { layoutOf, upgradeAdoptedOriginal, type ProjectLayout } from "./project-layout.js";
import { processItemKey, verifyProcessItemsRecovery } from "./process-items-recovery.js";
import { processItemsSyncFailureKeys, readProcessItemsSyncEvidence } from "@molis-ai/molis-work-module-sync-replication";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { openHomePluginStore, openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";

/**
 * The explicit, isolated adoption of one Home's project libraries (specs/batch-06-shared-tools/current-version-adoption.md
 * 「同版本存储实施」, docs/system/CONTRACT-CHANGES.md「当前保留机制」 Files 退役): never run by an ordinary open, never a U1 step.
 * An original version-2 library is upgraded inside the same transaction to the current version (3), after the adopted journal is
 * installed; `PRAGMA user_version` therefore ends at `PROJECT_DATABASE_BASELINE.version`, not 2 (user 2026-11-13). Each project moves in one
 * transaction of deterministic owner steps: the retired Files producer's process
 * items to the platform's materials source (modules/artifacts), its output ports and default bindings likewise (Plugin Runtime), and the
 * process-item triggers to the adopted journal (this Host). Anything the preflight cannot prove leaves that library exactly as it was.
 */
export const FILES_PRODUCER: ProcessItemProducer = Object.freeze({ plugin_id: "io.molis.work.files", signature: "official-files-binding" });
export const SYSTEM_PRODUCER: ProcessItemProducer = Object.freeze({ plugin_id: SYSTEM_MATERIALS_SOURCE.plugin_id, signature: SYSTEM_MATERIALS_SOURCE.signature });

export interface ProjectAdoptionReport {
  readonly project_id: string;
  readonly layout: ProjectLayout;
  /** `adopted`: this run moved it; `current`: nothing left to move; `refused`: kept as it was, see `refused`. */
  readonly state: "adopted" | "current" | "refused";
  readonly items: number;
  readonly versions: number;
  readonly outputs: number;
  readonly bindings: number;
  /** Built-in plugins' private values in an earlier shape, each converted by its own plugin (Coding's draft and queued rounds). */
  readonly private_values: number;
  /** The project's Files reading position carried to the materials service (0 or 1). */
  readonly positions: number;
  /** Files' official installs in this library marked uninstalled, their private values kept (spec.md「本库安装清理」). */
  readonly installs: number;
  /** Event cursors Files still held as a subscriber, dropped: with no package left nothing would read them again. */
  readonly cursors: number;
  /**
   * Keys of a library that never took part in the old stream, carried into the adopted journal as unsent changes (user 2026-11-12): they
   * were never offered to any stream, so if sync is turned on later they go to the adopted one as new writes. 0 for any other library.
   */
  readonly carried: number;
  readonly refused: readonly string[];
  /** The copy taken before this run changed anything. */
  readonly backup?: string;
}

const adoptionErrors = {
  space: (path: string) => new ActionError("actions.forbidden", `${path} 不属于这个 Home 的空间，不做采用`),
};

/**
 * Lines the original journal still holds (unsent changes, frozen uploads, unresolved conflicts) and the public collection's failures or
 * deferred events for this project are sync still in flight: they settle first, or a verified recovery file keeps them
 * (process-items-recovery.ts), since after adoption nothing moves them on the old stream again.
 */
/**
 * Whether this Home ever took part in the public process-item collection: sync.db holds no cursor, failure, deferred event, upload or
 * cached part for it. A Home that never synced, or never chose process items, answers true.
 */
export function processItemsNeverSynced(home: string): boolean {
  const evidence = readProcessItemsSyncEvidence(home);
  return !evidence.failures.length && evidence.streamCursor === null && evidence.partitionCursor === null && !evidence.uploads.length && !evidence.parts.length;
}

/** A library whose original journal never received, froze or conflicted anything: its changes are lines no stream was ever offered. */
function neverOffered(db: SqliteDatabase): boolean {
  const empty = (table: string) => !db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();
  const cursor = db.prepare("SELECT cursor FROM process_items_replica_state WHERE id=1").get() as { cursor: number } | undefined;
  return ["process_items_replica_heads", "process_items_replica_outbox", "process_items_replica_conflicts", "process_items_replica_resolutions"].every(empty) && Number(cursor?.cursor ?? 0) === 0;
}
const pendingKeys = (db: SqliteDatabase) => (db.prepare("SELECT COUNT(DISTINCT key) AS n FROM process_items_replica_changes").get() as { n: number }).n;

function unsettled(db: SqliteDatabase, failures: readonly string[]): string[] {
  const count = (table: string) => (db.prepare(`SELECT COUNT(DISTINCT key) AS n FROM ${table}`).get() as { n: number }).n;
  const reasons: string[] = [];
  const changes = count("process_items_replica_changes"), outbox = count("process_items_replica_outbox"), conflicts = count("process_items_replica_conflicts");
  if (changes) reasons.push(`${changes} process item change(s) not yet uploaded from the original journal`);
  if (outbox) reasons.push(`${outbox} frozen process item upload(s) not yet settled in the original journal`);
  if (conflicts) reasons.push(`${conflicts} process item sync conflict(s) not yet resolved in the original journal`);
  if (failures.length) reasons.push(`${failures.length} process item sync failure(s) or deferred download(s) not yet settled`);
  return reasons;
}

interface Plan { layout: ProjectLayout; items: number; versions: number; outputs: number; bindings: number; private_values: number; positions: number; installs: number; cursors: number; carried: number; refused: string[]; unsettled: string[] }
/** What sync.db says that bears on one library: its failures and deferred events, and whether the Home ever took part in the collection. */
export interface ProcessItemsSyncFacts { readonly failures: readonly string[]; readonly neverSynced: boolean }

/** Files kept the project's last reading position under this key (its `position.ts`, deleted with the plugin), as `{workspace_id,path}`. */
const FILES_POSITION_KEY = "reading-position";
/** The Files reading position this library would carry to the materials service: only one the materials service itself reads. */
const positionMoves = (db: SqliteDatabase) => planPrivateValueMove(db, {
  from: { plugin_id: FILES_PRODUCER.plugin_id, signature: FILES_PRODUCER.signature, key: FILES_POSITION_KEY },
  to: { system_id: MATERIALS_PROVIDER_ID, key: PROJECT_POSITION_KEY }, accept: value => parsePosition(value) !== null,
});

/** Each built-in plugin that converts its own private values at adoption, and what it would change in this library. */
const privateValues = (db: SqliteDatabase): PrivateValueAdoptionPlan[] =>
  PLATFORM_PLUGIN_REGISTRATIONS.filter(registration => registration.private_value_adoption).map(registration => planPrivateValueAdoption(db, registration));

function plan(db: SqliteDatabase, path: string, sync: ProcessItemsSyncFacts = { failures: [], neverSynced: false }): Plan {
  const layout = layoutOf(db, path);
  const items = planProcessItemReassignment(db, FILES_PRODUCER, SYSTEM_MATERIALS_SOURCE.process_items);
  const wiring = planWiringReassignment(db, FILES_PRODUCER.plugin_id, SYSTEM_PRODUCER.plugin_id, SYSTEM_MATERIALS_SOURCE.outputs.map(output => output.port));
  const values = privateValues(db), positions = positionMoves(db), retired = planRetiredInstalls(db, FILES_PRODUCER);
  const refused = [...items.refused, ...wiring.refused, ...values.flatMap(plan => plan.refused), ...positions.refused];
  // An output moves with its line: what a Files port hands on must be a Files process item, or the reference would change producer.
  const moving = new Set(items.items);
  for (const row of wiring.handed) if (!moving.has(row.artifact_id)) refused.push(`output ${row.port}: ${row.artifact_id} is not a Files process item`);
  return { layout, items: items.items.length, versions: items.versions, outputs: wiring.outputs, bindings: wiring.bindings,
    private_values: values.reduce((sum, plan) => sum + plan.changes.length, 0), positions: positions.moves.length,
    installs: retired.installs.length, cursors: retired.cursors, refused,
    ...(layout === "original" && sync.neverSynced && neverOffered(db) ? { carried: pendingKeys(db), unsettled: [] }
      : { carried: 0, unsettled: layout === "original" ? unsettled(db, sync.failures) : [] }) };
}

/** Whether a library still has something for adoption to move or clean up (layout aside). */
export const adoptionPending = (found: Pick<Plan, "items" | "outputs" | "bindings" | "private_values" | "positions" | "installs" | "cursors">): boolean =>
  !!(found.items || found.outputs || found.bindings || found.private_values || found.positions || found.installs || found.cursors);

/**
 * Read-only: what adopting this library would do, without taking a backup or changing anything. `refused` names everything that stops
 * it now; `unsettled` is the part of that a recovery file of this Home can keep (lines sync has not settled, given its `failures`).
 */
export function inspectProjectAdoption(path: string, sync?: ProcessItemsSyncFacts): Omit<ProjectAdoptionReport, "project_id" | "state" | "backup"> & { readonly unsettled: readonly string[] } {
  const db = openSqliteConnection(path, { readonly: true, fileMustExist: true });
  try { const { unsettled, refused, ...found } = plan(db, path, sync); return { ...found, refused: [...refused, ...unsettled], unsettled }; } finally { db.close(); }
}

/**
 * Adopt one project library of a Home whose storage owner the caller holds. A library already current with nothing left to move is a
 * no-op; a refusal changes nothing. Before the first change the whole library is copied to `backupDirectory`.
 */
export function adoptProjectDatabase(input: { home: string; owner: StorageOwner; projectId: string; backupDirectory: string; recovery?: string }): ProjectAdoptionReport {
  assertStorageOwner(agentRuntimeDirectory(input.home), input.owner);
  // Libraries are found and checked at the Home's real path, as the upgrade finds them.
  const home = realpathSync(input.home), space = readStorageSpace(home);
  const relative = space && projectDatabases(home, space).find(entry => pathUtil.basename(pathUtil.dirname(entry)) === input.projectId);
  if (!space || !relative) throw new ActionError("actions.missing", `这个 Home 没有项目 ${input.projectId}`);
  const path = pathUtil.join(home, relative);
  const db = openSqliteConnection(path, { fileMustExist: true });
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const bound = readDatabaseSpace(db);
    if (!bound || bound.spaceId !== space.spaceId) throw adoptionErrors.space(path);
    const sync = { failures: processItemsSyncFailureKeys(home).filter(key => processItemKey(key).projectId === input.projectId), neverSynced: processItemsNeverSynced(home) };
    const found = plan(db, path, sync);
    // Unsettled lines are adopted only when a recovery file of this Home, checked against it now, keeps this project's.
    const kept = found.unsettled.length > 0 && input.recovery !== undefined
      && verifyProcessItemsRecovery({ home, captureId: input.recovery }).projects.some(project => project.projectId === input.projectId);
    const { unsettled: open, ...rest } = found;
    const report = { project_id: input.projectId, ...rest, refused: [...found.refused, ...(kept ? [] : open)] };
    if (report.refused.length) return { ...report, state: "refused" };
    if (found.layout === "current" && !adoptionPending(found)) return { ...report, state: "current" };
    mkdirSync(input.backupDirectory, { recursive: true });
    const backup = pathUtil.join(input.backupDirectory, `${input.projectId}-${Date.now()}.db`);
    if (existsSync(backup)) throw new ActionError("actions.conflict", `备份 ${backup} 已存在`);
    // VACUUM cannot run inside a transaction: the copy comes first, and the plan is taken again under the write lock.
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      if (JSON.stringify(plan(db, path, sync)) !== JSON.stringify(found)) throw new ActionError("actions.conflict", `${path} 在备份后变了，请重新采用`);
      if (found.layout === "original") for (const name of PROCESS_ITEMS_TRIGGER_NAMES) db.exec(`DROP TRIGGER ${name}`);
      // A library already on the adopted journal (upgraded from 1) records nothing for the move: the owner's own applying flag.
      else db.exec(`UPDATE ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_state SET applying=1 WHERE id=1`);
      const items = reassignProcessItems(db, FILES_PRODUCER, SYSTEM_PRODUCER);
      const wiring = reassignWiringSource(db, FILES_PRODUCER.plugin_id, SYSTEM_PRODUCER.plugin_id);
      const values = privateValues(db).reduce((sum, plan) => sum + applyPrivateValueAdoption(db, plan), 0);
      const positions = applyPrivateValueMove(db, positionMoves(db).moves);
      // The reading position is read from the install's values above, so the install is retired after it; its values stay.
      const retired = retireInstalls(db, FILES_PRODUCER, planRetiredInstalls(db, FILES_PRODUCER), new Date().toISOString());
      if (found.layout === "original") db.exec(`${ADOPTED_PROCESS_ITEMS_JOURNAL_SQL}\n${ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL}`);
      // Lines no stream was ever offered stay unsent, now in the adopted journal, in the order they were first recorded; the original stays.
      if (found.carried) db.exec(`INSERT INTO ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_changes(key) SELECT key FROM process_items_replica_changes GROUP BY key ORDER BY MIN(seq)`);
      else db.exec(`UPDATE ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_state SET applying=0 WHERE id=1`);
      // The original layout is version 2; the later steps of the project upgrade bring it to the current version in this same transaction.
      if (found.layout === "original") upgradeAdoptedOriginal(db);
      const after = plan(db, path);
      const carried = (db.prepare(`SELECT COUNT(DISTINCT key) AS n FROM ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_changes`).get() as { n: number }).n;
      if ((found.layout === "original" && carried !== found.carried) || items !== found.items || wiring.outputs !== found.outputs || wiring.bindings !== found.bindings || values !== found.private_values || positions !== found.positions
        || retired.installs !== found.installs || retired.cursors !== found.cursors || after.layout !== "current" || adoptionPending(after) || after.refused.length) {
        throw new ActionError("actions.service_unavailable", `${path} 采用后的读回与计划不符，已回滚`);
      }
      db.exec("COMMIT");
      committed = true;
      return { ...report, state: "adopted", backup };
    } finally { if (!committed) db.exec("ROLLBACK"); }
  } finally { db.close(); }
}

export interface FilesConsentRetirement {
  /** Projects that still have something to adopt, with why; while any is listed nothing is taken back. */
  readonly waiting: readonly { readonly project_id: string; readonly reasons: readonly string[] }[];
  /** The consents this run took back (none on a second run). */
  readonly revoked: number;
  /** Projects whose catalog membership (local and portable) this run took Files out of (none on a second run). */
  readonly memberships: number;
}

/** The short id the project catalog records Files' membership under. */
const FILES_CATALOG_ID = "files";

/**
 * The Home step of the Files retirement (spec.md「项目库 v2 同版本采用与交接」), only after every project library of this Home is adopted
 * (its installs retired there), so no project still runs on the retired source: Files' own current consents in the Home ledger are taken
 * back by the ledger's owner, and the project catalog (Projects) takes Files out of each project's membership with the ordinary removal
 * event, which account sync carries. Idempotent; a Home with no ledger or catalog yet has nothing to take back. Private values stay.
 */
export function retireFilesConsents(input: { home: string; owner: StorageOwner; at: string }): FilesConsentRetirement {
  assertStorageOwner(agentRuntimeDirectory(input.home), input.owner);
  const home = realpathSync(input.home), space = readStorageSpace(home);
  if (!space) throw new ActionError("actions.missing", "这个 Home 还没有账号空间");
  const waiting = projectDatabases(home, space).flatMap(relative => {
    const found = inspectProjectAdoption(pathUtil.join(home, relative));
    const reasons = [...(found.layout === "current" ? [] : [`layout ${found.layout}`]), ...(adoptionPending(found) ? ["not adopted yet"] : []), ...found.refused];
    return reasons.length ? [{ project_id: pathUtil.basename(pathUtil.dirname(relative)), reasons }] : [];
  });
  if (waiting.length) return { waiting, revoked: 0, memberships: 0 };
  const memberships = retireCatalogMembership(home, input.at);
  const existing = openReadOnlyHomePluginStore(home);
  if (!existing) return { waiting, revoked: 0, memberships };
  existing.close();
  const { db } = openHomePluginStore(home);
  try {
    const revoked = new SqlitePluginConsentLedger(db).revokeRetiredPlugin({ plugin_id: FILES_PRODUCER.plugin_id, publisher_signature: FILES_PRODUCER.signature }, input.at);
    return { waiting, revoked: revoked.length, memberships };
  } finally { db.close(); }
}

/** The catalog half of the Home step, checked as every catalog writer checks it; one transaction, read back before it commits. */
function retireCatalogMembership(home: string, at: string): number {
  const path = pathUtil.join(home, "projects", "catalog.db");
  if (!existsSync(path)) return 0;
  preflightProjectCatalog(path);
  const store = new LocalSqliteStorage(path, { fileMustExist: true });
  try {
    assertOwnedCatalog(store, path);
    assertCurrentCatalog(store, path);
    if (!projectsHoldingPlugin(store.db, FILES_CATALOG_ID).length) return 0;
    return store.db.transaction(() => {
      const projects = retireProjectPlugin(store.db, { plugin_id: FILES_CATALOG_ID, actor_id: "local-host", at, eventId: () => `project-event-${randomUUID()}` });
      if (projectsHoldingPlugin(store.db, FILES_CATALOG_ID).length) throw new ActionError("actions.service_unavailable", `${path} 移除 Files 成员后读回仍有，已回滚`);
      return projects.length;
    }).immediate();
  } finally { store.close(); }
}
