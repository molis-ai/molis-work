import type { AgentSessionOwner, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_PLUGIN_ID, type AssistantSessionPurgeSelection } from "@molis-ai/molis-work-contracts/services/assistant";
import type { CodingSessionPurgeSelection } from "@molis-ai/molis-work-contracts/modules/coding";
import type { PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { CODING_PLUGIN_ID, codingManifest, prepareCodingSessionPurge, clearCodingSessionPurge, verifyCodingSessionPurge } from "@molis-ai/molis-work-plugin-coding";
import { existingPluginPrivateKeys, inspectExistingPluginProjectDatabase, readPluginRuntimeRecords, pluginStatementGuard,
  type PluginProjectSchemaInspector } from "@molis-ai/molis-work-plugin-runtime";
import { listProjectRoots } from "@molis-ai/molis-work-module-projects";
import { describeSqliteSchema, listSqliteObjects, LocalSqliteStorage, homeSqlitePath, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME } from "./assistant/assistant-store.js";
import { prepareAssistantSessionPurge, clearAssistantSessionPurge, verifyAssistantSessionPurge } from "./assistant/assistant-session-purge.js";
import { SessionBusinessDatabases } from "./session-business-database.js";

export type SessionBusinessPurgeSelection = { readonly kind: "coding"; readonly selection: CodingSessionPurgeSelection }
  | { readonly kind: "assistant"; readonly selection: AssistantSessionPurgeSelection };
type Binding = { readonly session: AgentSessionRef; readonly owner: AgentSessionOwner };
export interface SessionBusinessPurgeInput {
  readonly homeDirectory: string;
  /** The original Home recovery owner/adopting guard; synchronous and checked again after the write lock. */
  assertCurrent(): void;
  /** Resolve through the trusted current Catalog, never from a Work id or Plugin input. */
  projectDatabase(projectId: string): { readonly path: string; assertCurrent(): void };
}
export interface SessionBusinessPurgeOwner {
  /** The parent persists this selection, including original wait ids, before SDK deletion. */
  prepare(input: Binding & { readonly wait_ids: readonly string[] }): Promise<SessionBusinessPurgeSelection>;
  clear(original: SessionBusinessPurgeSelection): Promise<void>;
  verifyOriginal(original: SessionBusinessPurgeSelection): Promise<void>;
  close(): Promise<void>;
}
const conflict = () => new ActionError("agent.session_busy", "原业务会话归属或安装代已变化，保留原决定核对");
const inspector: PluginProjectSchemaInspector = { scratch: () => new LocalSqliteStorage(":memory:").db,
  objects: db => listSqliteObjects(db), shape: db => describeSqliteSchema(db) };

/** Cold owner composition: no Runtime, Plugin activation, schema initialization, or project purge. */
export function createSessionBusinessPurgeOwner(input: SessionBusinessPurgeInput): SessionBusinessPurgeOwner {
  const resources = new SessionBusinessDatabases(() => input.assertCurrent());
  const assistant = <T>(write: boolean, work: (db: SqliteDatabase, current: () => void) => T, absent: () => T) =>
    resources.withDatabase(homeSqlitePath(input.homeDirectory, ASSISTANT_STORE_NAME), ASSISTANT_STORE_BASELINE, false, write, work, absent);
  const coding = <T>(binding: Binding, write: boolean, generation: string | undefined,
    work: (db: PluginDatabaseTransaction, storage: ReturnType<typeof privateKeys>, current: () => void, generation: string) => T): T => {
    resources.current(); const location = input.projectDatabase(binding.owner.project_id); resources.current(() => location.assertCurrent());
    return resources.withDatabase(location.path, PROJECT_DATABASE_BASELINE, true, write, (db, live) => {
      const initial = installation(db, binding), expected = generation ?? initial.installation_generation;
      const current = () => { live(); resources.current(() => location.assertCurrent()); if (installation(db, binding).installation_generation !== expected) throw conflict(); };
      current();
      const declaration = codingManifest.databases?.project; if (!declaration) throw conflict();
      const record = inspectExistingPluginProjectDatabase(db, { plugin_id: CODING_PLUGIN_ID, publisher_signature: codingManifest.publisher.signature, declaration }, inspector, { path: location.path });
      const guard = pluginStatementGuard(db, record);
      const scoped: PluginDatabaseTransaction = {
        get(sql, values = []) { current(); guard(sql, values, "read"); return db.prepare(sql).get(...values) as PluginSqlRow | undefined ?? null; },
        all(sql, values = []) { current(); guard(sql, values, "read"); return db.prepare(sql).all(...values) as PluginSqlRow[]; },
        run(sql, values = []) { current(); if (!write || !db.inTransaction) throw conflict(); guard(sql, values, "write"); return db.prepare(sql).run(...values); },
      };
      return work(scoped, privateKeys(db, binding.owner.install_id, current), current, expected);
    }, () => { throw conflict(); });
  };
  return {
    async prepare(binding) {
      resources.current();
      if (binding.owner.plugin_id === CODING_PLUGIN_ID) return { kind: "coding", selection: coding(binding, false, undefined,
        (db, storage, _current, installation_generation) => prepareCodingSessionPurge(db, { session: binding.session, owner: binding.owner, installation_generation }, storage.keys(), binding.wait_ids)) };
      if (binding.owner.plugin_id === ASSISTANT_PLUGIN_ID) return { kind: "assistant", selection: assistant(false,
        db => prepareAssistantSessionPurge(db, binding), () => prepareAssistantSessionPurge(undefined, binding)) };
      throw conflict();
    },
    async clear(original) {
      resources.current();
      if (original.kind === "coding") coding(original.selection, true, original.selection.installation_generation,
        (db, storage, current) => clearCodingSessionPurge(db, original.selection, storage, current));
      else if (original.kind === "assistant") assistant(true, (db, current) => clearAssistantSessionPurge(db, original.selection, current), () => undefined);
      else throw conflict();
    },
    async verifyOriginal(original) {
      resources.current();
      if (original.kind === "coding") coding(original.selection, false, original.selection.installation_generation,
        (db, storage) => verifyCodingSessionPurge(db, original.selection, storage));
      else if (original.kind === "assistant") assistant(false, db => verifyAssistantSessionPurge(db, original.selection), () => undefined);
      else throw conflict();
    },
    close: () => resources.close(),
  };
}
function installation(db: SqliteDatabase, binding: Binding) {
  const roots = listProjectRoots(db);
  if (roots.length !== 1 || roots[0]?.project_id !== binding.owner.project_id || binding.owner.plugin_id !== CODING_PLUGIN_ID || !binding.owner.actor_id) throw conflict();
  const matches = readPluginRuntimeRecords(db).filter(record => record.install_id === binding.owner.install_id);
  const found = matches[0];
  if (matches.length !== 1 || !found || found.plugin_id !== CODING_PLUGIN_ID || found.publisher_signature !== codingManifest.publisher.signature
    || typeof found.installation_generation !== "string" || !found.installation_generation) throw conflict();
  return found;
}
function privateKeys(db: SqliteDatabase, installId: string, current: () => void) {
  const owner = existingPluginPrivateKeys(db);
  return { keys: () => owner.keys(installId), clear: (keys: readonly string[]) => owner.clear(installId, keys, current),
    verifyAbsent: (keys: readonly string[]) => owner.verifyAbsent(installId, keys) };
}
