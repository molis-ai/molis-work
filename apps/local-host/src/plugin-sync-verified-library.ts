import { assertPersonalSpaceAuthority } from './personal-space-authority.js';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginDatabase, PluginDatabaseDeclaration, PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { readDatabaseSpace, retainLocalReplicaSnapshot, type ReplicaDatabase } from '@molis-ai/molis-work-storage';
import { pluginSyncLibrary } from './plugin-sync-library.js';
import { pluginSyncBusinessDatabase } from './plugin-sync-business.js';
import { pluginSyncBusinessTables, pluginSyncDatabase, pluginSyncNamespace, pluginSyncLibraryManifest } from './plugin-sync-database.js';
import type { PluginDatabaseConnection } from './plugin-database-client.js';
import { joinPluginTransaction } from './plugin-transaction.js';

/** Created only by the owner that already opened and verified this physical library. */
export function pluginSyncForVerifiedLibrary(options: {
  home: string; manifest: PluginManifest; declaration: PluginDatabaseDeclaration;
  db: PluginDatabaseConnection; projectId?: string; client: PluginDatabase; inTransaction(): boolean;
  assertActive(): void; authorize(permission: string): void; guard: Parameters<typeof pluginSyncBusinessDatabase>[3]; perform?: Parameters<typeof pluginSyncBusinessDatabase>[4];
}) {
  const {home, declaration, db, client, inTransaction, assertActive, guard} = options;
  const manifest = pluginSyncLibraryManifest(options.manifest, declaration);
  if (!manifest.sync?.collections.length) return undefined;
  const replicaDb = db as ReplicaDatabase;
  const space = () => {
    assertActive();
    const bound = readDatabaseSpace(replicaDb);
    if (!bound) throw new ActionError('actions.forbidden', '同步库没有已验证的空间归属');
    return bound;
  };
  return pluginSyncLibrary({home, manifest, tables: pluginSyncBusinessTables(declaration), assertActive, authorize: options.authorize, readPermission: declaration.read_permission, writePermission: declaration.write_permission,
    actorId: () => space().ownerUserId ?? '',
    projectId: () => { assertActive(); if (!options.projectId) throw new ActionError('actions.project_required', '同步集合需要当前项目库'); return options.projectId; },
    database: collectionId => { space(); return pluginSyncDatabase(replicaDb, pluginSyncNamespace(manifest, collectionId)); },
    businessDatabase: authorize => pluginSyncBusinessDatabase(db, inTransaction, () => { assertActive(); authorize(); }, guard, options.perform),
    retain(collectionId, transaction, key, value) {
      joinPluginTransaction(client, transaction, (_afterCommit, check) => {
        const authorize = () => { assertActive(); check(); const bound = space(); if (bound.kind === "personal") assertPersonalSpaceAuthority(home, bound.spaceId); };
        retainLocalReplicaSnapshot(pluginSyncDatabase(replicaDb, pluginSyncNamespace(manifest, collectionId)), key, value, authorize);
      });
    },
  });
}
