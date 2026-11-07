import { sqliteBaselineTriggers, assertSqliteBaselineTriggers } from '@molis-ai/molis-work-storage';
import type { PluginDatabaseConnection } from './plugin-database-client.js';
import { PROJECT_DATABASE_BASELINE } from './project-database-schema.js';

let expected: ReadonlyMap<string, string> | undefined;
/** Current platform triggers are checked read-only. Missing or changed triggers never cause an in-place schema repair. */
export function projectReplicationTriggers(db: PluginDatabaseConnection): ReadonlyMap<string, string> {
  expected ??= sqliteBaselineTriggers(PROJECT_DATABASE_BASELINE.schema);
  assertSqliteBaselineTriggers(db, expected);
  return expected;
}
