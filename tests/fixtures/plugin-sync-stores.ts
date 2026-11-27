import {existsSync} from "node:fs";
import { DatabaseSync } from 'node:sqlite';
import { homeSqlitePath, readStorageSpace, ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { AggregateReplicaContext, AggregateCopyContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { PluginManifest, PluginStartContext, PluginSyncBinding } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ProjectCopyOwner } from '@molis-ai/molis-work-contracts/services/placement';
import { openPartitionPluginDatabase, openPluginDatabase, partitionPluginScope, pluginSyncDatabaseDeclaration, pluginSyncNamespace, withPluginSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import { TodoStore, todoManifest } from '@molis-ai/molis-work-plugin-todo';
import { FormStore, formManifest } from '@molis-ai/molis-work-plugin-form';
import { DatasetStore, datasetManifest } from '@molis-ai/molis-work-plugin-dataset';
import { PptStore, pptManifest } from '@molis-ai/molis-work-plugin-ppt';
import { LingguangStore, lingguangManifest } from '@molis-ai/molis-work-plugin-lingguang';
import { JellyStore, jellyManifest } from '@molis-ai/molis-work-plugin-jelly';
import { CogniaStore, cogniaManifest } from '@molis-ai/molis-work-plugin-cognia';
import { PagesStore, pagesManifest } from '@molis-ai/molis-work-plugin-pages';
import { WorkflowsStore, workflowsManifest } from '@molis-ai/molis-work-plugin-workflows';
import { IssueStore, issuesManifest } from '@molis-ai/molis-work-plugin-issues';
import { createTodoSyncBindings as todoBindings } from '@molis-ai/molis-work-plugin-todo';
import { createFormSyncBindings as formBindings } from '@molis-ai/molis-work-plugin-form';
import { createDatasetSyncBindings as datasetBindings } from '@molis-ai/molis-work-plugin-dataset';
import { createPptSyncBindings as pptBindings } from '@molis-ai/molis-work-plugin-ppt';
import { createLingguangSyncBindings as lingguangBindings } from '@molis-ai/molis-work-plugin-lingguang';
import { createJellySyncBindings as jellyBindings } from '@molis-ai/molis-work-plugin-jelly';
import { createCogniaSyncBindings as cogniaBindings } from '@molis-ai/molis-work-plugin-cognia';
import { createPagesSyncBindings as pagesBindings } from '@molis-ai/molis-work-plugin-pages';
import { createWorkflowsSyncBindings as workflowBindings } from '@molis-ai/molis-work-plugin-workflows';
import { createIssuesSyncBindings as issueBindings } from '@molis-ai/molis-work-plugin-issues';

/** Test-only direct business writer. Replication uses the production verified-library Runtime service and compiled baseline. */
/**
 * `partition` opens a plugin that keeps a library in each partition (`databases.partition`) in that one partition, the way the Host opens it for
 * that partition's instance; a plugin with one Home library (`databases.home`) takes none.
 */
export function ownerSyncFixture(home:string,manifest:PluginManifest,bindings:(context:PluginStartContext)=>PluginSyncBinding[],partition?:string) {
 const space=readStorageSpace(home)??ensureStorageSpace(home);
 let closed=false;const check=()=>{if(closed)throw new Error('原复制接口已关闭');};
 const instance={install_id:manifest.plugin_id+'-test',installation_generation:'one'};
 const scope=partition===undefined?undefined:partitionPluginScope(home,partition,manifest.plugin_id,instance.install_id);
 const declaration=scope?manifest.databases!.partition!:manifest.databases!.home!;
 const connection=scope?openPartitionPluginDatabase(scope,home,manifest,check,instance):openPluginDatabase(home,pluginSyncDatabaseDeclaration(manifest,declaration),check,instance,manifest);
 const db=new DatabaseSync(scope?scope.libraryPath(declaration.store_name):homeSqlitePath(home,declaration.store_name));db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
 const sql={get:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).get(...parameters as never[]),all:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).all(...parameters as never[]),run:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).run(...parameters as never[])};
 const atomically=<T>(run:()=>T):T=>{check();if(db.isTransaction)return run();db.exec('BEGIN IMMEDIATE');try{const result=run();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 const context={...instance,...(partition===undefined?{}:{project_id:partition}),plugin_id:manifest.plugin_id,version:manifest.version,deployment:'local',grants:manifest.permissions.map(p=>p.permission),actor_id:space.ownerUserId??'local-person',
  sync:space.kind==='personal'?{spaceId:space.spaceId,assertActive:check}:undefined,copy:{spaceId:space.spaceId,assertActive:check},services:{database:connection.client,sync:connection.sync},requireGrant:check} as PluginStartContext;
 const binding=bindings(context)[0];
 const run=<T>(scope:AggregateReplicaContext,operation:()=>T):T=>{check();if(scope.spaceId!==space.spaceId)throw new Error('同步空间不匹配');return withPluginSyncAuthority({home,context:scope,assertCollection(identity){check();const collection=manifest.sync!.collections.find(c=>c.id===identity.collection_id);if(identity.plugin_id!==manifest.plugin_id||identity.publisher_signature!==manifest.publisher.signature||identity.schema_version!==collection?.schema_version)throw new Error('TEST_COLLECTION_SCOPE');}},operation);};
 const guarded=<T extends object>(value:T,scope:AggregateReplicaContext):T=>new Proxy(value,{get(target,key){const method=Reflect.get(target,key);return typeof method==='function'? (...args:unknown[])=>run(scope,()=>Reflect.apply(method,target,args)):method;}});
 return {db,sql,atomically,client:connection.client,binding,manifest,namespace:pluginSyncNamespace(manifest,manifest.sync!.collections[0]!.id),
  replica(scope:AggregateReplicaContext):SyncReplicaAdapter {if(!binding||space.kind!=="personal")throw new Error('同步空间不匹配');run(scope,()=>{});return guarded(binding.replica,scope);},
  copy(input:AggregateCopyContext):ProjectCopyOwner {const scope={spaceId:input.spaceId,direction:input.direction,authorize:input.authorize.bind(input),project:input.project.bind(input),canUploadProject:input.canUploadProject.bind(input),hasArtifact:input.hasArtifact.bind(input),...(input.hasReference?{hasReference:input.hasReference.bind(input)}:{})};if(!binding?.copy)throw new Error('COPY_UNAVAILABLE');return guarded(run(scope,()=>binding.copy!(scope.direction)),scope);},
  close(){if(closed)return;closed=true;db.close();connection.close();}};
}
function attached<S extends {close():void}>(owner:ReturnType<typeof ownerSyncFixture>,store:S):S&Pick<typeof owner,'replica'|'copy'|'binding'|'namespace'> {
 return Object.assign(store,{replica:owner.replica,copy:owner.copy,binding:owner.binding,namespace:owner.namespace});
}
export function openTodoStore(home:string,now?:()=>Date){const o=ownerSyncFixture(home,todoManifest,todoBindings);return attached(o,new TodoStore(o.sql,o.atomically,o.close,now));}
export const openTodoSyncStore=(home:string)=>openTodoStore(home);
export function openFormStore(home:string,partition:string){const o=ownerSyncFixture(home,formManifest,formBindings,partition);return attached(o,new FormStore(o.sql,partition,o.atomically,o.close));}
export function openDatasetStore(home:string,partition:string){const o=ownerSyncFixture(home,datasetManifest,datasetBindings,partition);return attached(o,new DatasetStore(o.sql,partition,o.atomically,o.close));}
export function openPptStore(home:string,partition:string){const o=ownerSyncFixture(home,pptManifest,pptBindings,partition);return attached(o,new PptStore(o.sql,partition,o.atomically,o.close));}
export function openLingguangStore(home:string,partition:string){const o=ownerSyncFixture(home,lingguangManifest,lingguangBindings,partition);return attached(o,new LingguangStore(o.sql,partition,o.atomically,o.close));}
/** Jelly's rows over one Home: `read` and `write` hand a store over the owner's library, `write` in one transaction (the Runtime's shape, no caller). */
export function openJellyStore(home:string){const o=ownerSyncFixture(home,jellyManifest,jellyBindings);
 const tx={...o.sql,run:(query:string,parameters:readonly unknown[]=[])=>o.sql.run(query,parameters) as {changes:number|bigint},savepoint:()=>{throw new Error('Jelly 不用保存点');}};
 return attached(o,{read:<T>(run:(store:JellyStore)=>T):T=>run(new JellyStore(tx as never)),write:<T>(run:(store:JellyStore)=>T):T=>o.atomically(()=>run(new JellyStore(tx as never))),close:o.close});}
export function openCogniaStore(home:string){const o=ownerSyncFixture(home,cogniaManifest,cogniaBindings);return attached(o,new CogniaStore(o.sql,o.atomically,o.close));}
export const openCogniaSyncStore=(home:string)=>openCogniaStore(home);
export function openPagesStore(home:string,partition:string){const o=ownerSyncFixture(home,pagesManifest,pagesBindings,partition);return attached(o,new PagesStore(o.sql,partition,new Map(),o.atomically,o.close));}
export function openWorkflowsStore(home:string,partition:string){const o=ownerSyncFixture(home,workflowsManifest,workflowBindings,partition);return attached(o,new WorkflowsStore(o.sql,partition,o.close));}
export function openIssuesSyncStore(home:string,owner:string){const o=ownerSyncFixture(home,issuesManifest,issueBindings);return {...o,store:new IssueStore(o.client,owner)};}
export const openFormCopyOwner=(home:string,partition:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(partitionPluginScope(home,partition,'form','form-test').libraryPath('form')))return null;const store=openFormStore(home,partition);return {owner:store.copy(scope),close:()=>store.close()};};
export const openDatasetCopyOwner=(home:string,partition:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(partitionPluginScope(home,partition,'dataset','dataset-test').libraryPath('dataset')))return null;const store=openDatasetStore(home,partition);return {owner:store.copy(scope),close:()=>store.close()};};
export const openPptCopyOwner=(home:string,partition:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(partitionPluginScope(home,partition,'ppt','ppt-test').libraryPath('ppt')))return null;const store=openPptStore(home,partition);return {owner:store.copy(scope),close:()=>store.close()};};
export const openLingguangCopyOwner=(home:string,partition:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(partitionPluginScope(home,partition,'lingguang','lingguang-test').libraryPath('lingguang')))return null;const store=openLingguangStore(home,partition);return {owner:store.copy(scope),close:()=>store.close()};};

