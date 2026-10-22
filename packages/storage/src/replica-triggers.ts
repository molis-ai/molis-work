import type { ReplicaDatabase } from './replica.js';
import { replicaError } from './project-replica-errors.js';

// Authority is process-local and comes only from owner-declared installers, never from database contents.
const definitions = new WeakMap<object, Map<string, string>>();
export function replicaTriggerDefinitions(db: object): ReadonlyMap<string, string> {
  let values = definitions.get(db);
  if (!values) { values = new Map(); definitions.set(db, values); }
  return values;
}
export function shareReplicaTriggerDefinitions(source: object, adapter: object): void {
  replicaTriggerDefinitions(source);
  definitions.set(adapter, definitions.get(source)!);
}
/** Reopening checks the exact owner SQL; a trigger with the right name but different effects is refused. */
export function installReplicaTrigger(db: ReplicaDatabase, name: string, sql: string): void {
  const existing = db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name=?").get(name);
  if (existing && existing.sql !== sql) throw replicaError('replica_journal_invalid');
  if (!existing) db.exec(sql);
  replicaTriggerDefinitions(db);
  definitions.get(db)!.set(name, sql);
}
