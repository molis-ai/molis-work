import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CONTEXT_LEDGER_SCHEMA } from "@molis-ai/molis-work-module-context-ledger";
import { replicaMarkSql } from "@molis-ai/molis-work-storage";
import { pluginSyncNamespace } from "./plugin-sync-database.js";
import { projectPluginPlatformExtension } from "./project-plugin-databases.js";

/**
 * Before batch 44, Goals' sync collection carried the relations touching a Goal in a platform section named `goal-context`, which chose
 * an edge by `module = 'goals'` on either end. Neither the name nor that value is a contract value now (batch 44, C6: `relation-edges`),
 * but the project library's upgrade chain still meets the triggers it left in versions 1 to 4, and checks them by their exact text.
 * This is that text, for those steps only. Delete with them: when the earliest supported golden holds project library version 5.
 */
function goalsV5ContextTriggers(manifest: PluginManifest, collectionId: string): string {
  const collection = manifest.sync?.collections.find(row => row.id === collectionId);
  if (!collection?.sections) throw new Error(`the collection ${collectionId} declares no sections`);
  const namespace = pluginSyncNamespace(manifest, collectionId);
  const mark = (project: string) => replicaMarkSql(`json_array(${project},'${collection.sections!.kind}',${project})`).replace(/\breplica_/gu, namespace + "_replica_");
  let sql = "";
  for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    const row = operation === "DELETE" ? "OLD" : "NEW";
    sql += `CREATE TRIGGER ${namespace}_context_${operation.toLowerCase()} ${operation === "DELETE" ? "BEFORE" : "AFTER"} ${operation} ON context_edges WHEN ${row}.scope_kind='personal' AND (json_extract(${row}.source_json,'$.module')='goals' OR json_extract(${row}.target_json,'$.module')='goals') BEGIN ${mark(row + ".scope_id")} END;\n`;
  }
  return sql;
}

/**
 * The platform's statements around one of Goals' former libraries (v1 to v5, from `goalsApprovalTransferManifest`), as the Host compiled
 * them then: today's compilation of the frozen declaration, with the `goal-context` triggers it no longer makes, and the ledger's tables
 * those triggers stand on.
 */
export function goalsHistoryPlatformExtension(manifest: PluginManifest): { platformSchema: string; platformPrelude: string } {
  const current = projectPluginPlatformExtension(manifest);
  if (!current.platformSchema) throw new Error("a former Goals library declares no sync collection");
  return { platformSchema: current.platformSchema + "\n" + goalsV5ContextTriggers(manifest, "project_goals"),
    platformPrelude: (current.platformPrelude ?? "") + CONTEXT_LEDGER_SCHEMA };
}
