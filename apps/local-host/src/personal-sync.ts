import { configuredAccountEnvironment, configuredSyncOrigin, localEnvironmentName } from './active-release-profile.js';
import { personalRuntimeSyncAuthority } from './personal-runtime-sync-authority.js';
import type {ProjectDeletionService} from './project-deletion-service.js';
import {assertProjectSyncChildren} from './project-sync-children.js';
import { PersonalSync, resolveSyncEndpoint, syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { readPluginReleaseManifest, readPluginRuntimeRecords } from '@molis-ai/molis-work-plugin-runtime';
import { builtinPluginByProjectKey, shippedPartByManifestId } from './plugin-registry.js';
import { withReadOnlyHomePluginStore } from './home-plugin-store.js';
import { personSettingsInstallations } from './partition-platform-services.js';
import { hostSurfaceByProjectKey } from './host-surfaces.js';
import type { StorageSpace } from '@molis-ai/molis-work-contracts/platform/storage';
import type { PersonalAccountLease } from './personal-auth.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import { isPlatformSyncSelection, PLATFORM_SYNC_COLLECTIONS } from './platform-sync-catalog.js';
import {createPersonalFixedVersionBindings} from './personal-artifact-sync.js';
import {createPersonalPluginRegistrations,createPersonalCharacterRegistration} from './personal-plugin-sync.js';
import {createPersonalProjectRegistrations} from './personal-project-sync.js';
import {createPersonalCatalogRegistration} from './personal-catalog-sync.js';
import {createAcceptanceSyncRegistration,createProjectApprovalSyncRegistration,createProjectGuidanceSyncRegistration} from './personal-project-approval-sync.js';
import { personalConfigRegistrations } from './personal-config-sync.js';

/** Built-in bindings only; the sync service and Rust transport never import plugin owners. */
export async function createPersonalSync(home:string,space:StorageSpace,lease:PersonalAccountLease,withCatalog:LocalWebCatalogRunner,assertActive:()=>void,discover?: (authorize:()=>void)=>Promise<readonly SyncRegistration[]>,lifecycleService?:ProjectDeletionService,readCatalog?:import('./personal-runtime-sync-authority.js').SyncCatalogReader) {
  const managed = configuredAccountEnvironment({});
  const origin = configuredSyncOrigin();
  const local = localEnvironmentName() === 'dev' && Boolean(origin);
  const endpoint = resolveSyncEndpoint(managed
    ? { origin: local ? undefined : origin, local }
    : { origin: process.env.MOLIS_WORK_SYNC_ORIGIN, local: process.env.MOLIS_WORK_SYNC_LOCAL === '1' });
  if(!endpoint)return null;
  const check=()=>{lease.assertCurrent();assertActive();};
  let children:readonly SyncRegistration[]=[],discovered:readonly SyncRegistration[]=[];
  const hasPluginReference=(projectId:string,reference:{owner:string;collectionId?:string;assetId:string;version?:number})=>{
    check();
    const manifestId=(builtinPluginByProjectKey(reference.owner)??hostSurfaceByProjectKey(reference.owner))?.manifest.plugin_id??reference.owner;
    const owner=discovered.find(row=>row.selection.plugin_id===manifestId
      &&(reference.collectionId===undefined||row.selection.collection_id===reference.collectionId)
      &&typeof row.hasReference==='function');
    const result=owner?.hasReference?.(projectId,reference.assetId,reference.version)??false;check();return result;
  };
  const {artifacts,registrations:versions}=createPersonalFixedVersionBindings(home,space.spaceId,lease.userId,check,withCatalog);
  const hasArtifact=(projectId:string,id:string,version?:number)=>artifacts.hasReference(projectId,{owner:'artifacts',assetId:id,version});
  const hasReference=(projectId:string,reference:Parameters<typeof hasPluginReference>[1])=>reference.owner==='artifacts'
    ? hasArtifact(projectId,reference.assetId,reference.version) : hasPluginReference(projectId,reference);
  const plugins=createPersonalPluginRegistrations(home,space.spaceId,lease.userId,check,withCatalog,hasArtifact,hasReference);
  plugins.push(createPersonalCharacterRegistration(home,space.spaceId,lease.userId,check));
  for(const plugin of plugins)await plugin.refresh();
  const catalog=createPersonalCatalogRegistration(home,space.spaceId,lease.userId,check,withCatalog,'molis',lifecycleService?{service:lifecycleService,refreshChildren:async()=>{for(const child of [...children,...discovered]){await child.refresh();check();}},assertChildrenSettled:projectId=>assertProjectSyncChildren([...children,...discovered],projectId,check)}:undefined);await catalog.refresh();
  const projectPlugins=createPersonalProjectRegistrations(home,space.spaceId,lease.userId,check,withCatalog,readCatalog);
  for(const plugin of projectPlugins)await plugin.refresh();
  let service: PersonalSync;
  const approvals=createProjectApprovalSyncRegistration(home,space.spaceId,check,withCatalog,readCatalog,()=>service.policy());
  await approvals.refresh();
  const guidance=createProjectGuidanceSyncRegistration(home,space.spaceId,check,withCatalog,readCatalog,()=>service.policy());
  await guidance.refresh();
  const acceptance=createAcceptanceSyncRegistration(home,space.spaceId,check,withCatalog,readCatalog,()=>service.policy());
  await acceptance.refresh();
  // Resolve active Home plugin installations read-only (never waking any plugin or creating plugin-runtime.db) so portable person settings sync automatically once plugins live in Home's install table.
  const personSettings = personSettingsInstallations(() => withReadOnlyHomePluginStore(home, db =>
    readPluginRuntimeRecords(db).flatMap(record => {
      if (record.state === 'uninstalled') return [];
      const shipped = shippedPartByManifestId(record.plugin_id)?.manifest;
      const manifest = readPluginReleaseManifest(db, record)
        ?? (shipped && shipped.publisher.signature === record.publisher_signature ? shipped : null);
      return manifest ? [{ install_id: record.install_id, state: record.state, manifest }] : [];
    })) ?? []);
  const configuration = personalConfigRegistrations({ home, spaceId: space.spaceId, actor: lease.userId, authorize: check, catalog: withCatalog,
    ...(readCatalog ? { readCatalog } : {}), selected: () => service.policy(), personSettings });
  for (const registration of configuration) await registration.refresh();
  const projectConfiguration = new Set(PLATFORM_SYNC_COLLECTIONS
    .filter(row => row.owner === 'surfaces' || row.owner === 'attention').map(row => syncNamespace(row.selection)));
  children = [approvals, guidance, acceptance, ...projectPlugins, ...versions, ...plugins,
    ...configuration.filter(row => projectConfiguration.has(syncNamespace(row.selection)))];
  const runtimeAuthority=personalRuntimeSyncAuthority({home,spaceId:space.spaceId,authorize:check,policy:()=>service.policy(),withCatalog,readCatalog,hasArtifact,hasReference});
  const tagGroup = (registration: SyncRegistration): SyncRegistration => ({
    ...registration,
    group: isPlatformSyncSelection(registration.selection) ? 'platform' : 'plugin',
  });
  const staticRegistrations = [catalog, approvals, guidance, acceptance, ...projectPlugins, ...versions, ...plugins, ...configuration].map(tagGroup);
  const platformConfiguration = new Set(configuration.map(row => syncNamespace(row.selection)));
  service = new PersonalSync({
    home,
    spaceId: space.spaceId,
    endpoint,
    authority: { ...lease, assertCurrent: check },
    registrations: staticRegistrations,
    ...(discover
      ? {
          discover: async () => {
            await runtimeAuthority.refresh();
            discovered = (await discover(check)).filter(row => !platformConfiguration.has(syncNamespace(row.selection)))
              .map(registration => tagGroup(runtimeAuthority.bind(registration)));
            return discovered;
          },
        }
      : {}),
  });
  return service;
}
