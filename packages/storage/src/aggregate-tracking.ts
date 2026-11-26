import { replicaMarkSql } from './replica.js';
import type { SyncAggregateDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
const identifier = (value: string): string => { if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error('INVALID_AGGREGATE_IDENTIFIER'); return value; };
const prefix = (namespace?: string) => namespace ? `${identifier(namespace)}_` : '';
/**
 * A root row names its project in a library shared by every project. A partition's own library (`databases.partition`) is that
 * partition's alone: its rows name none, and the key's project is the one the platform bound the library to.
 */
export const aggregateNamesProject = (d: Pick<SyncAggregateDeclaration, 'columns'>): boolean => d.columns.includes('project_id');
const projectOf = (d: SyncAggregateDeclaration, row: string | undefined, namespace?: string) => {
  if (aggregateNamesProject(d)) return row ? `${row}.project_id` : 'project_id';
  if (!namespace) throw new Error('INVALID_AGGREGATE_SCOPE');
  return `(SELECT project_id FROM ${prefix(namespace)}context WHERE id=1)`;
};
/** Compile the aggregate journal alongside the complete library baseline, before a plugin can run. */
export function compileAggregateTrackingSql(definitions: readonly SyncAggregateDeclaration[], namespace?: string): string {
  const p = prefix(namespace), statements: string[] = [];
  for (const d of definitions) {
    for (const name of [d.kind,d.table,...d.columns,...d.children.flatMap(c=>[c.table,c.parent,...c.columns]),...d.versionColumn?[d.versionColumn]:[]]) identifier(name);
    const key = (row: string) => `json_array(${projectOf(d, row, namespace)},'${d.kind}',${row}.id)`;
    const mark = (value: string, condition = '1=1') => replicaMarkSql(value, condition, namespace);
    for (const [event,row] of [['INSERT','NEW'],['DELETE','OLD'],['UPDATE','NEW']]) {
      statements.push(`CREATE TRIGGER ${p}${d.table}_aggregate_${event.toLowerCase()} AFTER ${event} ON ${d.table} BEGIN ${mark(key(row))}
      ${d.versionColumn?`INSERT INTO ${p}aggregate_editor_versions VALUES (${key(row)},${row}.${d.versionColumn}) ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);`:''}
      ${event==='UPDATE'&&aggregateNamesProject(d)?mark(key('OLD'),'OLD.project_id<>NEW.project_id'):''} END;`);
    }
    for (const c of d.children) {
      const markChild = (row: string) => `INSERT INTO ${p}replica_changes(key) SELECT json_array(${projectOf(d, undefined, namespace)},'${d.kind}',id) FROM ${d.table} WHERE id=${row}.${c.parent} AND (SELECT applying FROM ${p}replica_state WHERE id=1)=0;`;
      for (const [event,row] of [['INSERT','NEW'],['DELETE','OLD'],['UPDATE','NEW']]) statements.push(`CREATE TRIGGER ${p}${c.table}_aggregate_${event.toLowerCase()} AFTER ${event} ON ${c.table} BEGIN ${markChild(row)} ${event==='UPDATE'?markChild('OLD'):''} END;`);
    }
  }
  return statements.join('\n');
}
export function aggregateTrackingSeedSql(definitions: readonly SyncAggregateDeclaration[], namespace?: string): string {
  const p=prefix(namespace);
  return definitions.map(d=>{
    identifier(d.kind);identifier(d.table);if(d.versionColumn)identifier(d.versionColumn);
    return `${d.versionColumn?`INSERT INTO ${p}aggregate_editor_versions(key,version) SELECT json_array(${projectOf(d, undefined, namespace)},'${d.kind}',id),${d.versionColumn} FROM ${d.table} WHERE 1 ON CONFLICT(key) DO UPDATE SET version=MAX(version,excluded.version);`:''}
    INSERT INTO ${p}replica_changes(key) SELECT json_array(${projectOf(d, undefined, namespace)},'${d.kind}',id) FROM ${d.table} ORDER BY id;`;
  }).join('\n');
}
