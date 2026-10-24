import { mkdirSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { applySqliteBaseline, LocalSqliteStorage, type SqliteBaseline, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { IM_SCHEMA_SQL } from "./im/schema.js";
export type ServerDatabase = SqliteDatabase;
const SERVER_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS mw_server_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1), cookie_suffix TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mw_members(id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mw_sessions(id TEXT PRIMARY KEY, member_id TEXT REFERENCES mw_members(id),
      token_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS mw_projects(id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES mw_members(id), scope_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mw_access(project_id TEXT NOT NULL REFERENCES mw_projects(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(project_id,member_id));
    CREATE TABLE IF NOT EXISTS mw_codes(hash TEXT PRIMARY KEY, kind TEXT NOT NULL, member_id TEXT NOT NULL REFERENCES mw_members(id),
      project_id TEXT REFERENCES mw_projects(id), role TEXT, creator_session TEXT REFERENCES mw_sessions(id), expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS mw_commands(project_id TEXT NOT NULL REFERENCES mw_projects(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      command_id TEXT NOT NULL, request_json TEXT NOT NULL, result_json TEXT, state TEXT NOT NULL, error_code TEXT,
      PRIMARY KEY(project_id,member_id,command_id));
    CREATE TABLE IF NOT EXISTS mw_events(cursor INTEGER PRIMARY KEY AUTOINCREMENT, scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, thread_id TEXT);
    CREATE INDEX IF NOT EXISTS mw_events_scope ON mw_events(scope_kind,scope_id,cursor);
`;

/**
 * The server database as one current schema (repository-anti-corruption §4.1): identity and transport tables, then IM's.
 * A new database gets it with the version; one at another version is refused, never upgraded in place.
 */
export const SERVER_DATABASE_BASELINE: SqliteBaseline = { version: 2, schema: SERVER_SCHEMA_SQL + IM_SCHEMA_SQL };
const maintenanceErrors = defineErrorCodes("im.invite_maintenance", { pending: "unavailable" });

/** Public identity and transport facts only; never a replica of a private Home. */
export function openServerDatabase(directory: string): LocalSqliteStorage {
  if (existsSync(join(directory, ".invite-maintenance.json"))) throw maintenanceErrors.pending("邀请库维护尚未完成，请停止 Molis Work 并按维护记录恢复原件；不会创建或打开业务库");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const storage = new LocalSqliteStorage(join(directory, "server.sqlite"));
  try {
    chmodSync(storage.path, 0o600);
    applySqliteBaseline(storage.db, storage.path, SERVER_DATABASE_BASELINE);
    storage.db.exec("INSERT OR IGNORE INTO mw_server_identity VALUES (1,lower(hex(randomblob(8))))");
    return storage;
  } catch (error) { storage.close(); throw error; }
}
export function transaction<T>(db: ServerDatabase, operation: () => T): T { return db.transaction(operation).immediate(); }
