import { installReplicaTrigger } from './replica-triggers.js';
import { replicaError } from './project-replica-errors.js';
import type { ProjectReplicaDefinition, ProjectReplicaRow, ProjectReplicaRows, ProjectReplicaSection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ReplicaDatabase } from './replica.js';
import { initializeReplica, namespacedReplicaDatabase, replicaMarkSql, replicaTransaction } from './replica.js';
import { createProjectReplicaJournal } from './project-replica-journal.js';

/** Installs the technical journal from owner declarations, without granting upload permission. */
export function installProjectReplicaJournal(db: ReplicaDatabase, namespace: string, definitions: readonly ProjectReplicaDefinition[], projectIds?:readonly string[]): void {
  replicaTransaction(db, () => {
    initializeReplica(namespacedReplicaDatabase(db, namespace));
    const kind=definitions[0]?.assetKind;
    if(!kind||definitions.some(d=>d.assetKind!==kind)||!/^[a-z][a-z0-9_]*$/.test(kind))throw replicaError('replica_identifier_invalid');
    const marker = `${definitions[0]!.id}_sync_${definitions[0]!.tables.find(t => !t.keepRoot)!.name}_insert`;
    const initialized = db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(marker);
    const mark = (key: string) => replicaMarkSql(key).replace(/\breplica_/g, namespace + '_replica_');
    for (const definition of definitions) createProjectReplicaSection(db, definition, '').installJournal(mark);
    createProjectReplicaJournal(db, '', definitions).installJournal(mark);
    if (initialized) return;
    const root = definitions.flatMap(d => d.tables).find(t => t.keepRoot);
    if (!projectIds&&(!root||root.keys.length!==1))throw replicaError('replica_root_invalid');
    const ids=projectIds??db.prepare(`SELECT ${root!.keys[0]} AS id FROM ${root!.name}`).all().map(row=>String(row.id));
    for (const projectId of ids) {
      if(typeof projectId!=='string'||!projectId||projectId.length>80)throw replicaError('replica_identifier_invalid');
      const sections = definitions.map(d => createProjectReplicaSection(db, d, projectId).read());
      if (!sections.some(section => Object.entries(section).some(([table, rows]) => table !== root?.name && rows.length > 0))) continue;
      namespacedReplicaDatabase(db, namespace).prepare('INSERT INTO replica_changes(key) VALUES (?)').run(JSON.stringify([projectId, kind, projectId]));
    }
  });
}

