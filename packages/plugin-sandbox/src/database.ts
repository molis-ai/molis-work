import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginProjectStatements } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxSqlRow, SandboxSqlStatement, SandboxSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServiceContext } from './broker.js';
import { SandboxError } from './schema.js';

// A plugin's own tables, across the channel (`sdk.projectDatabase`). The sandbox sends statements and gets rows back as JSON. The
// statements do not run on the Host's thread: the Host hands them to a runner that executes them in a process it can kill
// (`services.project_statements`; BL-395, specs/repository-anti-corruption/slices/sandbox-project-database-limits.md), and the runner
// makes the checks the Host's client makes for a plugin in the Host's process (the statement check of S-46, the grants, the
// original caller). This side bounds what crosses and adds the operation's signal and invocation check.

/** What one request carries at most. */
const SQL_LENGTH = 16_384, PARAMETERS = 256, STATEMENTS = 64, MESSAGE = 2048;
/**
 * What one read hands back at most: rows (`all`), and the bytes of their text and numbers (the channel's message is 1 MiB at the most, and
 * the broker refuses a response over half of it). The runner stops reading at the first row past either, so the rows are bounded
 * where they are read, not after.
 */
const RESULT_ROWS = 1000, RESULT_BYTES = 512 * 1024;

export type SandboxStatement = Required<SandboxSqlStatement>;

/** The Host's side of `sdk.projectDatabase`. The broker has checked the effect, the grant and the statements' shape. */
export interface SandboxDatabaseService {
  get(context: SandboxServiceContext, statement: SandboxStatement): Promise<SandboxSqlRow | null>;
  all(context: SandboxServiceContext, statement: SandboxStatement): Promise<SandboxSqlRow[]>;
  /** Every statement in one write transaction of the Host's: all of them or none. */
  transaction(context: SandboxServiceContext, statements: readonly SandboxStatement[]): Promise<Array<{ changes: number }>>;
}

const RESULT_TOO_LARGE = 'plugin.project_database.result_too_large';
const invalid = (message: string) => new SandboxError('sandbox.invalid_request', message);
const tooLarge = (message: string) => new SandboxError('sandbox.database_result_too_large', message);
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
 * `sdk.projectDatabase` over the runner the Host gave the plugin. A row crosses as JSON: a BLOB, an infinity or an integer past
 * 2^53 is refused, not changed. A refusal of the Host's keeps its code and reason, so the plugin can tell a refused statement from
 * a broken one or a killed one; anything else crosses as `sandbox.database_error` with SQLite's message. `all` returns at most
 * `RESULT_ROWS` rows; both `get` and `all` return at most `RESULT_BYTES` bytes; more is `sandbox.database_result_too_large`.
 */
export function sandboxDatabase(runner: PluginProjectStatements): SandboxDatabaseService {
  return {
    get: (context, statement) => run(context, () => runner.get(statement.sql, statement.parameters, { bytes: RESULT_BYTES }, context.signal)),
    all: (context, statement) => run(context, async () => {
      const rows = await runner.all(statement.sql, statement.parameters, { rows: RESULT_ROWS, bytes: RESULT_BYTES }, context.signal);
      if (rows.length > RESULT_ROWS) throw tooLarge(`A read returns at most ${RESULT_ROWS} rows; page it with LIMIT and OFFSET`);
      return rows;
    }),
    transaction: (context, statements) => run(context, () => runner.transaction(async () => {
      await context.beforeEffect?.();
      context.signal.throwIfAborted();
    }, statements, context.signal)),
  };
}

async function run<T>(context: SandboxServiceContext, call: () => T | Promise<T>): Promise<T> {
  context.signal.throwIfAborted();
  try { return await call(); } catch (error) { throw crossing(error); }
}

function crossing(error: unknown): SandboxError {
  if (error instanceof SandboxError) return error;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE);
  if (error instanceof ActionError && error.code === RESULT_TOO_LARGE) return tooLarge(message);
  return new SandboxError(error instanceof ActionError ? error.code : 'sandbox.database_error', message);
}
