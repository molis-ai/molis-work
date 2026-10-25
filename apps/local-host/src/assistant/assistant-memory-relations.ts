import { existsSync, realpathSync } from "node:fs";
import { homeSqlitePath, openReadOnlyHomeSqlite, describeSqliteSchema, describeSqliteBaseline, inspectExistingSqlitePath, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME } from "./assistant-store.js";
import type { AgentSessionOwner, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { readAssistantProjectSessions } from "./assistant-project-purge.js";

const invalid = () => Object.assign(new Error("助理保留的角色归属无法确认"), { code: "memory.conflict" });
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
type Database = ReturnType<typeof openReadOnlyHomeSqlite>;
export interface AssistantMemoryRelation { readonly project_id: string; readonly subject: string }
export interface AssistantMemoryRelationsReader {
  read(): AssistantMemoryRelation[];
  /** Every retained Work association, including archived Works; the Session keeps its original owner. */
  projectSessions(projectId: string): Array<{ session: AgentSessionRef; owner: AgentSessionOwner }>;
  /** Permanently stops reads; a failed close retries only this original connection. */
  close(): void;
}

function assertSchema(db: Database, filename: string): void {
  const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (version !== ASSISTANT_STORE_BASELINE.version) throw new SqliteSchemaVersionError(filename, version, ASSISTANT_STORE_BASELINE.version);
  if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(ASSISTANT_STORE_BASELINE))) throw invalid();
}

/** Same persisted Work supplies both facts, including archived Works. Historical Rounds never supply its project. */
function readRelations(db: Database): AssistantMemoryRelation[] {
  return db.prepare(`SELECT work_id, actor_id, json_extract(body,'$.work_id') AS body_id, json_extract(body,'$.actor_id') AS body_actor,
    json_extract(body,'$.scope.kind') AS scope, json_extract(body,'$.scope.project_id') AS scope_project,
    json_extract(body,'$.project_ref.project_id') AS project_id, json_extract(body,'$.character.artifact_id') AS subject,
    json_extract(body,'$.character.version') AS version, json_type(body,'$.character') AS character_type
    FROM assistant_works WHERE json_type(body,'$.character') IS NOT NULL`).all().map(row => {
      if (!text(row.work_id) || row.body_id !== row.work_id || row.body_actor !== row.actor_id || row.actor_id !== LOCAL_PERSON_ACTOR_ID
        || row.character_type !== "object" || row.scope !== "project" || !text(row.project_id) || row.scope_project !== row.project_id
        || !text(row.subject) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw invalid();
      return { project_id: row.project_id, subject: row.subject };
    });
}

/** A known original reader's failure exposes only its close capability, never a database or a replay. */
function closeReader(reader: Pick<AssistantMemoryRelationsReader, "close">, failure?: { error: unknown }): void {
  try { reader.close(); }
  catch (error) {
    const reason = failure ? failure.error : error;
    const retained = new AggregateError(failure ? [failure.error, error] : [error], "助理归属读取收尾失败；可明确重试关闭原连接", { cause: reason });
    const code = reason instanceof Error ? Object.getOwnPropertyDescriptor(reason, "code") : undefined;
    if (typeof code?.value === "string") Object.defineProperty(retained, "code", { value: code.value });
    Object.defineProperty(retained, "close", { value: async () => { reader.close(); } });
    throw retained;
  }
}

/** MEM-40-FRAME-06: existing-only owner read with physical binding; authority cannot prevent disposal. */
export function openAssistantMemoryRelations(input: {
  readonly homeDirectory: string; readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}): AssistantMemoryRelationsReader {
  const { homeDirectory, assertCurrent, signal } = input, filename = homeSqlitePath(homeDirectory, ASSISTANT_STORE_NAME);
  const files = inspectExistingSqlitePath(filename);
  let closed = false, db: Database | undefined;
  const current = () => {
    if (closed) throw invalid();
    signal?.throwIfAborted(); files.assertCurrent();
    const result: unknown = assertCurrent();
    if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); throw invalid(); }
    signal?.throwIfAborted(); files.assertCurrent();
    if (closed) throw invalid();
  };
  const close = () => { closed = true; if (db?.isOpen) db.close(); };
  try {
    current();
    if (files.exists) {
      db = openReadOnlyHomeSqlite(homeDirectory, ASSISTANT_STORE_NAME);
      current(); assertSchema(db, filename); current();
    }
  } catch (error) { closeReader({ close }, { error }); throw error; }
  const read = <T>(query: (connection: Database) => T[]): T[] => {
    current();
    if (!db) { current(); return []; }
    db.exec("BEGIN");
    try {
      current(); assertSchema(db, filename);
      const result = query(db);
      current(); return result;
    } finally { if (db.isOpen) db.exec("ROLLBACK"); }
  };
  return { read: () => read(readRelations), projectSessions: projectId => {
    if (!text(projectId)) throw invalid();
    return read(db => readAssistantProjectSessions(db, projectId));
  }, close };
}

/** The existing online convenience read shares the decoder and closes its own temporary reader. */
export function assistantMemoryRelations(home: string): AssistantMemoryRelation[] {
  if (!existsSync(home)) return [];
  const reader = openAssistantMemoryRelations({ homeDirectory: realpathSync(home), assertCurrent() {} });
  let failure: { error: unknown } | undefined;
  try { return reader.read(); }
  catch (error) { failure = { error }; throw error; }
  finally { closeReader(reader, failure); }
}
