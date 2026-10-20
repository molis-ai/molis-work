import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { BUILDER_PLUGIN_ID, builderManifest,prepareBuilderLocalEdit,type AgentBuilderWorkflow } from '@molis-ai/molis-work-plugin-builder';
import {assertPassiveSyncIdle} from '../passive-sync-execution.js';

/** Host-created sandbox identities for live authoring trials, never an identifier from capability input. */
export const STABLE_PREVIEW = 'studio-preview:';

/** Keep the user's original revision: only this successful local fork may advance its own action premise. */
export function prepareStudioAction(workflow:AgentBuilderWorkflow,home:string,projectId:string,id:string,body:Record<string,unknown>){
 if(body.action!=='resume'&&body.action!=='undo')return body;const build=workflow.store.require(id);
 if(body.revision!==build.revision||build.active)return body;
 const selected=body.action==='undo'?build.history.at(-1):build;if(!selected)return body;
 const directory=prepareBuilderLocalEdit({home,assertIdle:(pid,item)=>assertPassiveSyncIdle(home,pid,BUILDER_PLUGIN_ID,item)},projectId,{...build,directory:selected.directory});
 if(directory===selected.directory)return body;
 const changed=workflow.store.update(id,build.revision,row=>{if(body.action==='undo')row.history.at(-1)!.directory=directory;else row.directory=directory;});return {...body,revision:changed.revision};
}

/** Stable authoring namespace of the Studio in this project. */
export function studioStorage(db: ConstructorParameters<typeof SqlitePluginPrivateStorage>[0], projectId: string): PluginPrivateStorage {
  const context = { install_id: 'agent-studio:' + projectId, plugin_id: BUILDER_PLUGIN_ID, version: builderManifest.version, deployment: 'local' as const,
    grants: ['storage:private'], project_id: projectId, requireGrant() {} };
  return new SqlitePluginPrivateStorage(db).forPlugin(context, builderManifest);
}
