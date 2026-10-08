import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRuntimeError } from "./errors.js";

/**
 * Why a confirmed install at another version may not reuse the private data an uninstall kept, or undefined when it
 * may (and for every other install). An uninstalled row is no installation to protect, so the other version installs
 * fresh when the same declarations that allow an upgrade allow it: the target says it reads the uninstalled version's
 * data, the Host ships it as a newer version, or it is generated code (which rolls back without rolling its data back).
 * A migration needs an async check an install cannot run. Otherwise the person has to say the kept data is dropped
 * (`discard`); without that the install is refused with both ways forward.
 */
export function keptDataRefusal(previous: PluginInstanceRecord | null, manifest: PluginManifest, bundled: boolean, discard: boolean): string | undefined {
  if (!previous || previous.state !== "uninstalled" || previous.version === manifest.version || !previous.retain_private_data || discard) return undefined;
  if (bundled && comparePluginVersions(manifest.version, previous.version) > 0) return undefined;
  if ((manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(previous.version)) return undefined;
  if (previous.execution === "sandbox" && comparePluginVersions(manifest.version, previous.version) < 0) return undefined;
  return `卸载时保留了 ${previous.version} 的数据，${manifest.version} 没有声明能读取它：可以放弃这些数据后全新安装，或者先重新安装 ${previous.version}，再升级到 ${manifest.version}`;
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

/**
 * Why an install that did not finish cannot be taken back (`abandonInstall`), or undefined when it can (and when it
 * already was). `installed` is the record that install returned, `earlier` the uninstalled record it replaced. The row goes
 * back to `earlier` whole (version, Manifest digest, installation generation, kept data), so the next install is asked
 * the same question about the kept data. Only the installation `installed` names is undone: a row another install has
 * replaced since is not touched, and the refusal says so (`plugin_install_replaced`) so the caller leaves everything
 * that belongs to the newer install alone.
 */
export function abandonRefusal(current: PluginInstanceRecord, installed: PluginInstanceRecord, earlier: PluginInstanceRecord): PluginRuntimeError | undefined {
  if (earlier.install_id !== installed.install_id || earlier.state !== "uninstalled") return new PluginRuntimeError("plugin_state_invalid", "只能退回到同一安装、已卸载的记录");
  if (current.installation_generation !== installed.installation_generation && current.installation_generation !== earlier.installation_generation) {
    return new PluginRuntimeError("plugin_install_replaced", "这次安装已经被另一次安装替换，不能退回");
  }
  return undefined;
}

export function assertMutable(record: PluginInstanceRecord): void {
  if (record.state === "uninstalled" || record.state === "quarantined") {
    throw new PluginRuntimeError("plugin_state_invalid", `Plugin 当前状态 ${record.state} 不允许修改`);
  }
}

export function normalizeGrants(manifest: PluginManifest, requested: string[]): string[] {
  const ceiling = new Set(manifest.permissions.map((permission) => permission.permission));
  const grants = [...new Set(requested.map((permission) => permission.trim()).filter(Boolean))].sort();
  if (grants.some((permission) => !ceiling.has(permission))) {
    throw new PluginRuntimeError("plugin_grant_denied", "实际 grant 不能超过 Manifest 声明上限");
  }
  return grants;
}

/**
 * A plugin that ships with the Host follows the Host's version (2026-10-04): its install record moves up with it,
 * keeping the grants the new Manifest still declares and adding the ones it requires, as a fresh install would.
 */
export function bundledUpgrade(current: PluginInstanceRecord, manifest: PluginManifest, digest: string, entrypoint: string, at: string): PluginInstanceRecord {
  const declared = new Set(manifest.permissions.map(permission => permission.permission));
  const required = manifest.permissions.filter(permission => permission.required).map(permission => permission.permission);
  return { ...current, version: manifest.version, publisher_id: manifest.publisher.publisher_id, manifest_digest: digest, selected_entrypoint: entrypoint,
    grants: normalizeGrants(manifest, [...current.grants.filter(permission => declared.has(permission)), ...required]), updated_at: at };
}
