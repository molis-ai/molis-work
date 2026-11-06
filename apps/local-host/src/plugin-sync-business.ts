import type { PluginSqlExecution } from '@molis-ai/molis-work-storage';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginSqlRow, PluginSqlValue } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginSyncBusinessDatabase } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { PluginDatabaseConnection } from './plugin-database-client.js';
import { assertReadStatement, assertWriteStatement } from './project-statement-protocol.js';

/** Owner callbacks borrow the current replica transaction, with the same table/opcode boundary as ordinary plugin SQL. */
export function pluginSyncBusinessDatabase(db: PluginDatabaseConnection, inTransaction: () => boolean,
  authorize: () => void, guard: (sql: string, parameters: readonly PluginSqlValue[], mode: 'read' | 'write') => void, perform?: PluginSqlExecution): PluginSyncBusinessDatabase {
  const read = <T>(sql: string, parameters: readonly PluginSqlValue[], run: () => T): T => {
    authorize(); assertReadStatement(sql); guard(sql, parameters, 'read');
    const value = perform ? perform(sql, parameters, 'read', run) : run(); authorize(); return value;
  };
  const write = (sql: string, parameters: readonly PluginSqlValue[]) => {
    authorize();
    if (!inTransaction()) throw new ActionError('actions.forbidden', '同步业务写入必须处于宿主当前事务');
    assertWriteStatement(sql);
    const masked = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\//gu, '');
    if (masked.trim().replace(/;$/u, '').includes(';')) throw new ActionError('actions.forbidden', '同步业务写入每次只能包含一条语句');
    guard(sql, parameters, 'write');
    const run = () => db.prepare(sql).run(...parameters) as {changes: number | bigint};
    const result = perform ? perform(sql, parameters, 'write', run) : run(); authorize(); return result;
  };
  return Object.freeze({
    exec(sql: string) { write(sql, []); },
    prepare(sql: string) { return Object.freeze({
      get: (...parameters: PluginSqlValue[]) => read(sql, parameters, () => db.prepare(sql).get(...parameters) as PluginSqlRow | undefined),
      all: (...parameters: PluginSqlValue[]) => read(sql, parameters, () => db.prepare(sql).all(...parameters) as PluginSqlRow[]),
      run: (...parameters: PluginSqlValue[]) => write(sql, parameters),
    }); },
  });
}
