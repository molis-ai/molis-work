import type { PluginManifest, PluginProjectDatabase, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginStatementGuard, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { LocalSqliteStorage, type LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { pluginDatabaseClient, type PluginDatabaseConnection } from "./plugin-database-client.js";
import { projectJournalBinding, type ProjectJournalBinding } from "./plugin-project-journal.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isolatedProjectStatements } from "./plugin-project-isolation.js";
import { openPluginTables } from "./project-plugin-databases.js";
import { ProjectStatementProcess, type StatementLimits } from "./project-statement-process.js";

/** The Host's own connection to a project's library (better-sqlite3), and the file it is. */
export interface ProjectLibrary {
  readonly db: PluginDatabaseConnection & { readonly inTransaction?: boolean };
  readonly path: string;
  /**
   * What the project's journal needs of the Host (PG-094 S9-0): the project, the actor its plugins run as, and the storage package's
   * journal over `db`. Absent: the library has no journal, and a plugin's `journal` refuses every call.
   */
  readonly journal?: { readonly project_id: string; readonly actor_id: string; readonly writer: LocalSqliteJournal };
}

/**
 * A plugin's own tables in the project's library (`services.project_database`, specs/plugin-project-database §2.4). Its tables
 * are opened through the ledger when it starts (made the first time, checked against the record after; a refusal stops only this
 * plugin), and every statement is checked against that record before it runs (`pluginStatementGuard`); the rest of the rules are
 * the client's, the same as in the Home (`pluginDatabaseClient`).
 *
 * One SQLite library per file (PLIB-08): writes go through the Host's own connection, which a synchronous write body cannot
 * interleave with, and reads through a second, read-only connection of the same library. node:sqlite is never opened on the file:
 * two SQLite libraries in one process release each other's POSIX locks when either closes a connection.
 *
 * The client also carries the project's journal (`journal`): the events and idempotency records the storage package owns, which a
 * statement cannot reach. It is asked the same questions as a statement, and the plugin needs `PROJECT_JOURNAL_PERMISSION` for it.
 *
 * A plugin whose code the Host does not run in its own process (a sandboxed one) does not use this client: its statements run in a
 * process of their own that the Host kills when one runs too long or takes too much memory (`statements`). That
 * process opens the library with its own two connections (a different process, so PLIB-08's reason does not apply to it; WAL
 * lets it and the Host's connections share the file) and starts on its first statement.
 */
export function openPluginProjectLibrary(library: ProjectLibrary, manifest: PluginManifest, authorize: (permission: string) => void, instance: PluginInstance,
  statementLimits: Partial<StatementLimits> = {}): {
  client: PluginProjectDatabase; statements: PluginProjectStatements; reader: PluginDatabaseConnection; close(): void;
} {
  const declaration = manifest.databases?.project;
  if (!declaration) throw new Error(`插件 ${manifest.plugin_id} 没有声明项目库`);
  if (!library.path || library.path === ":memory:") throw new Error(`插件 ${manifest.plugin_id} 声明了项目库，但这个插件平台的项目库不是文件`);
  authorize("storage:private");
  const record = openPluginTables(library.db, library.path, manifest);
  const storage = new LocalSqliteStorage(library.path, { readonly: true });
  let closed = false;
  try {
    const reader: PluginDatabaseConnection = storage.db;
    const reads = pluginStatementGuard(reader, record), writes = pluginStatementGuard(library.db, record);
    const journal = library.journal
      ? projectJournalBinding({ ...library.journal, reader: storage }, authorize, instance, manifest.plugin_id) : noJournal;
    const client = pluginDatabaseClient({ reader, writer: library.db, inTransaction: () => library.db.inTransaction === true,
      check: (connection, sql, parameters, mode) => (connection === reader ? reads : writes)(sql, parameters, mode) }, declaration, authorize, instance, () => closed, journal);
    const processes = new ProjectStatementProcess(library.path, record, statementLimits);
    const statements = isolatedProjectStatements(processes, declaration, authorize, instance, () => closed);
    return { client, statements, reader, close() { if (!closed) { closed = true; processes.dispose(); storage.close(); } } };
  } catch (error) { storage.close(); throw error; }
}

const refused = () => { throw new ActionError("actions.service_unavailable", "这个项目库没有日志"); };
/** A library with no journal gives the plugin one whose every method says so, rather than none: the type has it. */
const noJournal: ProjectJournalBinding = {
  reader: () => ({ eventCursor: refused, readEventsDescending: refused }),
  writer: () => Object.freeze({ eventCursor: refused, readEventsDescending: refused, appendEvent: refused, getIdempotency: refused, putIdempotency: refused }),
};
