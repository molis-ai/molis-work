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
 * The one handle through which a platform service may later join a plugin's write transaction (a scheduler registering a job, the
 * journal): it would check that the handle is the write transaction in progress on its own connection. Nothing joins one today
 * (specs/plugin-project-database §2.6).
 */
export interface PluginDatabaseTransaction extends PluginDatabaseReader {
  run(sql: string, parameters?: readonly PluginSqlValue[]): { changes: number | bigint };
}

export interface PluginDatabase extends PluginDatabaseReader {
  /** Wait for current action authority, then run one synchronous transaction. Async bodies are rejected and rolled back. */
  transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T>;
}

/**
 * A plugin's own tables: the store's name, the version recorded for it, and the statements that create them. Never chosen by an
 * action argument or an installed script. In a project's library it is declared in the Manifest (`databases.project`, PG-020), like
 * any plugin's; a library in the Home is still selected by the trusted Host entry. 2026-10-18 改: the Home one is declared in the
 * Manifest too (PG-022 in specs/repository-anti-corruption/privileges.md); until then, as above.
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
 * closes it when idle and when the instance stops, and removes it with the project (specs/plugin-project-partition). Only a
 * Home entry may say so; the store registry says the same of the library (`HomeStoreDeclaration.library.partition`).
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
 */
export interface PluginManifestDatabases {
  readonly project?: PluginDatabaseDeclaration;
}

/**
 * An entry of the Home that holds an owner's data (docs/system/HOME-DATA.md), declared beside the code that opens it and listed
 * by the Host in one registry, which `uninstall --purge-user-data` removes in full. Like the database declaration it is the
 * trusted Host entry's to carry, never a Manifest's or an action's. 2026-10-18 改: a plugin's store is declared in its Manifest
 * like its database (PG-022 in specs/repository-anti-corruption/privileges.md); until then, as above.
 */
export interface HomeStoreDeclaration {
  /** Trusted owner replication factory; never supplied by a plugin Manifest or a network payload. */
  readonly replication?: (home: string, ownerId: string) => {close():void;replica(context:import('./plugin-sync-registration.js').AggregateReplicaContext):import('./sync-transport.js').SyncReplicaAdapter};
  /** Relative to the Home, `/` between segments: `pages`, `git-operation-details.json`, `config/onboarding.json`. */
  readonly path: string;
  /**
   * The SQLite library this store is, at its owner's one baseline: `file` in the store's directory (default `<path>.db`). With
   * `partition: "project"` there is one such file for each project, in `projects/<project>/` under the store's directory.
   */
  readonly library?: { readonly baseline: { readonly version: number; readonly schema: string }; readonly file?: string; readonly partition?: "project" };
}
