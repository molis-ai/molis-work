import type { PluginManifest, PluginStartContext, PluginSyncContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import { ensureStorageSpace } from '@molis-ai/molis-work-storage';

/** Only composition supplies Home ownership. A plugin manifest, project argument or wire payload cannot choose a space. */
export function syncActivation(home: string | undefined, manifest: PluginManifest, context: PluginStartContext, active: () => void): PluginSyncContext | undefined {
  if (!home || !manifest.sync) return undefined;
  const space = ensureStorageSpace(home);
  if (space.kind !== 'personal') return undefined;
  const assertActive = () => { active(); context.requireGrant('storage:private'); };
  assertActive();
  return Object.freeze({ spaceId: space.spaceId, assertActive });
}
