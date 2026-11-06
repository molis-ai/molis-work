import { V_FORMAT_PROJECT_SECTIONS } from "./versions.generated.js";
import { attentionContentReplicationDefinition, ATTENTION_SCHEMA_SQL } from "@molis-ai/molis-work-module-attention-resumption";
import type { ReplicaDatabase } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginSyncBinding, SyncSectionsDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { ProjectReplicaDefinition, ProjectReplicaRows, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { goalContextReplicationDefinition, CONTEXT_LEDGER_SCHEMA } from '@molis-ai/molis-work-module-context-ledger';
import { LOCAL_JOURNAL_SCHEMA_SQL, createProjectReplicaSection, createProjectReplicaJournal, mapReplicaSequences, createSqliteReplica, replicaMarkSql } from '@molis-ai/molis-work-storage';
import { createProjectGoalContent } from './project-goal-content.js';
import { pluginSyncAuthority } from './plugin-sync-authority.js';
import { createProjectEvidenceContent } from './project-replication-content.js';
import { replicaError } from './project-replication-errors.js';

type Context = ReturnType<typeof pluginSyncAuthority>;
interface Port { readonly home: string; readonly manifest: PluginManifest; projectId(): string; assertActive(): void; authorize(permission: string): void }
type Adapter = (id: string, create: (db: ReplicaDatabase, context: Context) => SyncReplicaAdapter) => SyncReplicaAdapter;

/** Only structural owner relations are compiled. The shared journal is always the installation's namespace. */
function definitions(manifest: PluginManifest, value: SyncSectionsDefinition): ProjectReplicaDefinition[] {
  const namespace=manifest.plugin_id+':';
  const result: ProjectReplicaDefinition[]=value.business.map(owner=>({ ...owner, assetKind:value.kind,
    journalTypes:owner.journalTypes.map(type=>namespace+type), receiptOperations:owner.receiptOperations.map(type=>namespace+type),
    tables:owner.tables.map(table=>({ name:table.name, columns:table.columns, keys:table.keys, keepRoot:table.keepRoot,
      ...(table.projectColumn?{projectColumn:table.projectColumn}:{}),
      ...(table.parent?{where:`${table.parent.column} IN (SELECT ${table.parent.key} FROM ${table.parent.table} WHERE ${table.parent.projectColumn??'project_id'}=?)`,
        projectExpression:`(SELECT ${table.parent.projectColumn??'project_id'} FROM ${table.parent.table} WHERE ${table.parent.key}=$row.${table.parent.column})`}:{}) })) }));
  for(const platform of value.platform){if(platform==='goal-context')result.push(goalContextReplicationDefinition());else if(platform==='attention')result.push(attentionContentReplicationDefinition());}
  return result;
}
function exact(input:unknown,keys:readonly string[]):Record<string,unknown>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))throw replicaError('replica_invalid');
  return input as Record<string,unknown>;
}
function owner(db:ReplicaDatabase,context:Context,projectId:string,definition:SyncSectionsDefinition,parts:readonly ProjectReplicaDefinition[]){
  const sections=parts.map(d=>createProjectReplicaSection(db,d,projectId));
  const journal=definition.journal?createProjectReplicaJournal(db,projectId,parts):undefined;
  const fields=[...new Set(parts.flatMap(d=>d.sequenceFields))];
  const key=JSON.stringify([projectId,definition.kind,projectId]);
  const check=(input:string)=>{context.authorize();if(input!==key)throw replicaError('replica_key_invalid');context.project(projectId);};
  return {authorize:context.authorize,conflictState:context.conflictState,authorizeKey:check,canUpload:()=>context.canUploadProject(projectId),
    read(input:string){
      check(input);const facts=Object.fromEntries(parts.map((d,i)=>[d.id,sections[i]!.read()]));definition.validate?.(facts);
      if(!Object.values(facts).some(part=>Object.values(part).some(rows=>rows.length)))return null;
      const history=journal?.read();return {format:V_FORMAT_PROJECT_SECTIONS,spaceId:context.spaceId,project:{id:projectId,title:context.project(projectId).title},
        facts:history?mapReplicaSequences(facts,fields,history.encode):facts,...(history?{journal:history.value}:{})};
    },
    apply(input:string,value:unknown){
      check(input);db.exec('PRAGMA defer_foreign_keys=ON');
      if(value===null){if(journal)throw replicaError('replica_invalid');[...sections].reverse().forEach(s=>s.clear(true));return;}
      const wire=exact(value,['format','spaceId','project','facts',...(journal?['journal']:[])]),project=exact(wire.project,['id','title']);
      if(wire.format!==V_FORMAT_PROJECT_SECTIONS||wire.spaceId!==context.spaceId||project.id!==projectId||typeof project.title!=='string'||!project.title.trim()||project.title.length>120)throw replicaError('replica_scope_mismatch');
      const facts=exact(wire.facts,parts.map(d=>d.id));
      if(Buffer.byteLength(JSON.stringify(wire))>100000000)throw replicaError('replica_limit');
      // Stable event anchors are decoded before owner validation, then verified again against the committed journal sequence.
      let restored=facts as Record<string,ProjectReplicaRows>;
      if(journal){const history=journal.validate(wire.journal);const ids=new Map(history.events.map((e,i)=>[String(e.event_id),i+1]));
        const decode=(v:unknown)=>{if(v==='@start')return 0;if(typeof v!=='string'||!v.startsWith('@event:')||!ids.has(v.slice(7)))throw replicaError('replica_references_invalid');return ids.get(v.slice(7))!;};
        restored=mapReplicaSequences(facts,fields,decode) as Record<string,ProjectReplicaRows>;
      }
      parts.forEach((d,i)=>sections[i]!.validate(restored[d.id]));definition.validate?.(restored);
      [...sections].reverse().forEach(s=>s.clear());
      if(journal){const decode=journal.apply(wire.journal);restored=mapReplicaSequences(facts,fields,decode) as Record<string,ProjectReplicaRows>;
        for(const rows of Object.values(restored).flatMap(part=>Object.values(part)))for(const row of rows)if('journal_seq' in row&&'event_id' in row&&row.journal_seq!==decode('@event:'+row.event_id))throw replicaError('replica_references_invalid');}
      definition.validate?.(restored);parts.forEach((d,i)=>sections[i]!.write(sections[i]!.validate(restored[d.id])));
      if(db.prepare('PRAGMA foreign_key_check').get())throw replicaError('replica_references_invalid');context.authorize();
    },
  };
}
export function createPluginSectionsBinding(port:Port,collectionId:string,definition:SyncSectionsDefinition,adapter:Adapter):PluginSyncBinding{
  const parts=definitions(port.manifest,definition);
  const grants=()=>{
    port.assertActive();
    if(definition.journal)port.authorize('journal:project');
    if(definition.platform.includes('goal-context')){port.authorize('context-ledger:read');port.authorize('context-ledger:write');}
    if(definition.platform.includes('attention')){port.authorize('attention:read');port.authorize('attention:write');}
    port.assertActive();
  };
  const authority=()=>{port.assertActive();const collection=port.manifest.sync!.collections.find(c=>c.id===collectionId)!;
    grants();const context=pluginSyncAuthority(port.home,{plugin_id:port.manifest.plugin_id,publisher_id:port.manifest.publisher.publisher_id,publisher_signature:port.manifest.publisher.signature,collection_id:collectionId,schema_version:collection.schema_version});context.authorize();return context;};
  const authorize=()=>{authority();grants();};
  const codec=()=>{const context=authority();return definition.journal?createProjectGoalContent(context.spaceId,key=>{const value:unknown=JSON.parse(key);if(!Array.isArray(value)||value.length!==3||value[1]!==definition.kind||value[0]!==value[2]||typeof value[0]!=='string')throw replicaError('replica_key_invalid');return value[0];},authorize):createProjectEvidenceContent(port.home,parts,definition.kind,context.spaceId,authorize);};
  return {collection_id:collectionId,replica:adapter(collectionId,(db,context)=>{const check=context.authorize;const guarded={...context,authorize(){grants();check();grants();}};guarded.authorize();return createSqliteReplica(db,owner(db,guarded,port.projectId(),definition,parts));}),
    content:{encode:(...args)=>codec().encode(...args),decode:(...args)=>codec().decode(...args)},
    locate:key=>{const value:unknown=JSON.parse(key);return Array.isArray(value)&&typeof value[0]==='string'?'/projects/'+encodeURIComponent(value[0])+'/':null;}};
}

