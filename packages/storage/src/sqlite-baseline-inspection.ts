import { DatabaseSync } from 'node:sqlite';
import type { SqliteBaselineDatabase } from './sqlite-baseline.js';

/** Describe only triggers created by the current schema, excluding trusted scratch-only platform tables. */
export function sqliteBaselineTriggers(schema: string, prelude = ''): ReadonlyMap<string, string> {
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(prelude);
    const existing = new Set(reference.prepare("SELECT name FROM sqlite_schema WHERE type='trigger'").all().map(row => String(row.name)));
    reference.exec(schema);
    return new Map(reference.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all()
      .filter(row => !existing.has(String(row.name))).map(row => [String(row.name),String(row.sql)]));
  } finally { reference.close(); }
}

/** Current-baseline comparison never creates missing triggers or derives trust from a database's own contents. */
export function assertSqliteBaselineTriggers(db: SqliteBaselineDatabase, expected: ReadonlyMap<string, string>): void {
  for (const [name, sql] of expected) {
    const actual = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name) as {sql: string} | undefined;
    if (actual?.sql !== sql) throw new Error('SQLITE_BASELINE_TRIGGER_MISMATCH');
  }
}

/** Closed libraries accept only executable schema from the baseline. Project plugin triggers have a separate owner inspector. */
export function snapshotProgramsMatch(db: SqliteBaselineDatabase, schema: string, additionalTables: boolean): boolean {
  const programs = (connection: SqliteBaselineDatabase) =>
    connection.prepare("SELECT name,type,sql FROM sqlite_schema WHERE type IN ('view','trigger')").all() as Array<{name:string; type:string; sql:string}>;
  const reference = new DatabaseSync(':memory:');
  try {
    reference.exec(schema);
    const expected = new Map(programs(reference).map(row => [row.name,row]));
    for (const actual of programs(db)) {
      const declared = expected.get(actual.name);
      if (!declared) {
        if (additionalTables && actual.type === 'trigger') continue;
        return false;
      }
      if (actual.type !== declared.type || actual.sql !== declared.sql) return false;
      expected.delete(actual.name);
    }
    return expected.size === 0;
  } finally { reference.close(); }
}
