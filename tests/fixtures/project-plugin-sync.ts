import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureStorageSpace, bindDatabaseSpace, type StorageSpace } from '@molis-ai/molis-work-storage';
import { writeProjectRoot } from '@molis-ai/molis-work-module-projects';
import { LocalProjectDatabase, openPluginProjectLibrary, withPluginSyncAuthority } from '@molis-ai/molis-work-app-local-host';
import type { PluginManifest, PluginStartContext, PluginSyncBinding, PluginHostServices } from '@molis-ai/molis-work-contracts/platform/plugin';

/** Real verified project library and Runtime sync admission; only the business test writer bypasses the plugin client. */
export function projectPluginSyncFixture(input: {
  home?: string; space: StorageSpace; projectId: string; manifest: PluginManifest;
  bindings(context: PluginStartContext): readonly PluginSyncBinding[];
  collectionId: string; authorize?(permission?: string): void; services?: Partial<PluginHostServices>;
}) {
  const home = input.home ?? mkdtempSync(join(tmpdir(), 'project-plugin-sync-'));
  ensureStorageSpace(home, input.space);
  const path = join(home, 'fixture-project.db'), store = new LocalProjectDatabase(path), db = store.db;
  bindDatabaseSpace(db, input.space);
  writeProjectRoot(db, input.projectId, '2026-10-18T00:00:00.000Z');
  let closed = false;
  const check = (permission?: string) => { if (closed) throw new Error('SYNC_INSTANCE_CLOSED'); input.authorize?.(permission); };
  const instance = {install_id: input.manifest.plugin_id + '-test', installation_generation: 'one'};
  const library = openPluginProjectLibrary({db, path}, input.manifest, check, instance, {}, home);
  const context = {...instance, plugin_id: input.manifest.plugin_id, version: input.manifest.version, deployment: 'local',
    project_id: input.projectId, actor_id: input.space.ownerUserId ?? 'local-person', grants: input.manifest.permissions.map(p=>p.permission),
    sync: {spaceId: input.space.spaceId, assertActive: check}, requireGrant: check,
    services: {...input.services, project_database: library.client, sync: library.sync}} as PluginStartContext;
  const binding = input.bindings(context).find(row=>row.collection_id===input.collectionId);
  if (!binding) throw new Error('TEST_COLLECTION_NOT_REGISTERED');
  const scope = {spaceId: input.space.spaceId, authorize:()=>check(),
    canUploadProject: (id: string)=>id===input.projectId, project: (id: string)=>{if(id!==input.projectId)throw new Error('TEST_PROJECT_SCOPE');return {title:'Test'};},
    hasArtifact:()=>false, hasReference:()=>false};
  const run = <T>(operation:()=>T):T => withPluginSyncAuthority({home, context:scope, assertCollection(identity) {
    check(); const declaration=input.manifest.sync!.collections.find(row=>row.id===input.collectionId)!;
    if(identity.plugin_id!==input.manifest.plugin_id || identity.publisher_id!==input.manifest.publisher.publisher_id || identity.publisher_signature!==input.manifest.publisher.signature || identity.collection_id!==input.collectionId || identity.schema_version!==declaration.schema_version)throw new Error('TEST_COLLECTION_SCOPE');
  }}, operation);
  const guarded=<T extends object>(value:T):T=>new Proxy(value,{get(target,key){const method=Reflect.get(target,key);return typeof method==='function'?(...args:unknown[])=>run(()=>Reflect.apply(method,target,args)):method;}});
  return {home,db,store,client:library.client,replica:guarded(binding.replica),content:binding.content?guarded(binding.content):undefined,run,
    close(){if(closed)return;closed=true;library.close();store.close();if(!input.home)rmSync(home,{recursive:true,force:true});}};
}