/** Trusted platform tables exist only in the reference scratch; they are never plugin-owned objects. */
export function sectionsPlatformPrelude(manifest:PluginManifest):string{
  const selected=(manifest.sync?.collections??[]).filter(c=>c.sections);
  return (selected.some(c=>c.sections!.platform.includes('attention'))?ATTENTION_SCHEMA_SQL:'') + (selected.some(c=>c.sections!.platform.includes('goal-context'))?CONTEXT_LEDGER_SCHEMA:'') +
    (selected.some(c=>c.sections!.journal)?LOCAL_JOURNAL_SCHEMA_SQL:'');
}
/** Changes to the explicitly joined platform slice participate in the same current baseline. */
export function sectionsPlatformSchema(manifest:PluginManifest,collectionId:string,namespace:string):string{
  const declared=manifest.sync?.collections.find(c=>c.id===collectionId)?.sections;if(!declared)return '';
  const mark=(project:string)=>replicaMarkSql(`json_array(${project},'${declared.kind}',${project})`).replace(/\breplica_/gu,namespace+'_replica_');
  let sql='';
  if(declared.platform.includes('goal-context'))for(const operation of ['INSERT','UPDATE','DELETE']){
    const row=operation==='DELETE'?'OLD':'NEW';
    sql+=`CREATE TRIGGER ${namespace}_context_${operation.toLowerCase()} ${operation==='DELETE'?'BEFORE':'AFTER'} ${operation} ON context_edges WHEN ${row}.scope_kind='personal' AND (json_extract(${row}.source_json,'$.module')='goals' OR json_extract(${row}.target_json,'$.module')='goals') BEGIN ${mark(row+'.scope_id')} END;\n`;
  }
  if(declared.platform.includes('attention'))for(const table of attentionContentReplicationDefinition().tables)for(const operation of ['INSERT','UPDATE','DELETE']){
    const row=operation==='DELETE'?'OLD':'NEW';sql+=`CREATE TRIGGER ${namespace}_${table.name}_${operation.toLowerCase()} ${operation==='DELETE'?'BEFORE':'AFTER'} ${operation} ON ${table.name} BEGIN ${mark(row+'.project_id')} END;\n`;
  }
  if(declared.journal){const prefix=(manifest.plugin_id+':').replaceAll("'","''"), ignored=(declared.journalIgnoredTypes??[]).map(type=>"'"+prefix+type.replaceAll("'","''")+"'").join(',');sql+=`CREATE TRIGGER ${namespace}_journal AFTER INSERT ON events WHEN substr(NEW.type,1,${manifest.plugin_id.length+1})='${prefix}'${ignored?' AND NEW.type NOT IN ('+ignored+')':''} BEGIN ${mark('NEW.project_id')} END;\n`;}
  return sql;
}
