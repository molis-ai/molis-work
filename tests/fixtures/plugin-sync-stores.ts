import {existsSync} from "node:fs";
import { DatabaseSync } from 'node:sqlite';
import { homeSqlitePath, readStorageSpace, ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { AggregateReplicaContext, AggregateCopyContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type { PluginManifest, PluginStartContext, PluginSyncBinding } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { ProjectCopyOwner } from '@molis-ai/molis-work-contracts/services/placement';
import { openPluginDatabase, pluginSyncDatabaseDeclaration, pluginSyncNamespace, withPluginSyncAuthority } from '@molis-ai/molis-work-app-local-host';
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
export function ownerSyncFixture(home:string,manifest:PluginManifest,bindings:(context:PluginStartContext)=>PluginSyncBinding[]) {
 const declaration=manifest.databases!.home!,space=readStorageSpace(home)??ensureStorageSpace(home);
 let closed=false;const check=()=>{if(closed)throw new Error('原复制接口已关闭');};
 const instance={install_id:manifest.plugin_id+'-test',installation_generation:'one'};
 const connection=openPluginDatabase(home,pluginSyncDatabaseDeclaration(manifest,declaration),check,instance,undefined,manifest);
 const db=new DatabaseSync(homeSqlitePath(home,declaration.store_name));db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1000;');
 const sql={get:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).get(...parameters as never[]),all:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).all(...parameters as never[]),run:(query:string,parameters:readonly unknown[]=[])=>db.prepare(query).run(...parameters as never[])};
 const atomically=<T>(run:()=>T):T=>{check();if(db.isTransaction)return run();db.exec('BEGIN IMMEDIATE');try{const result=run();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
 const context={...instance,plugin_id:manifest.plugin_id,version:manifest.version,deployment:'local',grants:manifest.permissions.map(p=>p.permission),actor_id:space.ownerUserId??'local-person',
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
export function openFormStore(home:string){const o=ownerSyncFixture(home,formManifest,formBindings);return attached(o,new FormStore(o.sql,o.atomically,o.close));}
export function openDatasetStore(home:string){const o=ownerSyncFixture(home,datasetManifest,datasetBindings);return attached(o,new DatasetStore(o.sql,o.atomically,o.close));}
export function openPptStore(home:string){const o=ownerSyncFixture(home,pptManifest,pptBindings);return attached(o,new PptStore(o.sql,o.atomically,o.close));}
export function openLingguangStore(home:string){const o=ownerSyncFixture(home,lingguangManifest,lingguangBindings);return attached(o,new LingguangStore(o.sql,o.atomically,o.close));}
export function openJellyStore(home:string){const o=ownerSyncFixture(home,jellyManifest,jellyBindings);const store=new JellyStore(o.sql,o.atomically,o.close);return attached(o,store);}
export function openCogniaStore(home:string){const o=ownerSyncFixture(home,cogniaManifest,cogniaBindings);return attached(o,new CogniaStore(o.sql,o.atomically,o.close));}
export const openCogniaSyncStore=(home:string)=>openCogniaStore(home);
export function openPagesStore(home:string){const o=ownerSyncFixture(home,pagesManifest,pagesBindings);return attached(o,new PagesStore(o.sql,new Map(),o.atomically,o.close));}
export function openWorkflowsStore(home:string){const o=ownerSyncFixture(home,workflowsManifest,workflowBindings);return attached(o,new WorkflowsStore(o.sql,o.close));}
export function openIssuesSyncStore(home:string,owner:string){const o=ownerSyncFixture(home,issuesManifest,issueBindings);return {...o,store:new IssueStore(o.client,owner)};}
export const openFormCopyOwner=(home:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(homeSqlitePath(home,'form')))return null;const store=openFormStore(home);return {owner:store.copy(scope),close:()=>store.close()};};
export const openDatasetCopyOwner=(home:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(homeSqlitePath(home,'dataset')))return null;const store=openDatasetStore(home);return {owner:store.copy(scope),close:()=>store.close()};};
export const openPptCopyOwner=(home:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(homeSqlitePath(home,'ppt')))return null;const store=openPptStore(home);return {owner:store.copy(scope),close:()=>store.close()};};
export const openLingguangCopyOwner=(home:string,scope:AggregateCopyContext)=>{if(scope.direction==='source'&&!existsSync(homeSqlitePath(home,'lingguang')))return null;const store=openLingguangStore(home);return {owner:store.copy(scope),close:()=>store.close()};};
