import { constants } from 'node:sqlite';
import type { PluginSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SqliteBaselineDatabase } from './sqlite-baseline.js';

type Authorizer = (action: number, first: string | null, second: string | null, database: string | null, origin: string | null) => number;
type SchemaRow = {name: string; type: string; sql: string | null};
type AuthorizedConnection = SqliteBaselineDatabase & {setAuthorizer(callback: Authorizer | null): void};
export type PluginSqlExecution = <T>(sql: string, parameters: readonly PluginSqlValue[], mode: 'read' | 'write', execute: () => T) => T;
const forbidden = () => new ActionError('actions.forbidden', '插件数据库语句越过当前业务库的权限边界');
// node:sqlite.setAuthorizer is the SQLite authorizer API (Node >=24.10). No unprotected fallback on earlier hosts.
const codes: Readonly<Record<string, number>> = Object.fromEntries(Object.entries(constants).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
const fold = (value: string) => value.replace(/[A-Z]/gu, letter => letter.toLowerCase());
const safeFunctions = new Set(('abs changes char coalesce concat concat_ws count date datetime format glob hex if ifnull iif instr julianday last_insert_rowid length like likelihood likely lower ltrim max min mod nullif octet_length printf quote random randomblob replace round rtrim sign soundex sqlite_version strftime substr substring sum time timediff total total_changes trim typeof unhex unicode unixepoch unlikely upper zeroblob group_concat string_agg avg ' +
  'json json_array json_array_length json_error_position json_extract json_insert json_object json_patch json_pretty json_quote json_remove json_replace json_set json_type json_valid json_group_array json_group_object jsonb jsonb_array jsonb_extract jsonb_insert jsonb_object jsonb_patch jsonb_remove jsonb_replace jsonb_set jsonb_group_array jsonb_group_object -> ->>').split(' '));

/** SQLite itself authorizes the actual prepare and step; a preflight-only parse cannot race a different executed statement. */
export function nativeSqliteOwnerBoundary(connection: SqliteBaselineDatabase, tables: ReadonlySet<string>, expectedTriggers: ReadonlyMap<string, string>, businessTriggers: ReadonlyMap<string, string> = new Map()): PluginSqlExecution {
  if (!('setAuthorizer' in connection) || typeof connection.setAuthorizer !== 'function' || codes.SQLITE_DENY === undefined) {
    throw new ActionError('actions.service_unavailable', '此宿主缺少 SQLite 原生语句授权，需要 Node 24.10 或更新版本');
  }
  const db = connection as AuthorizedConnection, own = new Set([...tables].map(fold));
  let active = false;
  return <T>(sql: string, _parameters: readonly PluginSqlValue[], mode: 'read' | 'write', execute: () => T): T => {
    if (active) throw forbidden();
    // SQLite reports CTE aliases in the same origin slot as triggers. Reserve every trusted trigger identifier in caller SQL,
    // so a CTE named after a trigger cannot borrow its technical-table privilege (quoted identifiers preserve this substring).
    const foldedSql = fold(sql);
    if ([...expectedTriggers.keys()].some(name => foldedSql.includes(fold(name)))) throw forbidden();
    // Re-read live metadata for every statement, in one query rather than one query per trusted trigger.
    const schema = db.prepare('SELECT name, type, sql FROM main.sqlite_schema').all() as SchemaRow[];
    const schemaOrigins = new Set(schema.filter(row => row.type === 'trigger' || row.type === 'view').map(row => fold(row.name)));
    const triggers = new Map(schema.filter(row => row.type === 'trigger').map(row => [row.name, row.sql]));
    const jsonTables = new Set(['json_each','json_tree'].filter(name => !schema.some(row => fold(row.name) === name)));
    const unambiguous = unambiguousMainTables(db, schema);
    const trusted = new Set<string>();
    for (const [name, expected] of [...expectedTriggers, ...businessTriggers]) {
      if (triggers.get(name) !== expected) throw forbidden();
      if (expectedTriggers.has(name)) trusted.add(fold(name));
    }
    const authorize: Authorizer = (action, first, second, database, origin) => {
      const denied = codes.SQLITE_DENY!, allowed = codes.SQLITE_OK!;
      // Only the exact baseline trigger checked above may reach the platform journal; package-created views/triggers do not inherit it.
      if (origin && schemaOrigins.has(fold(origin)) && !trusted.has(fold(origin)) && !businessTriggers.has(origin)) return denied;
      const technical = origin !== null && trusted.has(fold(origin));
      if (action === codes.SQLITE_SELECT) return allowed;
      if (action === codes.SQLITE_FUNCTION) return second && safeFunctions.has(fold(second)) ? allowed : denied;
      if (action === codes.SQLITE_READ) {
        // SQLite leaves the schema null for an unqualified table reference that extracts no columns (count/exists/rowid).
        const main = database === 'main' || database === null && second === '' && first !== null && unambiguous.has(fold(first));
        return main && first && (own.has(fold(first)) || technical || jsonTables.has(fold(first))) ? allowed : denied;
      }
      if ([codes.SQLITE_INSERT, codes.SQLITE_UPDATE, codes.SQLITE_DELETE].includes(action)) {
        return mode === 'write' && database === 'main' && first && (own.has(fold(first)) || technical) ? allowed : denied;
      }
      // PRAGMA, schema changes, ATTACH, transaction control, virtual-table creation and recursive queries are refused.
      return denied;
    };
    active = true;
    try { db.setAuthorizer(authorize); return execute(); }
    finally { try { db.setAuthorizer(null); } finally { active = false; } }
  };
}

/** SQLite's own bookkeeping that a schema change rewrites inside itself, by the database it is in. `sqlite_sequence` holds the AUTOINCREMENT counter of a table renamed or dropped. */
const SCHEMA_BOOKKEEPING: ReadonlyMap<string, string> = new Map([['sqlite_master', 'main'], ['sqlite_temp_master', 'temp'], ['sqlite_sequence', 'main']]);
/** What SQLite calls in the statements it runs inside the `ALTER` of a table (read on SQLite 3.51.3). None of them can be written in a schema change's own text. */
const SCHEMA_FUNCTIONS = new Set(['like', 'length', 'printf', 'substr', 'sqlite_drop_column', 'sqlite_rename_column', 'sqlite_rename_quotefix', 'sqlite_rename_table', 'sqlite_rename_test']);

/**
 * The same native authorizer for one statement that changes a table or an index (upgrade-chain-design §2.4, second layer): it may alter,
 * drop or index only a table of `tables`, create a table of a new name, and read or write nothing else but SQLite's own bookkeeping that the
 * statement rewrites inside itself. That last allowance is why a caller sends here only what it has read as a schema change (`ALTER`,
 * `CREATE` or `DROP` of a table or an index), never a statement of rows: SQLite asks about its own internal statements the same way it asks
 * about the caller's, with no trigger or view to tell them apart. Every other question is refused, one never seen here included, so a newer
 * SQLite can only refuse a legal step. A refusal is SQLite's own: the prepare fails (`SQLITE_AUTH`, or `SQLITE_ERROR` for a refused function) before any of it runs.
 */
export function nativeSqliteSchemaBoundary(connection: SqliteBaselineDatabase, tables: ReadonlySet<string>): PluginSqlExecution {
  if (!('setAuthorizer' in connection) || typeof connection.setAuthorizer !== 'function' || codes.SQLITE_DENY === undefined) {
    throw new ActionError('actions.service_unavailable', '此宿主缺少 SQLite 原生语句授权，需要 Node 24.10 或更新版本');
  }
  const db = connection as AuthorizedConnection, own = new Set([...tables].map(fold));
  let active = false;
  return <T>(_sql: string, _parameters: readonly PluginSqlValue[], mode: 'read' | 'write', execute: () => T): T => {
    if (active || mode !== 'write') throw forbidden();
    // What this statement itself makes: a new table may be read by its own CHECK, and a new index is rebuilt (REINDEX) as it is made.
    const created = new Set<string>(), indexed = new Set<string>();
    const ours = (name: string | null) => name !== null && (own.has(fold(name)) || created.has(fold(name)));
    const bookkeeping = (name: string | null, database: string | null) => name !== null && SCHEMA_BOOKKEEPING.get(fold(name)) === database;
    const authorize: Authorizer = (action, first, second, database, origin) => {
      const denied = codes.SQLITE_DENY!, allowed = codes.SQLITE_OK!;
      if (origin !== null) return denied;
      switch (action) {
        case codes.SQLITE_SELECT: return allowed;
        case codes.SQLITE_FUNCTION: return second && (SCHEMA_FUNCTIONS.has(fold(second)) || safeFunctions.has(fold(second))) ? allowed : denied;
        case codes.SQLITE_READ: return (database === 'main' && ours(first)) || bookkeeping(first, database) ? allowed : denied;
        case codes.SQLITE_INSERT: case codes.SQLITE_UPDATE:
          return bookkeeping(first, database) && !(action === codes.SQLITE_INSERT && fold(first!) === 'sqlite_sequence') ? allowed : denied;
        case codes.SQLITE_DELETE: return (database === 'main' && ours(first)) || bookkeeping(first, database) ? allowed : denied;
        // The database is in the first slot here; in DROP COLUMN SQLite puts the column's name where the database usually goes.
        case codes.SQLITE_ALTER_TABLE: return first === 'main' && ours(second) ? allowed : denied;
        case codes.SQLITE_CREATE_TABLE:
          if (database !== 'main' || first === null || fold(first).startsWith('sqlite_')) return denied;
          created.add(fold(first));
          return allowed;
        case codes.SQLITE_CREATE_INDEX:
          if (database !== 'main' || first === null || !ours(second)) return denied;
          indexed.add(fold(first));
          return allowed;
        case codes.SQLITE_REINDEX: return database === 'main' && first !== null && indexed.has(fold(first)) ? allowed : denied;
        case codes.SQLITE_DROP_INDEX: return database === 'main' && ours(second) ? allowed : denied;
        case codes.SQLITE_DROP_TABLE: return database === 'main' && ours(first) ? allowed : denied;
        // Triggers, views, temporary and virtual tables, pragmas, ATTACH, transactions, recursive queries.
        default: return denied;
      }
    };
    active = true;
    try { db.setAuthorizer(authorize); return execute(); }
    finally { try { db.setAuthorizer(null); } finally { active = false; } }
  };
}

/** A null-schema authorizer read is safe only when that name resolves uniquely to a real main table. */
function unambiguousMainTables(db: SqliteBaselineDatabase, schema: readonly SchemaRow[]): ReadonlySet<string> {
  const main = new Set(schema.filter(row => row.type === 'table').map(row => fold(row.name)));
  const schemas = db.prepare('PRAGMA database_list').all() as {name:string}[];
  for (const {name} of schemas) {
    if (name === 'main') continue;
    const quoted = '"' + name.replaceAll('"','""') + '"';
    for (const row of db.prepare(`SELECT name FROM ${quoted}.sqlite_schema WHERE type IN ('table','view')`).all() as {name:string}[]) main.delete(fold(row.name));
  }
  return main;
}
