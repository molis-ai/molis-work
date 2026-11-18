import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { inspectPluginProjectDatabase, listPluginProjectDatabases, transferPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { transferGoalsApprovalRecords } from "@molis-ai/molis-work-service-project-approvals";
import { sqliteBaselineTriggers, type SqliteBaselineDatabase, type SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { GOALS_APPROVAL_OUTCOMES_SQL, GOALS_APPROVAL_TRANSFER_SOURCE, GOALS_V5_LIBRARY, GOALS_APPROVAL_TRANSFER_TABLES, goalsApprovalTransferManifest, isGoalsApprovalSource, readGoalsApprovalTransfer } from "./goal-callers.js";
import { pluginSyncNamespace } from "./plugin-sync-database.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";
import { projectPluginSchemaInspector } from "./project-plugin-databases.js";
import { goalsHistoryPlatformExtension } from "./goal-context-history.js";

const path = "项目审批移交";
const integrityRefusal = () => new ActionError("actions.input_invalid", "原项目库与已审核的 Goals 库声明不符，项目库已保留");
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const originalCollection = "project_goals";
const transportTables = ["replica_state", "replica_changes", "replica_heads", "replica_outbox", "replica_conflicts", "replica_resolutions",
  "aggregate_editor_versions", "context"];
const originalManifest = () => goalsApprovalTransferManifest(builtinPluginByProjectKey("goals")!.manifest, GOALS_APPROVAL_TRANSFER_SOURCE);
const oldTransportTables = () => {
  const namespace = pluginSyncNamespace(originalManifest(), originalCollection);
  return transportTables.map(name => namespace + "_" + name);
};

function transfer(db: SqliteBaselineDatabase) {
  if (db.prepare("PRAGMA foreign_key_check").get()) throw integrityRefusal();
  const template = builtinPluginByProjectKey("goals")!.manifest;
  const ledger = listPluginProjectDatabases(db);
  const original = ledger.find(record => record.plugin_id === template.plugin_id);
  const lastSource = originalManifest();
  const oldNamespace = pluginSyncNamespace(lastSource, originalCollection);
  if (!original) {
    const present = new Set(projectPluginSchemaInspector.objects(db).map(object => object.name.toLowerCase()));
    if (GOALS_APPROVAL_TRANSFER_TABLES.some(table => present.has(table))
      || [...present].some(name => name.startsWith(oldNamespace + "_"))) throw integrityRefusal();
    return;
  }
  if (!isGoalsApprovalSource(original.version)) throw integrityRefusal();
  const manifest = original.version === GOALS_APPROVAL_TRANSFER_SOURCE ? lastSource : goalsApprovalTransferManifest(template, original.version);
  const declaration = manifest.databases!.project!;
  const owner = { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration };
  const extension = goalsHistoryPlatformExtension(manifest);
  const previous = inspectPluginProjectDatabase(db, owner, projectPluginSchemaInspector, path, extension);
  const triggers = sqliteBaselineTriggers(declaration.schema + extension.platformSchema, extension.platformPrelude);
  assertTransferObjects(db, previous.objects, triggers, oldNamespace, ledger.filter(row => row !== original).flatMap(row => row.objects));
  const roots = listProjectRoots(db);
  if (roots.length !== 1) throw integrityRefusal();
  const projectId = roots[0]!.project_id;
  const context = db.prepare(`SELECT project_id FROM ${oldNamespace}_context WHERE id = 1`).get() as { project_id: string | null } | undefined;
  if (!context || (context.project_id != null && context.project_id !== projectId)) throw integrityRefusal();
  // The library's version 4 holds Goals' v5 (batch 39); the 4→5 step takes it on from there (project-library-v5-upgrade.ts).
  const target = goalsApprovalTransferManifest(template, GOALS_V5_LIBRARY);
  const updated = { path, ...goalsHistoryPlatformExtension(target) };
  if (!updated.platformSchema) throw integrityRefusal();
  const targetOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  // Preserve the transport ledger verbatim in the pre-upgrade project snapshot, including its cursor, outbox and conflicts.
  for (const name of triggers.keys()) db.exec(`DROP TRIGGER ${quote(name)}`);
  for (const step of lastSource.databases!.project!.upgrades!) if (step.from >= original.version) db.exec(step.sql!);
  transferGoalsApprovalRecords(db, projectId, targetOwner, readGoalsApprovalTransfer(db, projectId, targetOwner));
  for (const table of GOALS_APPROVAL_TRANSFER_TABLES) db.exec(`DROP TABLE ${quote(table)}`);
  for (const table of oldTransportTables()) db.exec(`DROP TABLE ${quote(table)}`);
  db.exec(GOALS_APPROVAL_OUTCOMES_SQL);
  db.exec(updated.platformSchema);
  const nextNamespace = pluginSyncNamespace(target, originalCollection);
  db.prepare(`UPDATE ${nextNamespace}_context SET project_id=? WHERE id=1`).run(projectId);
  // Existing business rows are the first snapshot on the new stream, with no receipts copied from the old one.
  db.prepare(`INSERT INTO ${nextNamespace}_replica_changes(key) VALUES (?)`).run(JSON.stringify([projectId, originalCollection, projectId]));
  transferPluginProjectDatabase(db, previous, target.databases!.project!, projectPluginSchemaInspector, updated);
}

function assertTransferObjects(db: SqliteBaselineDatabase, original: readonly string[], triggers: ReadonlyMap<string, string>,
  namespace: string, otherOwners: readonly string[]) {
  const recorded = new Set(original.map(name => name.toLowerCase()));
  if (otherOwners.some(name => recorded.has(name.toLowerCase()))) throw integrityRefusal();
  // Inspect every trigger on a table this step can write or drop. Existing other owners are upgraded independently.
  const writable = new Set([...projectApprovalUpgradeReductions(), "plugin_project_databases", "goal_event_concerns", "goal_work_event_judgments",
    "goal_event_requirement_conclusions", "goal_event_config_versions"]);
  const allowed = new Set([...triggers.keys()].map(name => name.toLowerCase()));
  for (const object of projectPluginSchemaInspector.objects(db)) {
    const name = object.name.toLowerCase(), table = object.table.toLowerCase();
    if (name.startsWith(namespace + "_") && !recorded.has(name)
      || object.type === "trigger" && writable.has(table) && !allowed.has(name)) throw integrityRefusal();
  }
}

/** The project baseline includes all writes and the old plugin transport is dropped only in its own transaction. */
export const transferProjectApprovals: NonNullable<SqliteUpgradeStep["run"]> = transfer;

export function projectApprovalUpgradeReductions(): readonly string[] {
  return [...GOALS_APPROVAL_TRANSFER_TABLES, ...oldTransportTables(), ...originalManifest().databases!.project!.upgrades!.flatMap(step => step.reduces_rows ?? [])];
}
