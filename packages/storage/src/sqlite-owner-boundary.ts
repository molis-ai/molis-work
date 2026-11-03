import { constants } from 'node:sqlite';
import type { PluginSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SqliteBaselineDatabase } from './sqlite-baseline.js';

type Authorizer = (action: number, first: string | null, second: string | null, database: string | null, origin: string | null) => number;
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
    if ([...expectedTriggers.keys()].some(name => fold(sql).includes(fold(name)))) throw forbidden();
    const schemaOrigins = new Set((db.prepare("SELECT name FROM sqlite_schema WHERE type IN ('trigger','view')").all() as {name: string}[]).map(row => fold(row.name)));
    const jsonTables = new Set(['json_each','json_tree'].filter(name => !db.prepare("SELECT 1 FROM sqlite_schema WHERE name=?").get(name)));
    const unambiguous = unambiguousMainTables(db);
    const trusted = new Set<string>();
    for (const [name, expected] of [...expectedTriggers, ...businessTriggers]) {
      const found = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name) as {sql: string} | undefined;
      if (found?.sql !== expected) throw forbidden();
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

/** A null-schema authorizer read is safe only when that name resolves uniquely to a real main table. */
function unambiguousMainTables(db: SqliteBaselineDatabase): ReadonlySet<string> {
  const main = new Set((db.prepare("SELECT name FROM main.sqlite_schema WHERE type='table'").all() as {name:string}[]).map(row=>fold(row.name)));
  const schemas = db.prepare('PRAGMA database_list').all() as {name:string}[];
  for (const {name} of schemas) {
    if (name === 'main') continue;
    const quoted = '"' + name.replaceAll('"','""') + '"';
    for (const row of db.prepare(`SELECT name FROM ${quoted}.sqlite_schema WHERE type IN ('table','view')`).all() as {name:string}[]) main.delete(fold(row.name));
  }
  return main;
}
