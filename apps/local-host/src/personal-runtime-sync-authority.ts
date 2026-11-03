import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { AggregateReplicaContext } from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import { createSyncConflictState } from '@molis-ai/molis-work-plugin-sdk';
import { syncNamespace, type SyncRegistration, type SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import { withPluginSyncAuthority } from './plugin-sync-authority.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import { projectSyncCatalog } from './project-sync-catalog.js';
import { projectPluginJudge } from './project-action-availability.js';
export type SyncCatalogReader = ReturnType<typeof import('./web-catalog-access.js').createWebCatalogAccess>['read'];

/** Supplies operation-scoped account, policy and project facts to Runtime contributions. */
export function personalRuntimeSyncAuthority(options: {
  home: string; spaceId: string; authorize(): void;
  policy(): {revision: number; selections: readonly SyncSelection[]};
  withCatalog: LocalWebCatalogRunner;
  readCatalog?: SyncCatalogReader;
  hasArtifact: AggregateReplicaContext['hasArtifact'];
  hasReference: AggregateReplicaContext['hasReference'];
}) {
  const refresh = async () => {
    options.authorize();await options.withCatalog({homeDirectory: options.home},()=>undefined);options.authorize();
  };
  const bind = (registration: SyncRegistration): SyncRegistration => {
    const namespace = syncNamespace(registration.selection);
    const project = (projectId:string) => {
        if(!options.readCatalog)throw new ActionError('actions.forbidden','同步项目权限目录尚未就绪');
        return options.readCatalog(catalog=>{
          const current=projectSyncCatalog(catalog).find(row=>row.project_id===projectId);
          if(!current||projectPluginJudge(catalog,projectId,options.home)(registration.selection.plugin_id)===false)
            throw new ActionError('actions.forbidden','当前项目未授权此同步插件');
          return current;
        });
      };
    const run = <T>(operation: () => T): T => {
      options.authorize();
      const revision = options.policy().revision;
      const touched = new Set<string>();
      const authorize = () => {
        options.authorize();
        const policy = options.policy();
        if (policy.revision !== revision || !policy.selections.some(selection => syncNamespace(selection) === namespace)
          || registration.available?.() === false) throw new ActionError('actions.forbidden', '同步集合授权或运行实例已变化');
        for(const projectId of touched)project(projectId);
      };
      const context: AggregateReplicaContext = {
        spaceId: options.spaceId, authorize, conflictState: createSyncConflictState,
        canUploadProject(projectId) { authorize();try{return !project(projectId).recycled;}catch(error){if(error instanceof ActionError&&error.code==='actions.forbidden')return false;throw error;} },
        project(projectId) { authorize();const current=project(projectId);touched.add(projectId);return {title:current.display_name}; },
        hasArtifact(projectId, id, version) { authorize();project(projectId);touched.add(projectId); const value = options.hasArtifact(projectId, id, version); authorize(); return value; },
        hasReference(projectId, reference) { authorize();project(projectId);touched.add(projectId); const value = options.hasReference?.(projectId, reference) ?? false; authorize(); return value; },
      };
      return withPluginSyncAuthority({home: options.home, context, assertCollection(identity) {
        authorize(); if (syncNamespace(identity) !== namespace) throw new ActionError('actions.forbidden', '同步操作不能访问其他集合');
      }}, () => {
        const result = operation();
        if (result instanceof Promise) return result.then(value => { authorize(); return value; }) as T;
        authorize(); return result;
      });
    };
    const content = registration.content;
    const checkKey=(key:string,value?:unknown)=>registration.withReplica(replica=>{if(!replica.authorizeKey)throw new ActionError('actions.forbidden','同步主人尚未声明标识授权');replica.authorizeKey(key,value);});
    return {...registration,
      ...(registration.hasReference?{hasReference(projectId:string,id:string,version?:number){
        options.authorize();if(registration.available?.()===false)return false;
        try{project(projectId);}catch(error){if(error instanceof ActionError&&error.code==='actions.forbidden')return false;throw error;}
        const found=registration.hasReference!(projectId,id,version);options.authorize();
        if(registration.available?.()===false)return false;
        try{project(projectId);}catch(error){if(error instanceof ActionError&&error.code==='actions.forbidden')return false;throw error;}
        return found;
      }}:{}),
      async refresh() { await refresh(); await registration.refresh(); options.authorize(); },
      withReplica(operation) { return run(() => registration.withReplica(operation)); },
      prepare(event, settings) { return run(async () => { checkKey(event.key);await registration.prepare(event, settings);checkKey(event.key); options.authorize(); }); },
      ...(registration.prepareUploads ? {prepareUploads: () => run(() => registration.prepareUploads!())} : {}),
      ...(registration.locate ? {locate: (key: string) => run(() => registration.locate!(key))} : {}),
      ...(registration.withMutation ? {withMutation: ((scope, commit) => run(() => registration.withMutation!(scope, commit))) as NonNullable<SyncRegistration['withMutation']>} : {}),
      ...(content ? {content: {
        encode: (key, value) => run(() => {checkKey(key,value);const result=content.encode(key,value);checkKey(key,value);return result;}),
        decode: (key, value, read) => run(async () => {checkKey(key);const result=await content.decode(key,value,async reference=>{checkKey(key);const bytes=await read(reference);checkKey(key);return bytes;});checkKey(key,result);return result;}),
        ...(content.prepare ? {prepare: (key: string, value: unknown) => run(async () => {checkKey(key,value);await content.prepare!(key,value);checkKey(key,value);})} : {}),
      } as NonNullable<SyncRegistration['content']>} : {}),
    };
  };
  return {refresh, bind};
}
