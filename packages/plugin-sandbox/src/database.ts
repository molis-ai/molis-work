import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginDatabase, PluginSqlRow, PluginSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxSqlRow, SandboxSqlStatement, SandboxSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServiceContext } from './broker.js';
import { SandboxError } from './schema.js';

// A plugin's own tables, across the channel (`sdk.projectDatabase`). The sandbox sends statements and gets rows back as JSON; the
// Host's client (`services.project_database`) checks each statement, the grants and the original caller exactly as it does for a
// plugin in the Host's process. This side only bounds what crosses and adds the operation's signal and invocation check.

/** What one request carries at most. */
const SQL_LENGTH = 16_384, PARAMETERS = 256, STATEMENTS = 64, MESSAGE = 2048;

export type SandboxStatement = Required<SandboxSqlStatement>;

/** The Host's side of `sdk.projectDatabase`. The broker has checked the effect, the grant and the statements' shape. */
export interface SandboxDatabaseService {
  get(context: SandboxServiceContext, statement: SandboxStatement): Promise<SandboxSqlRow | null>;
  all(context: SandboxServiceContext, statement: SandboxStatement): Promise<SandboxSqlRow[]>;
  /** Every statement in one write transaction of the Host's: all of them or none. */
  transaction(context: SandboxServiceContext, statements: readonly SandboxStatement[]): Promise<Array<{ changes: number }>>;
}

const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);
const sqlValue = (value: SandboxJson): value is SandboxSqlValue => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/** One statement as the worker sent it: its text, then its parameters. */
export function sandboxStatement(sql: SandboxJson | undefined, parameters: SandboxJson | undefined): SandboxStatement {
  if (typeof sql !== 'string' || !sql.trim() || sql.length > SQL_LENGTH || sql.includes('\0')) throw invalid('Invalid SQL statement');
  if (!Array.isArray(parameters) || parameters.length > PARAMETERS || !parameters.every(sqlValue)) throw invalid('SQL parameters must be null, finite numbers or strings');
  return { sql, parameters };
}

/** A write transaction's statements: 1 to 64 of them, each `{ sql, parameters }` and nothing else. */
export function sandboxStatements(value: SandboxJson | undefined): SandboxStatement[] {
  if (!Array.isArray(value) || !value.length || value.length > STATEMENTS) throw invalid(`A transaction takes 1 to ${STATEMENTS} statements`);
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => key !== 'sql' && key !== 'parameters')) throw invalid('A statement is { sql, parameters }');
    return sandboxStatement(item.sql, item.parameters);
  });
}

/**
 * `sdk.projectDatabase` over the client the Host gave the plugin. A row crosses as JSON: a BLOB, an infinity or an integer past
 * 2^53 is refused, not changed. A refusal of the Host's keeps its code and reason, so the plugin can tell a refused statement from
 * a broken one; anything else crosses as `sandbox.database_error` with SQLite's message.
 */
export function sandboxDatabase(database: PluginDatabase): SandboxDatabaseService {
  return {
    get: (context, statement) => run(context, () => {
      const row = database.get(statement.sql, statement.parameters);
      return row === null ? null : jsonRow(row);
    }),
    all: (context, statement) => run(context, () => database.all(statement.sql, statement.parameters).map(jsonRow)),
    transaction: (context, statements) => run(context, () => database.transaction(async () => {
      await context.beforeEffect?.();
      context.signal.throwIfAborted();
    }, transaction => {
      context.signal.throwIfAborted();
      return statements.map(statement => ({ changes: Number(transaction.run(statement.sql, statement.parameters).changes) }));
    })),
  };
}

async function run<T>(context: SandboxServiceContext, call: () => T | Promise<T>): Promise<T> {
  context.signal.throwIfAborted();
  try { return await call(); } catch (error) { throw crossing(error); }
}

function crossing(error: unknown): SandboxError {
  if (error instanceof SandboxError) return error;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE);
  return new SandboxError(error instanceof ActionError ? error.code : 'sandbox.database_error', message);
}

function jsonRow(row: PluginSqlRow): SandboxSqlRow {
  return Object.fromEntries(Object.entries(row).map(([column, value]) => [column, jsonValue(column, value)]));
}

function jsonValue(column: string, value: PluginSqlValue): SandboxSqlValue {
  if (value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value === 'bigint' && Number.isSafeInteger(Number(value))) return Number(value);
  throw new SandboxError('sandbox.database_error', `Column ${column.slice(0, 128)} holds a value the channel cannot carry (a BLOB, an infinity or an integer past 2^53)`);
}
