import type { SyncTrackedTable, SyncKeyPart } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import { replicaMarkRowsSql } from './replica.js';
const name = (value: string) => { if (!/^[a-z][a-z0-9_]*$/u.test(value)) throw new Error('INVALID_SYNC_IDENTIFIER'); return `"${value}"`; };
const literal = (value: string | number | null): string => {
  if (value === null) return 'NULL';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('INVALID_SYNC_LITERAL'); return String(value); }
  if (typeof value !== 'string') throw new Error('INVALID_SYNC_LITERAL');
  return "'" + value.replaceAll("'", "''") + "'";
};
const key = (parts: readonly SyncKeyPart[], row: string, namespace: string) => `json_array(${parts.map(part => 'column' in part ? `${row}.${name(part.column)}` : 'scope' in part ? `(SELECT project_id FROM ${name(namespace + "_context")} WHERE id=1)` : literal(part.literal)).join(',')})`;
function condition(spec: SyncTrackedTable, row: string): string {
  const filters=(spec.where ?? []).map(filter => `${row}.${name(filter.column)} ${filter.op === 'eq' ? 'IS' : '>'} ${typeof filter.value === 'object' && filter.value !== null ? "json_extract((SELECT descriptor FROM molis_storage_space WHERE singleton=1),'$.ownerUserId')" : literal(filter.value)}`).join(' AND ') || '1=1';
  const existence=spec.existsAny?.map(relation=>`EXISTS (SELECT 1 FROM ${name(relation.table)} AS sync_exists WHERE ${relation.match.map(pair=>`sync_exists.${name(pair.column)}=${row}.${name(pair.rowColumn)}`).join(' AND ')})`).join(' OR ');
  return existence?`(${filters}) AND (${existence})`:filters;
}
function selection(spec: SyncTrackedTable, row: string, namespace: string): string {
  if (!spec.lookup) return `SELECT ${key(spec.key, row, namespace)} AS key WHERE ${condition(spec, row)}`;
  const parent = 'sync_parent';
  return `SELECT ${key(spec.key, parent, namespace)} AS key FROM ${name(spec.lookup.table)} AS ${parent} WHERE ${condition(spec, row)} AND ${spec.lookup.match.map(pair => `${parent}.${name(pair.column)}=${row}.${name(pair.rowColumn)}`).join(' AND ')}`;
}
function updateCondition(spec: SyncTrackedTable): string {
  if(!spec.updateAny)return '';
  return ' WHEN ' + spec.updateAny.map(branch => '(' + branch.changed.map(column=>`OLD.${name(column)} IS NOT NEW.${name(column)}`).join(' OR ') + ')' + (branch.where??[]).map(filter=>' AND ' + (filter.op==='not-null' ? `NEW.${name(filter.column)} IS NOT NULL` : `NEW.${name(filter.column)} IN (${filter.values!.map(literal).join(',')})`)).join('')).map(branch=>'('+branch+')').join(' OR ');
}
/** Compile platform-owned triggers for the complete current library baseline. The Runtime checks table ownership first. */
export function compileSyncTrackingSql(tracking: readonly SyncTrackedTable[], namespace: string): string {
  name(namespace);
  return tracking.flatMap((spec, index) => ['INSERT', 'UPDATE', 'DELETE'].map(event => {
    const row = event === 'DELETE' ? 'OLD' : 'NEW';
    let body = replicaMarkRowsSql(selection(spec, row, namespace), namespace);
    if (event === 'UPDATE') body += replicaMarkRowsSql(`${selection(spec, 'OLD', namespace)} EXCEPT ${selection(spec, 'NEW', namespace)}`, namespace);
    const revision = spec.revision;
    if (revision && event !== 'DELETE') body += `INSERT INTO ${name(revision.table)} (${[...revision.key.map(pair => name(pair.column)), name(revision.column)].join(',')}) SELECT ${[...revision.key.map(pair => `${row}.${name(pair.rowColumn)}`), `${row}.${name(revision.rowColumn)}`].join(',')} WHERE ${condition(spec, row)} ON CONFLICT (${revision.key.map(pair => name(pair.column)).join(',')}) DO UPDATE SET ${name(revision.column)}=MAX(${name(revision.column)},excluded.${name(revision.column)});`;
    return `CREATE TRIGGER ${name(`${namespace}_track_${index}_${event.toLowerCase()}`)} AFTER ${event} ON ${name(spec.table)}${event==='UPDATE'?updateCondition(spec):''} BEGIN ${body} END;`;
  })).join('\n');
}
/** Existing business rows are seeded only when a new platform journal is first initialized. */
export function syncTrackingSeedSql(tracking: readonly SyncTrackedTable[], namespace: string): string {
  name(namespace);
  return tracking.map(spec => {
    const row = 'sync_row', parent = 'sync_parent';
    const from = `${name(spec.table)} AS ${row}`;
    const select = spec.lookup
      ? `SELECT ${key(spec.key, parent, namespace)} FROM ${from} JOIN ${name(spec.lookup.table)} AS ${parent} ON ${spec.lookup.match.map(pair => `${parent}.${name(pair.column)}=${row}.${name(pair.rowColumn)}`).join(' AND ')} WHERE ${condition(spec, row)}`
      : `SELECT ${key(spec.key, row, namespace)} FROM ${from} WHERE ${condition(spec, row)}`;
    let sql = `INSERT INTO ${name(`${namespace}_replica_changes`)}(key) ${select};`;
    const revision = spec.revision;
    if (revision) sql += `INSERT INTO ${name(revision.table)} (${[...revision.key.map(pair => name(pair.column)), name(revision.column)].join(',')}) SELECT ${[...revision.key.map(pair => `${row}.${name(pair.rowColumn)}`), `${row}.${name(revision.rowColumn)}`].join(',')} FROM ${from} WHERE ${condition(spec, row)} ON CONFLICT (${revision.key.map(pair => name(pair.column)).join(',')}) DO UPDATE SET ${name(revision.column)}=MAX(${name(revision.column)},excluded.${name(revision.column)});`;
    return sql;
  }).join('\n');
}