/** SQL is derived exclusively from owner declarations. This layer does not discover business tables. */
export function createProjectReplicaSection(db: ReplicaDatabase, definition: ProjectReplicaDefinition, projectId: string): ProjectReplicaSection {
  for (const table of definition.tables) {
    for (const identifier of [definition.id, definition.assetKind, table.name, ...table.columns, ...table.keys]) {
      if (typeof identifier!=='string'||!/^[a-z][a-z0-9_]*$/.test(identifier)) throw replicaError('replica_identifier_invalid');
    }
    if(table.journalColumns&&(!table.journalColumns.length||new Set(table.journalColumns).size!==table.journalColumns.length||table.journalColumns.some(column=>!table.columns.includes(column))))throw replicaError('replica_identifier_invalid');
  }
  const where = (table: ProjectReplicaDefinition['tables'][number]) => table.where ?? `${table.projectColumn ?? 'project_id'} = ?`;
  const local = (): ProjectReplicaRows => Object.fromEntries(definition.tables.map(table => [table.name,
    db.prepare(`SELECT ${table.columns.join(',')} FROM ${table.name} WHERE ${where(table)} ORDER BY ${table.keys.join(',')}`).all(projectId) as ProjectReplicaRow[],
  ]));
  const read=()=>{const rows=local();return definition.project?.(rows,projectId)??rows;};
  let beforeClear:ProjectReplicaRows|undefined;
  const writeRows=(incoming:ProjectReplicaRows)=>{
    let rows=incoming;
    if(definition.restore){const captured=beforeClear;beforeClear=undefined;if(!captured)throw replicaError('replica_rows_invalid');rows=validateProjectReplicaRows(definition.restore(rows,captured,projectId),definition,projectId);}
    beforeClear=undefined;
    for (const table of definition.tables) for (const row of rows[table.name]!) {
      const columns = table.columns;
      const update = table.keepRoot ? ` ON CONFLICT(${table.keys.join(',')}) DO UPDATE SET ${columns.filter(c => !table.keys.includes(c)).map(c => `${c}=excluded.${c}`).join(',')}` : '';
      db.prepare(`INSERT INTO ${table.name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})${update}`).run(...columns.map(c => row[c]));
    }
  };
  return {
    read,
    validate(value) {
      const rows = validateProjectReplicaRows(value, definition, projectId);
      for (const table of definition.tables) for (const row of rows[table.name]!) {
        const identity = table.keys.map(key => row[key]);
        const clause = table.keys.map(key => `${key}=?`).join(' AND ');
        const existing = db.prepare(`SELECT 1 FROM ${table.name} WHERE ${clause}`).get(...identity);
        if (existing && !db.prepare(`SELECT 1 FROM ${table.name} WHERE (${where(table)}) AND ${clause}`).get(projectId, ...identity)) {
          throw replicaError('replica_identity_scope_mismatch');
        }
      }
      definition.validate(rows, projectId);
      return rows;
    },
    clear(tombstone = false) {
      beforeClear=undefined;
      const captured=definition.restore||definition.beforeClear?local():undefined;
      if(captured)definition.beforeClear?.(captured,projectId);
      beforeClear=definition.restore?captured:undefined;
      for (const table of [...definition.tables].reverse()) {
        if (!table.keepRoot) db.prepare(`DELETE FROM ${table.name} WHERE ${where(table)}`).run(projectId);
      }
      if(tombstone && definition.restore)writeRows(Object.fromEntries(definition.tables.map(table=>[table.name,[]])));
    },
    write:writeRows,
    installJournal(mark) {
      for (const table of definition.tables) for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        const name = `${definition.id}_sync_${table.name}_${operation.toLowerCase()}`;

        const row = operation === 'DELETE' ? 'OLD' : 'NEW';
        const project = table.projectExpression?.replaceAll('$row', row) ?? `${row}.${table.projectColumn ?? 'project_id'}`;
        const predicate=operation==='UPDATE'&&table.journalUpdateCondition?table.journalUpdateCondition.replaceAll('$old','OLD').replaceAll('$new','NEW'):table.journalCondition?.replaceAll('$row',row);
        const condition=predicate?' WHEN '+predicate:'';
        const updated=operation==='UPDATE'&&table.journalColumns?' OF '+table.journalColumns.join(','):'';
        installReplicaTrigger(db, name, `CREATE TRIGGER ${name} ${operation === 'DELETE' ? 'BEFORE' : 'AFTER'} ${operation}${updated} ON ${table.name}${condition} BEGIN ${mark(`json_array(${project},'${definition.assetKind}',${project})`)} END`);
      }
    },
  };
}

export function validateProjectReplicaRows(value: unknown, definition: ProjectReplicaDefinition, projectId: string): ProjectReplicaRows {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw replicaError('replica_rows_invalid');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== definition.tables.length) throw replicaError('replica_tables_invalid');
  const result: ProjectReplicaRows = {};
  for (const table of definition.tables) {
    const list = input[table.name];
    if (!Array.isArray(list) || list.length > 10000) throw replicaError('replica_rows_invalid');
    const seen = new Set<string>();
    result[table.name] = list.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw replicaError('replica_row_invalid');
      const row = value as ProjectReplicaRow;
      if (Object.keys(row).length !== table.columns.length || table.columns.some(c => !Object.hasOwn(row, c))) throw replicaError('replica_columns_invalid');
      if (Object.values(row).some(v => v !== null && typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v)))) throw replicaError('replica_value_invalid');
      if (table.columns.includes('project_id') && row.project_id !== projectId) throw replicaError('replica_scope_mismatch');
      for (const column of table.columns.filter(c => c.endsWith('_json'))) if (row[column] !== null) {
        if (typeof row[column] !== 'string') throw replicaError('replica_json_invalid');
        JSON.parse(row[column] as string);
      }
      const identity = JSON.stringify(table.keys.map(k => row[k]));
      if (table.keys.some(k => row[k] === null || row[k] === '') || seen.has(identity)) throw replicaError('replica_identity_invalid');
      seen.add(identity);
      return { ...row };
    });
  }
  return result;
}
