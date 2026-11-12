import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, realpathSync } from "node:fs";
import pathUtil from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SYSTEM_MATERIALS_SOURCE } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { planProcessItemReassignment, reassignProcessItems, type ProcessItemProducer } from "@molis-ai/molis-work-module-artifacts";
import { planWiringReassignment, reassignWiringSource } from "@molis-ai/molis-work-plugin-runtime";
import { assertStorageOwner, readDatabaseSpace, readStorageSpace, type StorageOwner } from "@molis-ai/molis-work-storage";
import { PROCESS_ITEMS_TRIGGER_NAMES } from "./project-database-schema.js";
import { ADOPTED_PROCESS_ITEMS_JOURNAL, ADOPTED_PROCESS_ITEMS_JOURNAL_SQL, ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL } from "./project-replication-schema.js";
import { layoutOf, type ProjectLayout } from "./project-layout.js";
import { processItemKey, verifyProcessItemsRecovery } from "./process-items-recovery.js";
import { processItemsSyncFailureKeys } from "@molis-ai/molis-work-module-sync-replication";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";

/**
 * The explicit, isolated adoption of one Home's project libraries (specs/batch-06-shared-tools/current-version-adoption.md
 * 「同版本存储实施」, docs/system/CONTRACT-CHANGES.md「当前保留机制」 Files 退役): never run by an ordinary open, never a U1 step, and
 * `PRAGMA user_version` stays 2. Each project moves in one transaction of deterministic owner steps: the retired Files producer's process
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
function unsettled(db: DatabaseSync, failures: readonly string[]): string[] {
  const count = (table: string) => (db.prepare(`SELECT COUNT(DISTINCT key) AS n FROM ${table}`).get() as { n: number }).n;
  const reasons: string[] = [];
  const changes = count("process_items_replica_changes"), outbox = count("process_items_replica_outbox"), conflicts = count("process_items_replica_conflicts");
  if (changes) reasons.push(`${changes} process item change(s) not yet uploaded from the original journal`);
  if (outbox) reasons.push(`${outbox} frozen process item upload(s) not yet settled in the original journal`);
  if (conflicts) reasons.push(`${conflicts} process item sync conflict(s) not yet resolved in the original journal`);
  if (failures.length) reasons.push(`${failures.length} process item sync failure(s) or deferred download(s) not yet settled`);
  return reasons;
}

interface Plan { layout: ProjectLayout; items: number; versions: number; outputs: number; bindings: number; refused: string[]; unsettled: string[] }

function plan(db: DatabaseSync, path: string, failures: readonly string[] = []): Plan {
  const layout = layoutOf(db, path);
  const items = planProcessItemReassignment(db, FILES_PRODUCER, SYSTEM_MATERIALS_SOURCE.process_items);
  const wiring = planWiringReassignment(db, FILES_PRODUCER.plugin_id, SYSTEM_PRODUCER.plugin_id, SYSTEM_MATERIALS_SOURCE.outputs.map(output => output.port));
  const refused = [...items.refused, ...wiring.refused];
  // An output moves with its line: what a Files port hands on must be a Files process item, or the reference would change producer.
  const moving = new Set(items.items);
  for (const row of wiring.handed) if (!moving.has(row.artifact_id)) refused.push(`output ${row.port}: ${row.artifact_id} is not a Files process item`);
  return { layout, items: items.items.length, versions: items.versions, outputs: wiring.outputs, bindings: wiring.bindings, refused,
    unsettled: layout === "original" ? unsettled(db, failures) : [] };
}

/** Read-only: what adopting this library would do, without taking a backup or changing anything. */
export function inspectProjectAdoption(path: string): Omit<ProjectAdoptionReport, "project_id" | "state" | "backup"> {
  const db = new DatabaseSync(path, { readOnly: true });
  try { const { unsettled: open, refused, ...found } = plan(db, path); return { ...found, refused: [...refused, ...open] }; } finally { db.close(); }
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
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const bound = readDatabaseSpace(db);
    if (!bound || bound.spaceId !== space.spaceId) throw adoptionErrors.space(path);
    const failures = processItemsSyncFailureKeys(home).filter(key => processItemKey(key).projectId === input.projectId);
    const found = plan(db, path, failures);
    // Unsettled lines are adopted only when a recovery file of this Home, checked against it now, keeps this project's.
    const kept = found.unsettled.length > 0 && input.recovery !== undefined
      && verifyProcessItemsRecovery({ home, captureId: input.recovery }).projects.some(project => project.projectId === input.projectId);
    const { unsettled: open, ...rest } = found;
    const report = { project_id: input.projectId, ...rest, refused: [...found.refused, ...(kept ? [] : open)] };
    if (report.refused.length) return { ...report, state: "refused" };
    if (found.layout === "current" && !found.items && !found.outputs && !found.bindings) return { ...report, state: "current" };
    mkdirSync(input.backupDirectory, { recursive: true });
    const backup = pathUtil.join(input.backupDirectory, `${input.projectId}-${Date.now()}.db`);
    if (existsSync(backup)) throw new ActionError("actions.conflict", `备份 ${backup} 已存在`);
    // VACUUM cannot run inside a transaction: the copy comes first, and the plan is taken again under the write lock.
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      if (JSON.stringify(plan(db, path, failures)) !== JSON.stringify(found)) throw new ActionError("actions.conflict", `${path} 在备份后变了，请重新采用`);
      if (found.layout === "original") for (const name of PROCESS_ITEMS_TRIGGER_NAMES) db.exec(`DROP TRIGGER ${name}`);
      // A library already on the adopted journal (upgraded from 1) records nothing for the move: the owner's own applying flag.
      else db.exec(`UPDATE ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_state SET applying=1 WHERE id=1`);
      const items = reassignProcessItems(db, FILES_PRODUCER, SYSTEM_PRODUCER);
      const wiring = reassignWiringSource(db, FILES_PRODUCER.plugin_id, SYSTEM_PRODUCER.plugin_id);
      if (found.layout === "original") db.exec(`${ADOPTED_PROCESS_ITEMS_JOURNAL_SQL}\n${ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL}`);
      else db.exec(`UPDATE ${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_state SET applying=0 WHERE id=1`);
      const after = plan(db, path);
      if (items !== found.items || wiring.outputs !== found.outputs || wiring.bindings !== found.bindings || after.layout !== "current"
        || after.items || after.outputs || after.bindings || after.refused.length) {
        throw new ActionError("actions.service_unavailable", `${path} 采用后的读回与计划不符，已回滚`);
      }
      db.exec("COMMIT");
      committed = true;
      return { ...report, state: "adopted", backup };
    } finally { if (!committed) db.exec("ROLLBACK"); }
  } finally { db.close(); }
}
