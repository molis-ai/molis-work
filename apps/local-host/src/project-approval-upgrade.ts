import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { inspectPluginProjectDatabase, listPluginProjectDatabases, transferPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { PROJECT_APPROVALS_SCHEMA_SQL, transferGoalsApprovalRecords } from "@molis-ai/molis-work-service-project-approvals";
import { sqliteBaselineTriggers, type SqliteBaselineDatabase, type SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { GOALS_APPROVAL_OUTCOMES_SQL, GOALS_APPROVAL_TRANSFER_TABLES, goalsApprovalTransferManifest, readGoalsApprovalTransfer } from "./goal-callers.js";
import { pluginSyncNamespace } from "./plugin-sync-database.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";
import { projectPluginPlatformExtension, projectPluginSchemaInspector } from "./project-plugin-databases.js";

const path = "项目审批移交";
const integrityRefusal = () => new ActionError("actions.input_invalid", "原项目库与已审核的 Goals 库声明不符，项目库已保留");
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const originalCollection = "project_goals";
const transportTables = ["replica_state", "replica_changes", "replica_heads", "replica_outbox", "replica_conflicts", "replica_resolutions",
  "aggregate_editor_versions", "context"];
const originalManifest = () => goalsApprovalTransferManifest(builtinPluginByProjectKey("goals")!.manifest, 3);
const oldTransportTables = () => {
  const namespace = pluginSyncNamespace(originalManifest(), originalCollection);
  return transportTables.map(name => namespace + "_" + name);
};

function transfer(db: SqliteBaselineDatabase) {
  if (db.prepare("PRAGMA foreign_key_check").get()) throw integrityRefusal();
  const template = builtinPluginByProjectKey("goals")!.manifest;
  const ledger = listPluginProjectDatabases(db);
  const original = ledger.find(record => record.plugin_id === template.plugin_id);
  const version3 = originalManifest();
  const oldNamespace = pluginSyncNamespace(version3, originalCollection);
  if (!original) {
    const present = new Set(projectPluginSchemaInspector.objects(db).map(object => object.name.toLowerCase()));
    if (GOALS_APPROVAL_TRANSFER_TABLES.some(table => present.has(table))
      || [...present].some(name => name.startsWith(oldNamespace + "_"))) throw integrityRefusal();
    db.exec(PROJECT_APPROVALS_SCHEMA_SQL);
    return;
  }
  if (original.version !== 2 && original.version !== 3) throw integrityRefusal();
  const manifest = original.version === 3 ? version3 : goalsApprovalTransferManifest(template, 2);
  const declaration = manifest.databases!.project!;
  const owner = { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration };
  const extension = projectPluginPlatformExtension(manifest);
  const previous = inspectPluginProjectDatabase(db, owner, projectPluginSchemaInspector, path, extension);
  const triggers = sqliteBaselineTriggers(declaration.schema + extension.platformSchema, extension.platformPrelude);
  assertTransferObjects(db, previous.objects, triggers, oldNamespace, ledger.filter(row => row !== original).flatMap(row => row.objects));
  const roots = listProjectRoots(db);
  if (roots.length !== 1) throw integrityRefusal();
  const projectId = roots[0]!.project_id;
  const context = db.prepare(`SELECT project_id FROM ${oldNamespace}_context WHERE id = 1`).get() as { project_id: string | null } | undefined;
  if (!context || (context.project_id != null && context.project_id !== projectId)) throw integrityRefusal();
  const target = goalsApprovalTransferManifest(template, 4);
  const updated = { path, ...projectPluginPlatformExtension(target) };
  if (!updated.platformSchema) throw integrityRefusal();
  const targetOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  db.exec(PROJECT_APPROVALS_SCHEMA_SQL);
  transferGoalsApprovalRecords(db, projectId, targetOwner, readGoalsApprovalTransfer(db, projectId, targetOwner));

  // Preserve the transport ledger verbatim in the pre-upgrade project snapshot, including its cursor, outbox and conflicts.
  for (const name of triggers.keys()) db.exec(`DROP TRIGGER ${quote(name)}`);
  if (original.version === 2) db.exec(version3.databases!.project!.upgrades!.find(step => step.from === 2)!.sql!);
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
  const writable = new Set([...GOALS_APPROVAL_TRANSFER_TABLES, ...oldTransportTables(), "plugin_project_databases", "goal_event_concerns"]);
  const allowed = new Set([...triggers.keys()].map(name => name.toLowerCase()));
  for (const object of projectPluginSchemaInspector.objects(db)) {
    const name = object.name.toLowerCase(), table = object.table.toLowerCase();
    if (name.startsWith(namespace + "_") && !recorded.has(name)
      || object.type === "trigger" && writable.has(table) && !allowed.has(name)) throw integrityRefusal();
  }
}

export const projectApprovalUpgrade: SqliteUpgradeStep = {
  from: 3, run: transfer,
  get reduces_rows() { return [...GOALS_APPROVAL_TRANSFER_TABLES, ...oldTransportTables()]; },
};
