import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { bindRuntimeSyncCollection, pluginManifestDigest } from '@molis-ai/molis-work-plugin-runtime';
import { syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { HomePluginPlatform } from './home-plugins.js';
import { runningInstalledPluginPlatform } from './installed-plugin-host.js';
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from './project-host.js';
import { runningProjectPlatform } from './project-plugins.js';
import { runtimeSyncRegistration, type RuntimeSyncOwner } from './runtime-sync-registration.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import type { SpaceWebSurface } from './space-web-server.js';
import { ensureHomeStorageOwner } from './home-storage-lifetime.js';
import { withPassiveProjectChange } from './passive-sync-execution.js';

export function runtimeSyncSurface(server: SpaceWebSurface, home: string, host: MolisWorkLocalHost, withCatalog: LocalWebCatalogRunner, readCatalog?:import('./personal-runtime-sync-authority.js').SyncCatalogReader): SpaceWebSurface {
  server.withSyncCatalog=withCatalog;
  server.readSyncCatalog=readCatalog;
  server.discoverSync = authorize => discoverRuntimeSyncCollections(home, ensureStorageSpace(home).spaceId, host, withCatalog, authorize);
  server.processItemsMaintenance = {
    home, owner: () => ensureHomeStorageOwner(host, home),
    // A project's library is adopted only while its runtime is closed and no new operation on it can start (the passive hold that
    // sync's own project changes use); a project that is not open is only held.
    holdProject: (projectId, work) => withPassiveProjectChange(home, projectId, async () => {
      const project = await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects().find(row => row.project_id === projectId));
      if (project) await host.closeProject(molisWorkHostProjectReference({ databasePath: project.database_path, projectId }));
      return work();
    }),
    names: async () => new Map((await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects())).map(row => [row.project_id, row.display_name])),
  };
  return server;
}

/** Trusted Host directory. Only registered, enabled installations supply data handlers; discovery grants nothing. */
export async function discoverRuntimeSyncCollections(home: string, spaceId: string, host: MolisWorkLocalHost,
  withCatalog: LocalWebCatalogRunner, authorize: () => void): Promise<SyncRegistration[]> {
  authorize();
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId) throw new ActionError('actions.forbidden', '同步目录只接受当前个人空间');
  const grouped = new Map<string, RuntimeSyncOwner[]>();
  const homeOwners = new Map<string, string>(), incompatible = new Set<string>();
  const collect = async (platform: HomePluginPlatform | null, projectId: string | null) => {
    authorize(); if (!platform) return;
    for (const pluginId of platform.supervisor.enabledPluginIds()) {
      const manifest = platform.supervisor.manifest(pluginId);
      const collections = manifest?.sync?.collections ?? [];
      for (const collection of collections) {
        await isolate(async () => {
        authorize();
        const binding = await bindRuntimeSyncCollection(platform.supervisor, pluginId, collection.id, {
          authorize, record: id => platform.runtime.get(id),
        }, {activeOnly:true});
        authorize(); if (!binding) return;
        const key = syncNamespace({ plugin_id: binding.plugin_id, publisher_id: binding.publisher_id,
          publisher_signature: binding.publisher_signature, collection_id: binding.collection.id, schema_version: binding.collection.schema_version });
        // A project activation may hold a Home library. Its journal belongs to that one library,
        // not to whichever project happened to start its current authorized instance first.
        const homeLibrary = collection.database === 'home' || (!collection.database && manifest?.databases?.home && !manifest.databases.project);
        if (incompatible.has(key)) return;
        if (homeLibrary) {
          const digest = pluginManifestDigest(manifest!), prior = homeOwners.get(key);
          if (prior && prior !== digest) { grouped.delete(key); incompatible.add(key); return; }
          if (prior) return;
          homeOwners.set(key, digest);
        }
        const rows = grouped.get(key) ?? []; rows.push({ projectId: homeLibrary ? null : projectId, binding }); grouped.set(key, rows);
        });
      }
    }
  };
  const isolate = async (run: () => Promise<void>) => {
    try { await run(); }
    catch { authorize(); /* A broken local owner remains unavailable. Account revocation must still abort discovery. */ }
  };
  await isolate(async () => { if (host.homePlugins) await collect(await host.homePlugins.ready(), null); });
  authorize();
  const projects = await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects());
  authorize();
  for (const project of [...projects].sort((a,b)=>a.project_id.localeCompare(b.project_id))) {
    await isolate(async () => {
      authorize();
      const current = await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects().find(row => row.project_id === project.project_id));
      authorize(); if (!current || current.database_path !== project.database_path) return;
      await host.synchronization.withExistingProject(molisWorkHostProjectReference({ databasePath: current.database_path, projectId: current.project_id }), async runtime => {
        await collect(await runningProjectPlatform(runtime.store, runtime.project_id), runtime.project_id);
        await collect(await runningInstalledPluginPlatform(runtime.store, runtime.project_id), runtime.project_id);
      });
      authorize();
    });
  }
  authorize();
  return [...grouped.values()].map(owners => runtimeSyncRegistration(home, spaceId, owners, authorize));
}
