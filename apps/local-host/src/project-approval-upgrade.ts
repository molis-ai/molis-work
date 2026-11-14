import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { inspectPluginProjectDatabase, listPluginProjectDatabases, transferPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { PROJECT_APPROVALS_SCHEMA_SQL, transferGoalsApprovalRecords } from "@molis-ai/molis-work-service-project-approvals";
import { sqliteBaselineTriggers, type SqliteBaselineDatabase, type SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { GOALS_APPROVAL_TRANSFER_TABLES, goalsManifestAfterApprovalTransfer, readGoalsApprovalTransfer } from "./goal-callers.js";
import { pluginSyncNamespace } from "./plugin-sync-database.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";
import { projectPluginPlatformExtension, projectPluginSchemaInspector } from "./project-plugin-databases.js";

const path = "项目审批移交";
const integrityRefusal = () => new ActionError("actions.input_invalid", "原项目库与已审核的 Goals 库声明不符，项目库已保留");
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';

function transfer(db: SqliteBaselineDatabase) {
  const manifest = builtinPluginByProjectKey("goals")!.manifest;
  const declaration = manifest.databases!.project!;
  const owner = { plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, declaration };
  const original = listPluginProjectDatabases(db).find(record => record.plugin_id === owner.plugin_id);
  const extension = projectPluginPlatformExtension(manifest);
  const present = new Set(projectPluginSchemaInspector.objects(db).map(object => object.name.toLowerCase()));
  const oldNamespace = pluginSyncNamespace(manifest, "project_goals");
  if (!original) {
    if (GOALS_APPROVAL_TRANSFER_TABLES.some(table => present.has(table))
      || [...present].some(name => name.startsWith(oldNamespace + "_"))) throw integrityRefusal();
    return;
  }
  if (declaration.version !== 2) throw integrityRefusal();
  const previous = inspectPluginProjectDatabase(db, owner, projectPluginSchemaInspector, path, extension);
  const roots = listProjectRoots(db);
  if (roots.length !== 1) throw integrityRefusal();
  const projectId = roots[0]!.project_id;
  const context = db.prepare(`SELECT project_id FROM ${oldNamespace}_context WHERE id = 1`).get() as { project_id: string | null } | undefined;
  if (!context || (context.project_id != null && context.project_id !== projectId)) throw integrityRefusal();
  const target = goalsManifestAfterApprovalTransfer(manifest);
  const updated = { path, ...projectPluginPlatformExtension(target) };
  const targetOwner = { kind: "plugin", plugin_id: owner.plugin_id, publisher_signature: owner.publisher_signature } as const;
  transferGoalsApprovalRecords(db, projectId, targetOwner, readGoalsApprovalTransfer(db, projectId, targetOwner));

  // Preserve the old transport ledger rows as recovery evidence and retire its executable SQLite objects.
  const triggers = sqliteBaselineTriggers(declaration.schema + extension.platformSchema, extension.platformPrelude);
  for (const name of triggers.keys()) db.exec(`DROP TRIGGER ${quote(name)}`);
  for (const table of GOALS_APPROVAL_TRANSFER_TABLES) db.exec(`DROP TABLE ${quote(table)}`);
  db.exec(updated.platformSchema);
  transferPluginProjectDatabase(db, previous, target.databases!.project!, projectPluginSchemaInspector, updated);
}

export const projectApprovalUpgrade: SqliteUpgradeStep = {
  from: 3, sql: PROJECT_APPROVALS_SCHEMA_SQL, run: transfer, reduces_rows: GOALS_APPROVAL_TRANSFER_TABLES,
};
