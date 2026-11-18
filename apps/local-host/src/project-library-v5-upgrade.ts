import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { rebuildInboxEntries } from "@molis-ai/molis-work-module-attention-resumption";
import { rewriteStoredContextEdges } from "@molis-ai/molis-work-module-context-ledger";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { inspectPluginProjectDatabase, listPluginProjectDatabases, transferPluginProjectDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { sqliteBaselineTriggers, type SqliteBaselineDatabase, type SqliteUpgradeStep } from "@molis-ai/molis-work-storage";
import { GOALS_V5_LIBRARY, goalsApprovalTransferManifest } from "./goal-callers.js";
import { goalsHistoryPlatformExtension } from "./goal-context-history.js";
import { pluginSyncNamespace } from "./plugin-sync-database.js";
import { builtinPluginByProjectKey } from "./plugin-registry.js";
import { projectPluginPlatformExtension, projectPluginSchemaInspector } from "./project-plugin-databases.js";

/*
 * The project library's 4→5 step (batch 44, `docs/system/CONTRACT-CHANGES.md` 「第 44 批存量搬迁」 D1, D3; user 2026-11-17): what the
 * platform's contracts stopped naming leaves the stored rows in the same transaction.
 * - D3: an Inbox entry's subject type and reason are its owner's declared words, so `inbox_entries` loses the two CHECKs that listed
 *   them. The rows, their indexes and the triggers on the table are kept as they were.
 * - D1: a relation's end that said `module: "goals"` or `"feed"` names the plugin object it is (`plugins`, with its kind and plugin), and
 *   Goals' sync collection carries those relations as the generic `relation-edges` (`project_goals@3`, Goals' library v6). The old
 *   collection's transport (cursor, outbox, conflicts) stays only in the pre-upgrade snapshot; the business rows are the first snapshot
 *   of the new stream, as in batch 39's step.
 * Delete with the project library's version-4 golden support.
 */

const path = "项目库 4→5";
const refusal = () => new ActionError("actions.input_invalid", "项目库与第 4 版的登记不符，项目库已保留");
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const COLLECTION = "project_goals";
const TRANSPORT_TABLES = ["replica_state", "replica_changes", "replica_heads", "replica_outbox", "replica_conflicts", "replica_resolutions",
  "aggregate_editor_versions", "context"];
/** Every module a version-4 relation could name. */
const VERSION_4_MODULES = new Set(["goals", "artifacts", "feed", "private-work-context", "projects", "assistant", "plugins", "agent-host"]);

const goalsTemplate = () => builtinPluginByProjectKey("goals")!.manifest;
const goalsV5 = () => goalsApprovalTransferManifest(goalsTemplate(), GOALS_V5_LIBRARY);
const oldTransportTables = () => {
  const namespace = pluginSyncNamespace(goalsV5(), COLLECTION);
  return TRANSPORT_TABLES.map(name => namespace + "_" + name);
};

/** The plugin objects the two former modules were: a Goal of Goals, an item of Feed. */
function formerOwners(): ReadonlyMap<string, { readonly plugin_id: string; readonly object_type: string }> {
  return new Map([
    ["goals", { plugin_id: goalsTemplate().plugin_id, object_type: "goal" }],
    ["feed", { plugin_id: builtinPluginByProjectKey("feed")!.manifest.plugin_id, object_type: "feed_item" }],
  ]);
}

function rewriteRef(ref: ObjectRef & { module: string }, owners: ReturnType<typeof formerOwners>): ObjectRef | null {
  if (!VERSION_4_MODULES.has(ref.module) || ref.plugin_id !== undefined) throw refusal();
  const owner = owners.get(ref.module);
  if (!owner) return null;
  if (ref.object_type !== undefined && ref.object_type !== owner.object_type) throw refusal();
  return { ...ref, module: "plugins", object_type: owner.object_type, plugin_id: owner.plugin_id };
}

function rewriteRelations(db: SqliteBaselineDatabase): void {
  const owners = formerOwners();
  rewriteStoredContextEdges(db, edge => {
    const source = rewriteRef(JSON.parse(edge.source_json) as ObjectRef & { module: string }, owners);
    const target = rewriteRef(JSON.parse(edge.target_json) as ObjectRef & { module: string }, owners);
    return source || target ? { ...(source ? { source_json: JSON.stringify(source) } : {}), ...(target ? { target_json: JSON.stringify(target) } : {}) } : null;
  });
}

/** Goals' v5 library and its `project_goals@2` collection, verified and taken apart; what to build of v6 once the relations are rewritten. */
function takeGoalsApart(db: SqliteBaselineDatabase): (() => void) | undefined {
  const source = goalsV5(), oldNamespace = pluginSyncNamespace(source, COLLECTION);
  const ledger = listPluginProjectDatabases(db), original = ledger.find(record => record.plugin_id === source.plugin_id);
  const contextTriggers = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'context_edges'").all() as Array<{ name: string }>).map(row => row.name.toLowerCase());
  if (!original) {
    const present = projectPluginSchemaInspector.objects(db).map(object => object.name.toLowerCase());
    if (present.some(name => name.startsWith(oldNamespace + "_")) || contextTriggers.length) throw refusal();
    return undefined;
  }
  if (original.version !== GOALS_V5_LIBRARY) throw refusal();
  const declaration = source.databases!.project!;
  const owner = { plugin_id: source.plugin_id, publisher_signature: source.publisher.signature, declaration };
  const extension = goalsHistoryPlatformExtension(source);
  const previous = inspectPluginProjectDatabase(db, owner, projectPluginSchemaInspector, path, extension);
  const triggers = sqliteBaselineTriggers(declaration.schema + extension.platformSchema, extension.platformPrelude);
  const known = new Set([...triggers.keys()].map(name => name.toLowerCase()));
  // Any other trigger on the relations would see them rewritten without knowing it: refuse rather than guess its owner.
  if (contextTriggers.some(name => !known.has(name))) throw refusal();
  const roots = listProjectRoots(db);
  if (roots.length !== 1) throw refusal();
  const projectId = roots[0]!.project_id;
  const context = db.prepare(`SELECT project_id FROM ${quote(oldNamespace + "_context")} WHERE id = 1`).get() as { project_id: string | null } | undefined;
  if (!context || (context.project_id != null && context.project_id !== projectId)) throw refusal();
  for (const name of triggers.keys()) db.exec(`DROP TRIGGER ${quote(name)}`);
  for (const table of oldTransportTables()) db.exec(`DROP TABLE ${quote(table)}`);
  return () => {
    const target = goalsTemplate(), updated = { path, ...projectPluginPlatformExtension(target) };
    if (!updated.platformSchema) throw refusal();
    db.exec(updated.platformSchema);
    const nextNamespace = pluginSyncNamespace(target, COLLECTION);
    db.prepare(`UPDATE ${quote(nextNamespace + "_context")} SET project_id = ? WHERE id = 1`).run(projectId);
    // Existing business rows are the first snapshot on the new stream, with no receipts copied from the old one.
    db.prepare(`INSERT INTO ${quote(nextNamespace + "_replica_changes")}(key) VALUES (?)`).run(JSON.stringify([projectId, COLLECTION, projectId]));
    transferPluginProjectDatabase(db, previous, target.databases!.project!, projectPluginSchemaInspector, updated);
  };
}

function upgrade(db: SqliteBaselineDatabase): void {
  if (db.prepare("PRAGMA foreign_key_check").get()) throw refusal();
  rebuildInboxEntries(db);
  const rebuildGoals = takeGoalsApart(db);
  rewriteRelations(db);
  rebuildGoals?.();
}

/** The 4→5 step's run: one transaction with the library's version mark; foreign keys are off for the Inbox table's rebuild. */
export const projectLibraryV5Upgrade: Pick<SqliteUpgradeStep, "run" | "rebuilds_tables" | "reduces_rows"> = {
  run: upgrade,
  rebuilds_tables: true,
  get reduces_rows() { return oldTransportTables(); },
};
