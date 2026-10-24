/**
 * SQL over a plugin's own tables, in the Home (`services.database`) or in the project's library (`services.project_database`). The
 * Host owns the connections and checks every call: reads only through a read-only connection, writes only inside `transaction`.
 */
export type PluginSqlValue = string | number | bigint | Uint8Array | null;
export type PluginSqlRow = Record<string, PluginSqlValue>;

export interface PluginDatabaseReader {
  get(sql: string, parameters?: readonly PluginSqlValue[]): PluginSqlRow | null;
  all(sql: string, parameters?: readonly PluginSqlValue[]): PluginSqlRow[];
}

/**
 * The handle through which the scheduler joins the plugin's current write transaction. The platform checks the exact library,
 * activation and live transaction; a retained or copied handle cannot start another write.
 */
export interface PluginDatabaseTransaction extends PluginDatabaseReader {
  run(sql: string, parameters?: readonly PluginSqlValue[]): { changes: number | bigint };
}

export interface PluginDatabase extends PluginDatabaseReader {
  /** Wait for current action authority, then run one synchronous transaction. Async bodies are rejected and rolled back. */
  transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T>;
}

/** A statement as a plugin the Host does not run in its own process sends it: text and parameters, nothing a channel cannot carry. */
export interface PluginProjectStatement {
  readonly sql: string;
  readonly parameters: readonly (null | number | string)[];
}
export type PluginProjectRow = Record<string, null | number | string>;

/**
 * SQL over a plugin's own tables in the project's library for a plugin whose code the Host does not run in its own process
 * (`execution: "sandbox"`; `services.project_statements`, in place of `services.project_database`). The statements run in a process
 * whose controller kills it when one runs too long or takes too much memory (`plugin.project_database.statement_timeout`, `.statement_memory`),
 * never on the Host's thread, and each call makes the checks `PluginDatabase` makes. `get` and `all` give at most `limits.bytes`
 * bytes, and `all` at most `limits.rows` rows (more is `plugin.project_database.result_too_large`). A transaction is all of its statements or none:
 * `beforeEffect` runs before it begins; signal and authority are checked before each statement and before COMMIT.
 * An interruption before COMMIT rolls back; interruption while COMMIT is in flight has an unknown outcome and must not be retried automatically.
 */
export interface PluginProjectStatements {
  get(sql: string, parameters: readonly (null | number | string)[], limits: { readonly bytes: number }, signal: AbortSignal): Promise<PluginProjectRow | null>;
  all(sql: string, parameters: readonly (null | number | string)[], limits: { readonly rows: number; readonly bytes: number }, signal: AbortSignal): Promise<PluginProjectRow[]>;
  transaction(beforeEffect: () => Promise<void>, statements: readonly PluginProjectStatement[], signal: AbortSignal): Promise<Array<{ changes: number }>>;
}

/**
 * The permission under which a plugin reaches the project's domain journal (`services.project_database.journal`, PG-094 S9-0): the
 * project's event log and the idempotency records of its actions. The two tables belong to the storage package, not to a plugin's
 * own declaration, so the statement-checked client above refuses them; this is the port that does not.
 */
export const PROJECT_JOURNAL_PERMISSION = "journal:project";

export interface PluginJournalEvent {
  readonly seq: number;
  readonly event_id: string;
  readonly actor_id: string;
  readonly type: string;
  readonly object_type: string;
  readonly object_id: string;
  readonly reason: string;
  readonly payload: unknown;
  readonly at: string;
}

/**
 * An event to append. The project is the library's, never the plugin's to name; `actorId` must be the original caller's (see
 * `PluginJournalWriter`). `type` and `objectType` are the plugin's own bare names: the platform stores them under the plugin's id
 * and gives them back bare, and nothing the plugin passes can name another owner's part of the log.
 */
export interface PluginJournalAppend {
  readonly eventId: string;
  readonly actorId: string;
  readonly type: string;
  readonly objectType: string;
  readonly objectId: string;
  readonly reason: string;
  readonly payload: unknown;
  readonly at: string;
}

export interface PluginIdempotencyRecord {
  readonly request_hash: string;
  readonly outcome: unknown;
}

export interface PluginIdempotencyPut {
  readonly actorId: string;
  /** The plugin's own bare operation name: stored under the plugin's id, so two owners using the same name never meet in one record. */
  readonly operation: string;
  readonly key: string;
  readonly requestHash: string;
  readonly outcome: unknown;
  readonly at: string;
}

