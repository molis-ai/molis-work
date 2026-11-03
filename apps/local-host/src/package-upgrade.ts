import { comparePluginVersions } from '@molis-ai/molis-work-plugin-sdk';
import { pluginErrors, type PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';

/**
 * A signed package replaces an installed plugin of its own publisher only as its upgrade (BL-623): a higher version whose Manifest says it can
 * be upgraded to from the installed one. The person's confirmation asks this before the publisher is pinned or the package is kept (S-84), and
 * the install lifecycle asks it again when it moves the version: one rule, two places.
 */
export function assertUpgradeOf(next: Pick<PluginManifest, 'version' | 'upgrade_compatibility'>, installedVersion: string): void {
  const refusal = upgradeRefusal(next, installedVersion);
  if (refusal) throw refusal;
}

/** The same rule, answered rather than thrown: undefined when the package is the installed one's upgrade. */
export function upgradeRefusal(next: Pick<PluginManifest, 'version' | 'upgrade_compatibility'>, installedVersion: string): Error | undefined {
  if (comparePluginVersions(next.version, installedVersion) <= 0) return pluginErrors.upgrade_required('这个包的版本是 ' + next.version + '，不高于已装的 ' + installedVersion + '：不是升级');
  if (!(next.upgrade_compatibility?.compatible_from_versions ?? []).includes(installedVersion)) return pluginErrors.upgrade_required('这个包的清单没有声明能从已装的 ' + installedVersion + ' 直接升级（upgrade_compatibility.compatible_from_versions）');
  return undefined;
}
