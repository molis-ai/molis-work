import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SqlitePluginPrivateStorage } from '@molis-ai/molis-work-plugin-runtime';
import { BUILDER_PLUGIN_ID, builderManifest } from '@molis-ai/molis-work-plugin-builder';

/** Host-created sandbox identities for live authoring trials, never an identifier from capability input. */
export const STABLE_PREVIEW = 'studio-preview:';

/** Stable authoring namespace of the Studio in this project. */
export function studioStorage(db: ConstructorParameters<typeof SqlitePluginPrivateStorage>[0], projectId: string): PluginPrivateStorage {
  const context = { install_id: 'agent-studio:' + projectId, plugin_id: BUILDER_PLUGIN_ID, version: builderManifest.version, deployment: 'local' as const,
    grants: ['storage:private'], project_id: projectId, requireGrant() {} };
  return new SqlitePluginPrivateStorage(db).forPlugin(context, builderManifest);
}
