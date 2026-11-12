import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import pathUtil from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SYSTEM_MATERIALS_SOURCE } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { planProcessItemReassignment, reassignProcessItems, type ProcessItemProducer } from "@molis-ai/molis-work-module-artifacts";
import { planWiringReassignment, reassignWiringSource } from "@molis-ai/molis-work-plugin-runtime";
import { assertStorageOwner, describeSqliteSchema, describeSqliteBaseline, readDatabaseSpace, readStorageSpace, sqliteBaselineTriggers, type StorageOwner } from "@molis-ai/molis-work-storage";
import { PROCESS_ITEMS_TRIGGER_NAMES, PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { ADOPTED_PROCESS_ITEMS_JOURNAL, ADOPTED_PROCESS_ITEMS_JOURNAL_SQL, ADOPTED_PROCESS_ITEMS_TRIGGERS_SQL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL, PROJECT_REPLICATION_SCHEMA_SQL } from "./project-replication-schema.js";
import { projectDatabases } from "./platform-upgrade-stores.js";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";

/**
 * The explicit, isolated adoption of one Home's project libraries (specs/batch-06-shared-tools/current-version-adoption.md
 * 「同版本存储实施」, docs/system/CONTRACT-CHANGES.md「当前保留机制」 Files 退役): never run by an ordinary open, never a U1 step, and
 * `PRAGMA user_version` stays 2. Each project moves in one transaction of deterministic owner steps: the retired Files producer's process
 * items to the platform's materials source (modules/artifacts), its output ports and default bindings likewise (Plugin Runtime), and the
 * process-item triggers to the adopted journal (this Host). Anything the preflight cannot prove leaves that library exactly as it was.
 */
const FILES_PRODUCER: ProcessItemProducer = Object.freeze({ plugin_id: "io.molis.work.files", signature: "official-files-binding" });
const SYSTEM_PRODUCER: ProcessItemProducer = Object.freeze({ plugin_id: SYSTEM_MATERIALS_SOURCE.plugin_id, signature: SYSTEM_MATERIALS_SOURCE.signature });

/** The exact library every project had before adoption: the current baseline with the original process-item journal triggers. */
const ORIGINAL_SCHEMA = PROJECT_DATABASE_BASELINE.schema.replace(PROJECT_REPLICATION_SCHEMA_SQL, ORIGINAL_PROJECT_REPLICATION_SCHEMA_SQL);
if (ORIGINAL_SCHEMA === PROJECT_DATABASE_BASELINE.schema) throw new Error("project baseline no longer ends with its replication schema");

export type ProjectLayout = "original" | "current";
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
  layout: (path: string) => new ActionError("actions.service_unavailable", `${path} 既不是采用前的项目库，也不是现行项目库，不做采用`),
  space: (path: string) => new ActionError("actions.forbidden", `${path} 不属于这个 Home 的空间，不做采用`),
};

/** Same tables, columns, keys, checks and indexes as `schema`, and exactly its triggers. Extra tables are plugins' own. */
function layoutIs(db: DatabaseSync, schema: string): boolean {
  const expected = describeSqliteBaseline({ version: PROJECT_DATABASE_BASELINE.version, schema, upgrades: [] }), found = describeSqliteSchema(db);
  if (!Object.entries(expected.tables).every(([name, table]) => JSON.stringify(found.tables[name]) === JSON.stringify(table))) return false;
  for (const [name, sql] of sqliteBaselineTriggers(schema)) {
    const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name) as { sql: string } | undefined;
    if (actual?.sql !== sql) return false;
  }
  return true;
}

function layoutOf(db: DatabaseSync, path: string): ProjectLayout {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };
  if (version !== PROJECT_DATABASE_BASELINE.version) throw adoptionErrors.layout(path);
  if (layoutIs(db, PROJECT_DATABASE_BASELINE.schema)) return "current";
  const adopted = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name LIKE ?").get(`${ADOPTED_PROCESS_ITEMS_JOURNAL}_replica_%`);
  if (!adopted && layoutIs(db, ORIGINAL_SCHEMA)) return "original";
  throw adoptionErrors.layout(path);
}

