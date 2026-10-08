import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Why a confirmed install at another version may not reuse the private data an uninstall kept, or undefined when it
 * may (and for every other install). An uninstalled row is no installation to protect, so the other version installs
 * fresh when the same declarations that allow an upgrade allow it: the target says it reads the uninstalled version's
 * data, the Host ships it, or it is generated code (which rolls back without rolling its data back). A migration needs
 * an async check an install cannot run, so it is refused with the way forward instead of silently skipped.
 */
export function keptDataRefusal(previous: PluginInstanceRecord | null, manifest: PluginManifest, bundled: boolean): string | undefined {
  if (!previous || previous.state !== "uninstalled" || previous.version === manifest.version || !previous.retain_private_data || bundled) return undefined;
  if ((manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(previous.version)) return undefined;
  if (previous.execution === "sandbox" && comparePluginVersions(manifest.version, previous.version) < 0) return undefined;
  return `卸载时保留了 ${previous.version} 的数据，这个版本没有声明能直接读取它：请先重新安装 ${previous.version}，再升级到 ${manifest.version}`;
}

/**
 * What a start asks for when its entry names no grants: every required permission, or what the existing installation
 * already holds when that still covers them. A permission that became optional in a bundled upgrade stays granted, and
 * the next start of the same version replays it instead of looking like a silent grant change.
 */
export function defaultGrants(manifest: PluginManifest, installs: readonly PluginInstanceRecord[]): string[] {
  const required = manifest.permissions.filter(permission => permission.required).map(permission => permission.permission);
  const declared = new Set(manifest.permissions.map(permission => permission.permission));
  const held = installs.find(record => record.plugin_id === manifest.plugin_id
    && record.publisher_signature === manifest.publisher.signature && record.state !== "uninstalled")?.grants;
  return held && required.every(permission => held.includes(permission)) && held.every(permission => declared.has(permission)) ? [...held] : required;
}