/**
 * What a read of the journal shows: this plugin's own events in the project, newest first, and where its log ends. The journal is
 * shared by every owner of the project, but an owner reads and counts only what it wrote; whoever needs another owner's events asks
 * that owner's action.
 */
export interface PluginJournalReader {
  eventCursor(objectType?: string): number;
  readEventsDescending(): PluginJournalEvent[];
}

/**
 * The journal inside a write transaction, which is the only place it is written: an event or an idempotency record lands in
 * the same SQLite transaction as the plugin's own rows, or not at all. Every call asks the grants (`PROJECT_JOURNAL_PERMISSION`) and
 * the original caller again, like a statement does, so a call cancelled or revoked before it writes nothing here either (S-63).
 * The actor of an event or a record is the actor of the call the plugin runs in (its `actor_id` or `audit_actor_id`); outside every
 * call, the one the Host runs the project's plugins as. Any other actor is refused.
 */
export interface PluginJournalWriter extends PluginJournalReader {
  appendEvent(input: PluginJournalAppend): number;
  getIdempotency(actorId: string, operation: string, key: string): PluginIdempotencyRecord | null;
  putIdempotency(input: PluginIdempotencyPut): void;
}

export interface PluginProjectDatabaseTransaction extends PluginDatabaseTransaction {
  readonly journal: PluginJournalWriter;
}

/** `services.project_database`: the plugin's own tables, and the project's journal beside them. */
export interface PluginProjectDatabase extends PluginDatabase {
  readonly journal: PluginJournalReader;
  transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginProjectDatabaseTransaction) => T): Promise<T>;
}

/**
 * A plugin's own tables: the store's name, the version recorded for it, and the statements that create them. Never chosen by an
 * action argument or an installed script. Declared in the Manifest (`databases.project` in a project's library, PG-020;
 * `databases.home` in a library of the Home, PG-022), like any plugin's: the Host starts no plugin with a library the Home's
 * store registry does not hold as that plugin's own, at this baseline.
 */
export interface PluginDatabaseDeclaration {
  readonly store_name: string;
  readonly version: number;
  readonly schema: string;
  readonly read_permission: string;
  readonly write_permission: string;
}

/**
 * The library a Home-level instance is given (`services.database`). With `partition: "project"` it is one library per project:
 * each call is given the library of the project it runs in, which the Host takes from the call (never from an argument), and
 * a call in no project is refused (`actions.project_required`). The Host opens each project's library when it is first used,
 * closes it when idle and when the instance stops, and removes it with the project (specs/plugin-project-partition). Only
 * `databases.home` may say so; the store registry says the same of the library (`HomeStoreDeclaration.library.partition`).
 */
export interface HomePluginDatabaseDeclaration extends PluginDatabaseDeclaration {
  readonly partition?: "project";
}

/**
 * The plugin's own tables, one declaration per scope. `project`: tables in each project's library, which the platform makes from
 * `schema` the first time the plugin opens there and records, with the publisher's signature, in its ledger; the statements may
 * only create tables and indexes, and foreign keys may only point at the plugin's own tables or the project's root row
 * (specs/plugin-project-database). A refusal (another publisher, version or shape) stops only that plugin in that project. The Host
 * makes them for the built-in project plugins when it opens a library, and checks them again for any plugin it starts with the
 * service (`services.project_database`).
 *
 * `home`: a library in the Home (`services.database`). The Host gives it only when its store registry holds a library of that name
 * as this plugin's own, at this version and `schema`, and partitioned the same way (specs/repository-anti-corruption/slices/pg022-manifest-declarations.md);
 * a plugin whose library is not registered does not start.
 */
export interface PluginManifestDatabases {
  readonly project?: PluginDatabaseDeclaration;
  readonly home?: HomePluginDatabaseDeclaration;
}

/**
 * An entry of the Home that holds an owner's data (docs/system/HOME-DATA.md), declared beside the code that opens it and listed
 * by the Host in one registry, which `uninstall --purge-user-data` removes in full. A plugin's library is the one its Manifest
 * declares (`databases.home`): the registry reads it from there, so its baseline is written once.
 */
export interface HomeStoreDeclaration {
  /** Relative to the Home, `/` between segments: `pages`, `git-operation-details.json`, `config/onboarding.json`. */
  readonly path: string;
  /**
   * The SQLite library this store is, at its owner's one baseline: `file` in the store's directory (default `<path>.db`). With
   * `partition: "project"` there is one such file for each project, in `projects/<project>/` under the store's directory.
   */
  readonly library?: { readonly baseline: { readonly version: number; readonly schema: string }; readonly file?: string; readonly partition?: "project" };
}
