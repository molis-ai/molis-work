import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { SyncTrackedTable } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
const identifier = /^[a-z][a-z0-9_]*$/u;
const denied = (): never => { throw new ActionError('actions.input_invalid', '同步追踪超出当前插件的数据归属'); };
/** Validate and detach the declarative tracker before the platform compiles its own SQL. */
export function validateSyncTracking(tracking: readonly SyncTrackedTable[], tables: ReadonlyMap<string, ReadonlySet<string>>): readonly SyncTrackedTable[] {
  if (!Array.isArray(tracking) || !tracking.length || tracking.length > 100) denied();
  const columns = (table: string, names: readonly string[]) => {
    const allowed = tables.get(table);
    if (!identifier.test(table) || !allowed || names.some(name => !identifier.test(name) || !allowed.has(name))) denied();
  };
  const copy = structuredClone([...tracking]);
  for (const row of copy) {
    if (!row || !Array.isArray(row.key) || !row.key.length || row.key.length > 10) denied();
    columns(row.table, []);
    const keyTable = row.lookup?.table ?? row.table;
    columns(keyTable, []);
    for (const part of row.key) {
      if ('column' in part) columns(keyTable, [part.column]);
      else if ('scope' in part) { if (part.scope !== 'projectId') denied(); }
      else if (!('literal' in part) || !(part.literal === null || typeof part.literal === 'string' && part.literal.length <= 200 || typeof part.literal === 'number' && Number.isFinite(part.literal))) denied();
      Object.freeze(part);
    }
    if(row.existsAny){
      if(!Array.isArray(row.existsAny)||!row.existsAny.length||row.existsAny.length>100)denied();
      for(const relation of row.existsAny){
        if(!Array.isArray(relation.match)||!relation.match.length)denied();columns(relation.table,[]);
        for(const pair of relation.match){columns(relation.table,[pair.column]);columns(row.table,[pair.rowColumn]);Object.freeze(pair);}
        if(tables.get(row.table)!.has('project_id')&&tables.get(relation.table)!.has('project_id')&&!relation.match.some((pair:{column:string;rowColumn:string})=>pair.column==='project_id'&&pair.rowColumn==='project_id'))denied();
        Object.freeze(relation.match);Object.freeze(relation);
      }Object.freeze(row.existsAny);
    }
    if(row.updateAny){
      if(!Array.isArray(row.updateAny)||!row.updateAny.length||row.updateAny.length>100)denied();
      for(const branch of row.updateAny){
        if(!Array.isArray(branch.changed)||!branch.changed.length)denied();columns(row.table,branch.changed);
        for(const filter of branch.where??[]){columns(row.table,[filter.column]);if(filter.op==='in'){if(!Array.isArray(filter.values)||!filter.values.length||filter.values.some((value:unknown)=>typeof value!=='string'||value.length>200))denied();Object.freeze(filter.values);}else if(filter.op!=='not-null'||filter.values!==undefined)denied();Object.freeze(filter);}
        Object.freeze(branch.changed);if(branch.where)Object.freeze(branch.where);Object.freeze(branch);
      }
      Object.freeze(row.updateAny);
    }
    if (row.lookup) {
      if (!Array.isArray(row.lookup.match) || !row.lookup.match.length) denied();
      for (const pair of row.lookup.match) { columns(keyTable, [pair.column]); columns(row.table, [pair.rowColumn]); Object.freeze(pair); }
      // When both sides carry a partition, the join must bind it, even if ids happen to be unique today.
      if (tables.get(keyTable)!.has('project_id') && tables.get(row.table)!.has('project_id') && !row.lookup.match.some(pair => pair.column === 'project_id' && pair.rowColumn === 'project_id')) denied();
      Object.freeze(row.lookup.match); Object.freeze(row.lookup);
    }
    for (const filter of row.where ?? []) {
      columns(row.table, [filter.column]);
      if (!['eq', 'gt'].includes(filter.op)) denied();
      if (!(filter.value === null || typeof filter.value === 'string' || typeof filter.value === 'number' && Number.isFinite(filter.value) || typeof filter.value === 'object' && filter.value.actorId === true && Object.keys(filter.value).length === 1)) denied();
      if (typeof filter.value === 'object' && filter.value) Object.freeze(filter.value);
      Object.freeze(filter);
    }
    if (row.revision) {
      if (!Array.isArray(row.revision.key) || !row.revision.key.length) denied();
      columns(row.revision.table, [row.revision.column, ...row.revision.key.map(pair => pair.column)]);
      columns(row.table, [row.revision.rowColumn, ...row.revision.key.map(pair => pair.rowColumn)]);
      for (const pair of row.revision.key) Object.freeze(pair);
      Object.freeze(row.revision.key); Object.freeze(row.revision);
    }
    Object.freeze(row.key); if (row.where) Object.freeze(row.where); Object.freeze(row);
  }
  return Object.freeze(copy);
}
