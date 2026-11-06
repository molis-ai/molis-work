import { canonicalJson } from './identity.js';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncSectionsDeclaration, SyncSectionsDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import { validateSyncTracking } from './sync-tracking-validation.js';
import { syncSectionsDeclaration, syncSectionsTracking } from '@molis-ai/molis-work-plugin-sdk';
function denied(): never { throw new ActionError('actions.input_invalid','同步分区超出当前插件的服务或数据归属'); }
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_]*$/u.test(value);
/** The declaration is checked before opening a library, and the executable definition must match it on start. */
export function validateSyncSections(manifest: PluginManifest, value: SyncSectionsDeclaration, tables: ReadonlyMap<string, ReadonlySet<string>>): void {
  if (!value || !id(value.kind) || typeof value.journal !== 'boolean' || !Array.isArray(value.business) || value.business.length>100 || !Array.isArray(value.platform)) denied();
  const allowed = (name: string, columns: readonly string[]) => { const owner=tables.get(name); if(!id(name)||!owner||!Array.isArray(columns)||!columns.length||columns.some(c=>!id(c)||!owner.has(c)))denied(); };
  const seen = new Set<string>(), owned = new Set<string>();
  for (const section of value.business) {
    if(!id(section.id)||seen.has(section.id)||!Array.isArray(section.tables)||!section.tables.length)denied();seen.add(section.id);
    for(const table of section.tables){
      allowed(table.name,[...table.columns,...table.keys]);if(owned.has(table.name)||table.keys.some((k:string)=>!table.columns.includes(k)))denied();owned.add(table.name);
      if(table.parent){allowed(table.name,[table.parent.column]);allowed(table.parent.table,[table.parent.key,table.parent.projectColumn??'project_id']);}
      else allowed(table.name,[table.projectColumn??'project_id']);
    }
    for(const values of [section.journalTypes,section.receiptOperations,section.sequenceFields])if(!Array.isArray(values)||values.some(v=>typeof v!=='string'||!v||v.length>200))denied();
    // A plugin may only select its declared journal vocabulary, not another owner's history.
    if(section.journalTypes.length||section.receiptOperations.length){
      if(!value.journal)denied();
    }
  }
  if(value.journalIgnoredTypes&&(!value.journal||!Array.isArray(value.journalIgnoredTypes)||value.journalIgnoredTypes.some(type=>typeof type!=='string'||!/^[a-z][a-z0-9_.]*$/u.test(type)||!value.business.some(owner=>owner.journalTypes.some(pattern=>pattern.endsWith('%')?type.startsWith(pattern.slice(0,-1)):type===pattern)))))denied();
  const permissions=new Set(manifest.permissions.map(p=>p.permission));
  if(value.journal&&!permissions.has('journal:project'))denied();
  if(!value.business.length&&!value.platform.length)denied();
  for(const platform of value.platform){
    if(platform==='goal-context'){if(!permissions.has('context-ledger:read')||!permissions.has('context-ledger:write')||!owned.has('goals')||!owned.has('input_bindings'))denied();}
    else if(platform==='attention'){if(!permissions.has('attention:read')||!permissions.has('attention:write'))denied();}
    else denied();
  }
  if(value.business.length)validateSyncTracking(syncSectionsTracking(value),tables);
}
export function checkedSyncSections(manifest: PluginManifest, collectionId: string, definition: SyncSectionsDefinition, tables: ReadonlyMap<string, ReadonlySet<string>>): SyncSectionsDefinition {
  const declared=manifest.sync?.collections.find(c=>c.id===collectionId)?.sections;
  if(!declared)denied();validateSyncSections(manifest,declared,tables);
  if(canonicalJson(declared)!==canonicalJson(syncSectionsDeclaration(definition))||definition.business.some(s=>typeof s.validate!=='function'))denied();
  return Object.freeze({...definition,business:Object.freeze(definition.business.map(s=>Object.freeze({...structuredClone(declared.business.find(d=>d.id===s.id)!),validate:s.validate,...(s.beforeClear?{beforeClear:s.beforeClear}:{}),...(s.project?{project:s.project}:{}),...(s.restore?{restore:s.restore}:{}),...(s.contentRefs?{contentRefs:s.contentRefs}:{})})))});
}