/** Frozen operations or unresolved conflicts in the original journal are sync still in flight: they settle (or are captured) first. */
function unsettled(db: DatabaseSync): string[] {
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const refused: string[] = [];
  const outbox = count("process_items_replica_outbox"), conflicts = count("process_items_replica_conflicts");
  if (outbox) refused.push(`${outbox} frozen process item upload(s) not yet settled in the original journal`);
  if (conflicts) refused.push(`${conflicts} process item sync conflict(s) not yet resolved in the original journal`);
  return refused;
}

interface Plan { layout: ProjectLayout; items: number; versions: number; outputs: number; bindings: number; refused: string[] }

function plan(db: DatabaseSync, path: string): Plan {
  const layout = layoutOf(db, path);
  const items = planProcessItemReassignment(db, FILES_PRODUCER, SYSTEM_MATERIALS_SOURCE.process_items);
  const wiring = planWiringReassignment(db, FILES_PRODUCER.plugin_id, SYSTEM_PRODUCER.plugin_id, SYSTEM_MATERIALS_SOURCE.outputs.map(output => output.port));
  const refused = [...items.refused, ...wiring.refused, ...(layout === "original" ? unsettled(db) : [])];
  // An output moves with its line: what a Files port hands on must be a Files process item, or the reference would change producer.
  const moving = new Set(items.items);
  for (const row of wiring.handed) if (!moving.has(row.artifact_id)) refused.push(`output ${row.port}: ${row.artifact_id} is not a Files process item`);
  return { layout, items: items.items.length, versions: items.versions, outputs: wiring.outputs, bindings: wiring.bindings, refused };
}

/** Read-only: what adopting this library would do, without taking a backup or changing anything. */
export function inspectProjectAdoption(path: string): Omit<ProjectAdoptionReport, "project_id" | "state" | "backup"> {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return plan(db, path); } finally { db.close(); }
}

/**
 * Adopt one project library of a Home whose storage owner the caller holds. A library already current with nothing left to move is a
 * no-op; a refusal changes nothing. Before the first change the whole library is copied to `backupDirectory`.
 */
export function adoptProjectDatabase(input: { home: string; owner: StorageOwner; projectId: string; backupDirectory: string }): ProjectAdoptionReport {
  assertStorageOwner(agentRuntimeDirectory(input.home), input.owner);
  const space = readStorageSpace(input.home);
  const relative = space && projectDatabases(input.home, space).find(entry => pathUtil.basename(pathUtil.dirname(entry)) === input.projectId);
  if (!space || !relative) throw new ActionError("actions.missing", `这个 Home 没有项目 ${input.projectId}`);
  const path = pathUtil.join(input.home, relative);
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000");
    const bound = readDatabaseSpace(db);
    if (!bound || bound.spaceId !== space.spaceId) throw adoptionErrors.space(path);
    const found = plan(db, path);
    const report = { project_id: input.projectId, ...found };
    if (found.refused.length) return { ...report, state: "refused" };
    if (found.layout === "current" && !found.items && !found.outputs && !found.bindings) return { ...report, state: "current" };
    mkdirSync(input.backupDirectory, { recursive: true });
    const backup = pathUtil.join(input.backupDirectory, `${input.projectId}-${Date.now()}.db`);
    if (existsSync(backup)) throw new ActionError("actions.conflict", `备份 ${backup} 已存在`);
    // VACUUM cannot run inside a transaction: the copy comes first, and the plan is taken again under the write lock.
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      if (JSON.stringify(plan(db, path)) !== JSON.stringify(found)) throw new ActionError("actions.conflict", `${path} 在备份后变了，请重新采用`);
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
