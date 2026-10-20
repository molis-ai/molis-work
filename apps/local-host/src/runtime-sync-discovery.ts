import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { bindRuntimeSyncCollection } from '@molis-ai/molis-work-plugin-runtime';
import { syncNamespace, type SyncRegistration } from '@molis-ai/molis-work-module-sync-replication';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';
import type { HomePluginPlatform } from './home-plugins.js';
import { runningInstalledPluginPlatform } from './installed-plugin-host.js';
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from './project-host.js';
import { runningProjectPlatform } from './project-plugins.js';
import { runtimeSyncRegistration, type RuntimeSyncOwner } from './runtime-sync-registration.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';
import type { SpaceWebSurface } from './space-web-server.js';

export function runtimeSyncSurface(server: SpaceWebSurface, home: string, host: MolisWorkLocalHost, withCatalog: LocalWebCatalogRunner): SpaceWebSurface {
  server.discoverSync = authorize => discoverRuntimeSyncCollections(home, ensureStorageSpace(home).spaceId, host, withCatalog, authorize);
  return server;
}

/** Trusted Host directory. Only registered, enabled installations supply data handlers; discovery grants nothing. */
export async function discoverRuntimeSyncCollections(home: string, spaceId: string, host: MolisWorkLocalHost,
  withCatalog: LocalWebCatalogRunner, authorize: () => void): Promise<SyncRegistration[]> {
  authorize();
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal' || space.spaceId !== spaceId) throw new ActionError('actions.forbidden', '同步目录只接受当前个人空间');
  const grouped = new Map<string, RuntimeSyncOwner[]>();
  const collect = async (platform: HomePluginPlatform | null, projectId: string | null) => {
    authorize(); if (!platform) return;
    for (const pluginId of platform.supervisor.enabledPluginIds()) {
      const collections = platform.supervisor.manifest(pluginId)?.sync?.collections ?? [];
      for (const collection of collections) {
        await isolate(async () => {
        authorize();
        const binding = await bindRuntimeSyncCollection(platform.supervisor, pluginId, collection.id, {
          authorize, record: id => platform.runtime.get(id),
        });
        authorize(); if (!binding) return;
        const key = syncNamespace({ plugin_id: binding.plugin_id, publisher_id: binding.publisher_id,
          publisher_signature: binding.publisher_signature, collection_id: binding.collection.id, schema_version: binding.collection.schema_version });
        const rows = grouped.get(key) ?? []; rows.push({ projectId, binding }); grouped.set(key, rows);
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
  for (const project of projects) {
    await isolate(async () => {
      authorize();
      const current = await withCatalog({ homeDirectory: home }, catalog => catalog.listProjects().find(row => row.project_id === project.project_id));
      authorize(); if (!current || current.database_path !== project.database_path) return;
      await host.withProject(molisWorkHostProjectReference({ databasePath: current.database_path, projectId: current.project_id }), async runtime => {
        await collect(await runningProjectPlatform(runtime.store, runtime.project_id), runtime.project_id);
        await collect(await runningInstalledPluginPlatform(runtime.store, runtime.project_id), runtime.project_id);
      }, { activatePlugins: true });
      authorize();
    });
  }
  authorize();
  return [...grouped.values()].map(owners => runtimeSyncRegistration(home, spaceId, owners, authorize));
}
