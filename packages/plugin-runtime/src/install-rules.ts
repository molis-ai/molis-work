import type { PluginDeployment, PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginRuntimeError } from "./errors.js";
import { pluginManifestDigest } from "./identity.js";

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
 * already holds when that still covers them. A permission that became optional in a bundled follow stays granted, and
 * the next start of the same build replays it instead of looking like a silent grant change.
 */
export function defaultGrants(manifest: PluginManifest, installs: readonly PluginInstanceRecord[]): string[] {
  const required = manifest.permissions.filter(permission => permission.required).map(permission => permission.permission);
  const declared = new Set(manifest.permissions.map(permission => permission.permission));
  const held = installs.find(record => record.plugin_id === manifest.plugin_id
    && record.publisher_signature === manifest.publisher.signature && record.state !== "uninstalled")?.grants;
  return held && required.every(permission => held.includes(permission)) && held.every(permission => declared.has(permission)) ? [...held] : required;
}

/**
 * Why an install that did not finish cannot be taken back (`abandonInstall`), or undefined when it can. `installed` is
 * the record that install returned, `earlier` the uninstalled record it replaced (none for a first-ever install, which
 * has nothing to go back to and is marked uninstalled with nothing kept). Only the installation `installed` names, while
 * the row still holds it, is undone. A row another install has replaced is not touched, and neither is one that is
 * uninstalled at the attempt's own installation generation: the install did not do that, so someone else did, and
 * their choice about the kept data stands. Both refuse with `plugin_install_replaced`, so the caller leaves everything
 * that belongs to the newer install or to that choice alone. A row back at `earlier` already is what this asks for.
 */
export function abandonRefusal(current: PluginInstanceRecord, installed: PluginInstanceRecord, earlier?: PluginInstanceRecord): PluginRuntimeError | undefined {
  if (earlier && (earlier.install_id !== installed.install_id || earlier.state !== "uninstalled")) {
    return new PluginRuntimeError("plugin_state_invalid", "只能退回到同一安装、已卸载的记录");
  }
  if (earlier && current.installation_generation === earlier.installation_generation) return undefined;
  if (current.installation_generation !== installed.installation_generation || current.state === "uninstalled") {
    return new PluginRuntimeError("plugin_install_replaced", "这次安装已经被另一次安装替换，或已被卸载，不能退回");
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
 * The record a bundled plugin's build is to be moved onto, or null. A plugin that ships with the Host runs the Host's build
 * whatever its install record holds (2026-10-04 for a higher version, 2026-10-08 for a lower one and for the same version with
 * another Manifest digest; docs/releases/POLICY.md section 7). Null when the plugin is not bundled, has no installation (an
 * uninstalled row is installed afresh, under the kept-data rule), or its record already is the build.
 */
export function recordToFollow(current: PluginInstanceRecord | null, manifest: PluginManifest, digest: string, bundled: boolean): PluginInstanceRecord | null {
  return bundled && current && current.state !== "uninstalled" && (current.version !== manifest.version || current.manifest_digest !== digest) ? current : null;
}

/**
 * The record moved onto the build's Manifest. It stays the same installation: install_id, installation generation, state,
 * install time and the retained-data choice are untouched, so private data stays attached; the deployment cannot change.
 * Grants converge the way a fresh install would reach them from what the person holds: the ones the new Manifest still
 * declares stay, the ones it requires are added (granted without asking, as in a fresh install), the ones it no longer
 * declares go. This is the same whether the build is newer, older or the same version.
 */
export function followBundledBuild(current: PluginInstanceRecord, deployment: PluginDeployment, manifest: PluginManifest, digest: string, entrypoint: string, at: string): PluginInstanceRecord {
  if (current.deployment !== deployment) throw new PluginRuntimeError("plugin_state_invalid", "已有安装不能通过启动改变部署环境");
  const declared = new Set(manifest.permissions.map(permission => permission.permission));
  const required = manifest.permissions.filter(permission => permission.required).map(permission => permission.permission);
  return { ...current, version: manifest.version, publisher_id: manifest.publisher.publisher_id, manifest_digest: digest, selected_entrypoint: entrypoint,
    grants: normalizeGrants(manifest, [...current.grants.filter(permission => declared.has(permission)), ...required]), updated_at: at };
}

/**
 * Whether the Host's own definition can run over an install record without restoring a stored release. A bundled plugin always
 * can: its record is moved onto the build (`followBundledBuild`). Any other plugin only at the recorded digest, or when its
 * Manifest names the recorded version as an upgrade source and is the same version or higher.
 */
export function directlyUsable(manifest: PluginManifest, bundled: boolean, installed: PluginInstanceRecord): boolean {
  if (bundled) return true;
  const named = (manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version);
  return installed.version === manifest.version
    ? installed.manifest_digest === pluginManifestDigest(manifest) || named
    : comparePluginVersions(manifest.version, installed.version) > 0 && named;
}