type CopyPort={owner:ProjectCopyOwner;close():void};
const COPY_KINDS={form:['io.molis.work.form:form'],dataset:['io.molis.work.dataset:dataset'],ppt:['io.molis.work.ppt:presentation'],lingguang:['io.molis.work.lingguang:spark','io.molis.work.lingguang:conversation']} as const;
/**
 * One copy owner over a plugin's libraries in several partitions: each partition has its own library (U2), so the asset's key names the
 * partition whose owner reads or writes it. A source library that does not exist has nothing to copy; a target one is made on first write.
 */
export function openPartitionedCopyOwner(plugin:keyof typeof COPY_KINDS,home:string,scope:AggregateCopyContext,open:(home:string,partition:string,scope:AggregateCopyContext)=>CopyPort|null):CopyPort{
 const ports=new Map<string,CopyPort|null>();let closed=false;
 const at=(partition:string)=>{if(closed)throw new Error('原复制接口已关闭');if(!ports.has(partition))ports.set(partition,open(home,partition,scope));return ports.get(partition)??null;};
 const of=(key:string)=>{const partition=(JSON.parse(key) as unknown[])[0];if(typeof partition!=='string')throw new Error('FOREIGN_PROJECT');const port=at(partition);if(!port)throw new Error('FOREIGN_PROJECT');return port.owner;};
 return {owner:{kinds:COPY_KINDS[plugin],snapshot:projectId=>at(projectId)?.owner.snapshot(projectId)??[],
  read:reference=>reference.projectId===null?null:at(reference.projectId)?.owner.read(reference)??null,
  references:asset=>of(asset.key).references(asset),fork:(asset,identity)=>of(asset.key).fork(asset,identity),apply:asset=>of(asset.key).apply(asset)},
  close(){if(closed)return;closed=true;for(const port of ports.values())port?.close();}};
}
