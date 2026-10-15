/** SQL owned by a trusted native plugin. This is a lifecycle service, not a JavaScript sandbox. */
export type PluginSqlValue = string | number | bigint | Uint8Array | null;
export type PluginSqlRow = Record<string, PluginSqlValue>;

export interface PluginDatabaseReader {
  get(sql: string, parameters?: readonly PluginSqlValue[]): PluginSqlRow | null;
  all(sql: string, parameters?: readonly PluginSqlValue[]): PluginSqlRow[];
}

export interface PluginDatabaseTransaction extends PluginDatabaseReader {
  run(sql: string, parameters?: readonly PluginSqlValue[]): { changes: number | bigint };
}

export interface PluginDatabase extends PluginDatabaseReader {
  /** Wait for current action authority, then run one synchronous transaction. Async bodies are rejected and rolled back. */
  transaction<T>(beforeEffect: () => Promise<void>, write: (transaction: PluginDatabaseTransaction) => T): Promise<T>;
}

/** Selected by the trusted Host entry, never by an action argument or an installed script. */
export interface PluginDatabaseDeclaration {
  readonly store_name: string;
  readonly version: number;
  readonly schema: string;
  readonly read_permission: string;
  readonly write_permission: string;
}

/**
 * An entry of the Home that holds an owner's data (docs/system/HOME-DATA.md), declared beside the code that opens it and listed
 * by the Host in one registry, which `uninstall --purge-user-data` removes in full. Like the database declaration it is the
 * trusted Host entry's to carry, never a Manifest's or an action's.
 */
export interface HomeStoreDeclaration {
  /** Relative to the Home, `/` between segments: `pages`, `git-operation-details.json`, `config/onboarding.json`. */
  readonly path: string;
  /** The SQLite library this store is, at its owner's one baseline: `file` in the store's directory (default `<path>.db`). */
  readonly library?: { readonly baseline: { readonly version: number; readonly schema: string }; readonly file?: string };
}
