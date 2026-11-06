import type { ProjectReplicaDefinition } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { SyncSectionDefinition, SyncSectionTable, SyncSectionsDefinition, SyncSectionsDeclaration, SyncTrackedTable } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import { syncError } from './sync-errors.js';

/** Convert an owner's row projection into data-only relations; arbitrary predicates never enter the public service. */
export function syncSection(definition: ProjectReplicaDefinition): SyncSectionDefinition {
  const tables: SyncSectionTable[] = definition.tables.map(table => {
    let parent: SyncSectionTable['parent'];
    if (table.where) {
      const match = /^([a-z_]+) IN \(SELECT ([a-z_]+) FROM ([a-z_]+) WHERE project_id=\?\)$/u.exec(table.where);
      if (!match) throw syncError('invalid', '同步分区必须声明结构化归属');
      parent = { column: match[1]!, key: match[2]!, table: match[3]! };
    }
    return { name: table.name, columns: [...table.columns], keys: [...table.keys], ...(table.keepRoot ? {keepRoot:true} : {}),
      ...(table.projectColumn ? { projectColumn: table.projectColumn } : {}), ...(parent ? {parent} : {}) };
  });
  return { id: definition.id, tables, journalTypes: [...definition.journalTypes], receiptOperations: [...definition.receiptOperations], sequenceFields: [...definition.sequenceFields],
    validate: definition.validate, ...(definition.beforeClear ? {beforeClear:definition.beforeClear} : {}), ...(definition.project ? {project:definition.project} : {}), ...(definition.restore ? {restore:definition.restore} : {}), ...(definition.contentRefs ? {contentRefs:definition.contentRefs} : {}) };
}
export function syncSectionsDeclaration(definition: SyncSectionsDefinition): SyncSectionsDeclaration {
  return {kind:definition.kind, platform:[...definition.platform], journal:definition.journal, ...(definition.journalIgnoredTypes?{journalIgnoredTypes:[...definition.journalIgnoredTypes]}:{}),
    business:definition.business.map(({validate:_validate,project:_project,restore:_restore,contentRefs:_refs,beforeClear:_clear,...declaration}) => structuredClone(declaration))};
}
export function syncSectionsTracking(definition: SyncSectionsDeclaration): readonly SyncTrackedTable[] {
  return definition.business.flatMap(owner => owner.tables.map(table => {
    const column = table.parent?.projectColumn ?? table.projectColumn ?? 'project_id';
    return {table:table.name, key:[{column},{literal:definition.kind},{column}],
      ...(table.parent ? { lookup: {table:table.parent.table, match:[{column:table.parent.key,rowColumn:table.parent.column}]} } : {})};
  }));
}

export function parseSyncSections(input: unknown): SyncSectionsDeclaration {
  function fail(): never { throw syncError('invalid','同步分区声明不合法'); }
  const object=(value:unknown,keys:readonly string[]):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail();return value as Record<string,unknown>;};
  const list=(value:unknown):unknown[]=>{if(!Array.isArray(value)||value.length>100)fail();return value;};
  const names=(value:unknown)=>{for(const name of list(value))if(typeof name!=='string'||!name||name.length>200)fail();};
  const value=object(input,['kind','business','platform','journal','journalIgnoredTypes']);
  if(typeof value.kind!=='string'||!/^[a-z][a-z0-9_]*$/u.test(value.kind)||typeof value.journal!=='boolean')fail();
  if(list(value.platform).some(p=>p!=='goal-context'&&p!=='attention'))fail();
  if(value.journalIgnoredTypes!==undefined)names(value.journalIgnoredTypes);
  const business=list(value.business);if(!business.length&&!list(value.platform).length)fail();
  for(const item of business){const section=object(item,['id','tables','journalTypes','receiptOperations','sequenceFields']);if(typeof section.id!=='string')fail();
    for(const key of ['journalTypes','receiptOperations','sequenceFields'])names(section[key]);
    for(const item of list(section.tables)){const table=object(item,['name','columns','keys','keepRoot','projectColumn','parent']);if(typeof table.name!=='string')fail();names(table.columns);names(table.keys);
      if(table.keepRoot!==undefined&&typeof table.keepRoot!=='boolean')fail();if(table.projectColumn!==undefined&&typeof table.projectColumn!=='string')fail();
      if(table.parent!==undefined){const parent=object(table.parent,['table','column','key','projectColumn']);for(const key of ['table','column','key'])if(typeof parent[key]!=='string')fail();}
    }
  }
  return structuredClone(input) as SyncSectionsDeclaration;
}
