import type { SyncAggregateDeclaration, SyncAggregateDefinition, SyncTrackedTable } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import { syncError } from './sync-errors.js';
function fail(): never { throw syncError('invalid', '同步库声明不合法'); }
const id = (v: unknown) => typeof v === 'string' && /^[a-z][a-z0-9_]*$/u.test(v);
function row(v: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !keys.includes(k))) fail();
  return v as Record<string, unknown>;
}
function list(v: unknown): unknown[] { if (!Array.isArray(v) || !v.length || v.length > 100) fail(); return v; }
function ids(v: unknown): void { if (list(v).some(x => !id(x))) fail(); }
export function parseSyncTracking(value: unknown): readonly SyncTrackedTable[] {
  for (const input of list(value)) {
    const entry = row(input,['table','key','lookup','where','revision','updateAny','existsAny']); if (!id(entry.table)) fail();
    for (const inputPart of list(entry.key)) {
      const part = row(inputPart,['column','literal','scope']); if (Object.keys(part).length !== 1) fail();
      if ('column' in part ? !id(part.column) : 'scope' in part ? part.scope !== 'projectId' : !(part.literal === null || typeof part.literal === 'string' || typeof part.literal === 'number' && Number.isFinite(part.literal))) fail();
    }
    if(entry.existsAny!==undefined)for(const inputRelation of list(entry.existsAny)){
      const relation=row(inputRelation,['table','match']);if(!id(relation.table))fail();
      for(const inputPair of list(relation.match)){const pair=row(inputPair,['column','rowColumn']);if(!id(pair.column)||!id(pair.rowColumn))fail();}
    }
    if (entry.lookup !== undefined) {
      const lookup = row(entry.lookup,['table','match']); if (!id(lookup.table)) fail();
      for (const inputPair of list(lookup.match)) { const pair = row(inputPair,['column','rowColumn']); if (!id(pair.column) || !id(pair.rowColumn)) fail(); }
    }
    if (entry.where !== undefined) for (const inputFilter of list(entry.where)) {
      const filter = row(inputFilter,['column','op','value']); if (!id(filter.column) || !['eq','gt'].includes(String(filter.op))) fail();
      const value = filter.value;
      if (!(value === null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'object' && value !== null && row(value,['actorId']).actorId === true)) fail();
    }
    if (entry.updateAny !== undefined) for (const inputBranch of list(entry.updateAny)) {
      const branch=row(inputBranch,['changed','where']); ids(branch.changed);
      if(branch.where!==undefined)for(const inputFilter of list(branch.where)){
        const filter=row(inputFilter,['column','op','values']);if(!id(filter.column)||!['in','not-null'].includes(String(filter.op)))fail();
        if(filter.op==='in'){if(list(filter.values).some(value=>typeof value!=='string'||value.length>200))fail();}
        else if(filter.values!==undefined)fail();
      }
    }
    if (entry.revision !== undefined) {
      const revision = row(entry.revision,['table','key','column','rowColumn']); if (!id(revision.table) || !id(revision.column) || !id(revision.rowColumn)) fail();
      for (const inputPair of list(revision.key)) { const pair = row(inputPair,['column','rowColumn']); if (!id(pair.column) || !id(pair.rowColumn)) fail(); }
    }
  }
  return structuredClone(value) as readonly SyncTrackedTable[];
}
export function parseSyncAggregates(value: unknown): readonly SyncAggregateDeclaration[] {
  for (const input of list(value)) {
    const entry = row(input,['kind','table','columns','children','versionColumn','timestampVersionColumn','busyColumn']);
    if (!id(entry.kind) || !id(entry.table)) fail(); ids(entry.columns);
    for (const key of ['versionColumn','timestampVersionColumn','busyColumn']) if (entry[key] !== undefined && !id(entry[key])) fail();
    if (!Array.isArray(entry.children) || entry.children.length > 100) fail();
    for (const inputChild of entry.children) {
      const child = row(inputChild,['table','parent','columns','orderBy','identityColumns']); if (!id(child.table) || !id(child.parent) || typeof child.orderBy !== 'string' || !child.orderBy.split(',').every(term => /^\s*[a-z][a-z0-9_]*(?:\s+(?:ASC|DESC))?\s*$/iu.test(term))) fail();
      ids(child.columns); if (child.identityColumns !== undefined) ids(child.identityColumns);
    }
  }
  return structuredClone(value) as readonly SyncAggregateDeclaration[];
}
/** Strip executable callbacks; the declaration is serialized into the Manifest before any library opens. */
export function syncAggregateDeclaration(definitions: readonly SyncAggregateDefinition[]): readonly SyncAggregateDeclaration[] {
  return parseSyncAggregates(definitions.map(({validate: _validate, dependencies: _dependencies, copy: _copy, ...declaration}) => declaration));
}
