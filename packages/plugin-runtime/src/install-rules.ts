import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDeployment, PluginExecutor, PluginInstanceRecord, PluginManifest, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { comparePluginVersions } from "@molis-ai/molis-work-plugin-sdk";

import { pluginManifestDigest } from "./identity.js";
import { assertRequiredGrants, validateManifest } from "./runtime-rules.js";

/**
 * Why a confirmed install at another version may not reuse the private data an uninstall kept, or undefined when it
 * may (and for every other install). An uninstalled row is no installation to protect, so the other version installs
 * fresh when the same declarations that allow an upgrade allow it: the target says it reads the uninstalled version's
 * data, the Host ships it as a newer version, or it is generated code (which rolls back without rolling its data back).
 * A migration needs an async check an install cannot run. Otherwise the person has to say the kept data is dropped
 * (`discard`); without that the install is refused with both ways forward.
 */
export function keptDataRefusal(previous: PluginInstanceRecord | null, manifest: PluginManifest, host: boolean, discard: boolean): string | undefined {
  if (!previous || previous.state !== "uninstalled" || previous.version === manifest.version || !previous.retain_private_data || discard) return undefined;
  if (host && comparePluginVersions(manifest.version, previous.version) > 0) return undefined;
  if ((manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(previous.version)) return undefined;
  if (previous.execution === "sandbox" && comparePluginVersions(manifest.version, previous.version) < 0) return undefined;
  return `卸载时保留了 ${previous.version} 的数据，${manifest.version} 没有声明能读取它：可以放弃这些数据后全新安装，或者先重新安装 ${previous.version}，再升级到 ${manifest.version}`;
}

/** Validate grants before a reinstall can remove data; existing compatible-version calls keep their original grants default. */
export function installationGrants(current: PluginInstanceRecord | null, manifest: PluginManifest, host: boolean, requested?: string[]): string[] {
  if (host) return hostBuildGrants(manifest, current?.state === "uninstalled" ? undefined : current?.grants);
  const held = current && current.state !== "uninstalled" && current.version !== manifest.version ? current.grants : undefined;
  return normalizeGrants(manifest, requested ?? held ?? []);
}

/** Every reinstall first revokes its earlier installation's authorization; private cleanup follows the existing retention choice. */
export function prepareInstallationData(executor: PluginExecutor, installId: string, previous: PluginInstanceRecord | null, manifest: PluginManifest, host: boolean, discard: boolean): void {
  const refusal = keptDataRefusal(previous, manifest, host, discard);
  if (refusal) throw pluginErrors.kept_data_incompatible(refusal);
  if (!previous) { prepareNewInstall(executor, installId); return; }
  if (previous.state !== "uninstalled") return;
  try {
    executor.prepareReinstall?.(previous);
    if (previous.retain_private_data) return;
    if (!executor.keptDataDiscarded) {
      if (executor.uninstalled) throw pluginErrors.state_invalid("Plugin 的宿主没有同步数据清理能力，暂不能重装这个不保留数据的安装");
      return;
    }
    executor.keptDataDiscarded(previous);
  }
  catch (error) {
    if (error instanceof ActionError) throw error;
    throw pluginErrors.executor_failed("Plugin 已卸载数据清理失败，暂不能重装，请重试清理");
  }
}

/** A first install in a scope has no earlier row of its own to revoke, but other places' last uninstall may have left its identity's shared bindings (BL-596). */
function prepareNewInstall(executor: PluginExecutor, installId: string): void {
  try { executor.prepareNewInstall?.(installId); }
  catch (error) {
    if (error instanceof ActionError) throw error;
    throw pluginErrors.executor_failed("Plugin 早先安装留下的连接绑定清理失败，暂不能安装，请重试");
  }
}

/**
 * Saves a new installation's row. When the person's word drops the data an uninstall kept (`discard`, `replaced` the uninstalled row that
 * held it), the Host is told once the row is saved, so what it kept beside that data goes too, before anything starts.
 */
export function saveInstalled(repository: PluginRuntimeRepository, executor: PluginExecutor, record: PluginInstanceRecord, replaced: PluginInstanceRecord | null, discard: boolean): void {
  repository.save(record);
  if (discard && replaced?.state === "uninstalled" && replaced.retain_private_data) executor.keptDataDiscarded?.(replaced);
}

/**
 * What a plugin of the Host's own build (`host` trust) holds, by the rule every plugin follows (user decision 2026-10-18,
 * docs/releases/POLICY.md section 7.8): every required permission its Manifest declares, and its optional ones as the person
 * leaves them; any optional one can be switched off (`PluginRuntime.grant`, from Settings), and then only the actions that need
 * it are unavailable. A plugin of the Host's build differs only in how it starts out: a fresh install (`held` undefined) has every optional
 * permission switched on, so a built-in plugin works as it did before anyone touches its permissions.
 *
 * An installation already there (`held`, its grants), of this build or of another one being followed, keeps what it holds that
 * the Manifest still declares, gets every required permission, and gets what the Manifest declares that its own build did not
 * (`declaredBefore`, that build's Manifest from the release archive): a permission new to the plugin starts switched on like a
 * fresh install's, one the person switched off stays off. Without `declaredBefore` only the required ones are added, so nothing
 * the person may have switched off is switched back on.
 *
 * The grants a caller names are not looked at: switching a permission off is the person's, not the Host's start list. Only for
 * code the Host runs itself: `PluginRuntime.install` refuses `host` trust for a sandboxed definition, whose permissions are what the
 * person confirmed and never what its Manifest declares.
 */
export function hostBuildGrants(manifest: PluginManifest, held?: readonly string[], declaredBefore?: readonly string[]): string[] {
  const declared = manifest.permissions.map(permission => permission.permission);
  if (!held) return normalizeGrants(manifest, declared);
  const required = manifest.permissions.filter(permission => permission.required).map(permission => permission.permission);
  const added = declaredBefore ? declared.filter(permission => !declaredBefore.includes(permission)) : [];
  return normalizeGrants(manifest, [...required, ...held.filter(permission => declared.includes(permission)), ...added]);
}

/**
 * What a start asks for when its entry names no grants, for a plugin that is not of the Host's build (one that is holds
 * `hostBuildGrants`, which no entry changes): every required permission, or what the existing installation already holds when
 * that still covers them. A permission that became optional in an upgrade stays granted, an optional one the person switched
 * on or off stays as they left it, and the next start of the same build replays it instead of looking like a silent grant change.
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
 * their choice about the kept data stands. Both refuse with `plugin.install_replaced`, so the caller leaves everything
 * that belongs to the newer install or to that choice alone. A row back at `earlier` already is what this asks for.
 */
export function abandonRefusal(current: PluginInstanceRecord, installed: PluginInstanceRecord, earlier?: PluginInstanceRecord): ActionError | undefined {
  if (earlier && (earlier.install_id !== installed.install_id || earlier.state !== "uninstalled")) {
    return pluginErrors.state_invalid("只能退回到同一安装、已卸载的记录");
  }
  if (earlier && current.installation_generation === earlier.installation_generation) return undefined;
  if (current.installation_generation !== installed.installation_generation || current.state === "uninstalled") {
    return pluginErrors.install_replaced("这次安装已经被另一次安装替换，或已被卸载，不能退回");
  }
  return undefined;
}

/**
 * The Manifest an install or a version change puts on a record: the shape every definition is checked for. What a Manifest declares
 * that changes its effect elsewhere (`always_on`, a default wiring, a default input group) is not refused here for where the
 * plugin came from: it takes effect only with a consent on the ledger (`trust-rules.ts`), whatever the plugin's trust level.
 */
export function validateInstalledManifest(manifest: PluginManifest, owners?: DeclarationOwners): void {
  validateManifest(manifest);
  assertDeclarationsFree(manifest, owners);
}

/** Whoever the Host says declares the names the platform keeps one owner for, asked about the Manifest that wants to declare some. It throws when it cannot tell. */
export type DeclarationOwners = (manifest: PluginManifest) => readonly DeclarationOwner[];

/** What a start needs besides a running host: the grants its Manifest requires, and its names still being its own (S-82: a start is where an enable lands). */
export function assertStartable(manifest: PluginManifest, grants: readonly string[], owners?: DeclarationOwners): void {
  assertRequiredGrants(manifest, grants);
  assertDeclarationsFree(manifest, owners);
}

function assertDeclarationsFree(manifest: PluginManifest, owners?: DeclarationOwners): void {
  if (!owners || (manifest.artifacts.produces.length === 0 && !manifest.artifacts.links?.length)) return;
  const refusal = declarationClaimRefusal(manifest, owners(manifest));
  if (refusal) throw pluginErrors.definition_conflict(refusal);
}

/** What one Plugin or Host producer already declares of the names the platform keeps one owner for (S-70). */
export interface DeclarationOwner {
  readonly plugin_id: string;
  readonly artifacts: { readonly produces: readonly { readonly artifact_type_id: string }[]; readonly links?: readonly { readonly kind: string }[] };
}

/**
 * A 成果 type id and a link kind have one owner (S-70.2, S-70.3): an install or a version change whose Manifest declares one that
 * another Plugin already declares is refused, so a second Plugin cannot take over what the first one's versions mean. The same
 * Plugin declaring it again (an upgrade) is not another owner.
 */
export function declarationClaimRefusal(manifest: PluginManifest, owners: readonly DeclarationOwner[]): string | undefined {
  for (const type of manifest.artifacts.produces) {
    const owner = owners.find(item => item.plugin_id !== manifest.plugin_id && item.artifacts.produces.some(other => other.artifact_type_id === type.artifact_type_id));
    if (owner) return `成果类型 ${type.artifact_type_id} 已由 ${owner.plugin_id} 声明，${manifest.plugin_id} 不能再声明`;
  }
  for (const link of manifest.artifacts.links ?? []) {
    const owner = owners.find(item => item.plugin_id !== manifest.plugin_id && (item.artifacts.links ?? []).some(other => other.kind === link.kind));
    if (owner) return `链接种类 ${link.kind} 已由 ${owner.plugin_id} 声明，${manifest.plugin_id} 不能再声明`;
  }
  return undefined;
}

export function assertMutable(record: PluginInstanceRecord): void {
  if (record.state === "uninstalled" || record.state === "quarantined") {
    throw pluginErrors.state_invalid(`Plugin 当前状态 ${record.state} 不允许修改`);
  }
}

/**
 * The grants after the person switches one optional permission on or off (PG-002, docs/releases/POLICY.md section 7.8). It stays inside
 * what the Manifest declares, in either direction, and a required permission is not the person's to take away: the plugin could not run
 * without it, and stopping or removing the plugin is the way not to use it. Nothing here looks at who asks; the caller is the Host's
 * settings door (`PluginRuntime.regrant`).
 */
export function toggledGrants(manifest: PluginManifest, held: readonly string[], permission: string, granted: boolean): string[] {
  const declared = manifest.permissions.find(item => item.permission === permission);
  if (!declared) throw pluginErrors.grant_denied(`Manifest 没有声明 ${permission}，不能改它的授权`);
  if (!granted && declared.required) throw pluginErrors.grant_denied(`${permission} 是必需权限，不能关闭`);
  return normalizeGrants(manifest, granted ? [...held, permission] : held.filter(item => item !== permission));
}

export function normalizeGrants(manifest: PluginManifest, requested: string[]): string[] {
  const ceiling = new Set(manifest.permissions.map((permission) => permission.permission));
  const grants = [...new Set(requested.map((permission) => permission.trim()).filter(Boolean))].sort();
  if (grants.some((permission) => !ceiling.has(permission))) {
    throw pluginErrors.grant_denied("实际 grant 不能超过 Manifest 声明上限");
  }
  return grants;
}

/**
 * The record a plugin of the Host's build is to be moved onto, or null. A plugin of the Host's build runs the Host's build
 * whatever its install record holds (2026-10-04 for a higher version, 2026-10-08 for a lower one and for the same version with
 * another Manifest digest; docs/releases/POLICY.md section 7), and always holds that build's required permissions, so a record of
 * this very build that lacks one is moved too. A missing optional permission is not a reason: the person switched it off.
 * Null when the plugin is not of the Host's build, has no installation (an uninstalled row is installed afresh, under the kept-data rule),
 * or its record already is the build with its required permissions.
 */
export function recordToFollow(current: PluginInstanceRecord | null, manifest: PluginManifest, digest: string, host: boolean): PluginInstanceRecord | null {
  return host && current && current.state !== "uninstalled" && (current.version !== manifest.version || current.manifest_digest !== digest
    || manifest.permissions.some(permission => permission.required && !current.grants.includes(permission.permission))) ? current : null;
}

/**
 * The record moved onto the build's Manifest. It stays the same installation: install_id, installation generation, state,
 * install time and the retained-data choice are untouched, so private data stays attached; the deployment cannot change.
 * The grants follow `hostBuildGrants` for an installation already there: what the new Manifest no longer declares goes, its
 * required permissions are added, an optional one the person switched off stays off, and one the record's own build did not
 * declare (`declaredBefore`) starts switched on. This is the same whether the build is newer, older or the same version.
 */
export function followHostBuild(current: PluginInstanceRecord, deployment: PluginDeployment, manifest: PluginManifest, digest: string, entrypoint: string, at: string,
  declaredBefore?: readonly string[]): PluginInstanceRecord {
  if (current.deployment !== deployment) throw pluginErrors.state_invalid("已有安装不能通过启动改变部署环境");
  return { ...current, version: manifest.version, publisher_id: manifest.publisher.publisher_id, manifest_digest: digest, selected_entrypoint: entrypoint,
    grants: hostBuildGrants(manifest, current.grants, declaredBefore), updated_at: at };
}

/**
 * Whether the Host's own definition can run over an install record without restoring a stored release. A plugin of the Host's build always
 * can: its record is moved onto the build (`followHostBuild`). Any other plugin only at the recorded digest, or when its
 * Manifest names the recorded version as an upgrade source and is the same version or higher.
 */
export function directlyUsable(manifest: PluginManifest, host: boolean, installed: PluginInstanceRecord): boolean {
  if (host) return true;
  const named = (manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version);
  return installed.version === manifest.version
    ? installed.manifest_digest === pluginManifestDigest(manifest) || named
    : comparePluginVersions(manifest.version, installed.version) > 0 && named;
}
