import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { isFrozenRegisteredManifest, pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { installedVersion, type InstalledRelease } from "./installed-release.js";
import { FRAME_QUERY } from "./plugin-builder-surface.js";

type Release = Omit<SurfaceInstallationRef, "scope">;

export function installedPageRelease({ install_id, installation_generation, version, manifest_digest }: Release): Readonly<Release> {
  return Object.freeze({ install_id, installation_generation, version, manifest_digest });
}

export function sameInstalledRelease(expected: Release, actual: Release | null | undefined): boolean {
  return actual?.install_id === expected.install_id && actual.installation_generation === expected.installation_generation
    && actual.version === expected.version && actual.manifest_digest === expected.manifest_digest;
}

export const installedStageIdentity = (scope: SurfaceInstallationRef["scope"], record: Release): SurfaceInstallationRef =>
  ({ scope, ...installedPageRelease(record) });

const STAGE_INSTALLATION = "installation";
export function installedStagePath(prefix: string, pluginId: string, installation: SurfaceInstallationRef): string {
  return prefix + "/plugins/" + encodeURIComponent(pluginId) + "?" + FRAME_QUERY + "&" + STAGE_INSTALLATION + "=" + encodeURIComponent(JSON.stringify(installation));
}

export function requestedStageInstallation(url: URL): SurfaceInstallationRef | undefined {
  const values = url.searchParams.getAll(STAGE_INSTALLATION);
  if (!values.length) return undefined;
  const invalid = () => new ActionError("actions.input_invalid", "原舞台安装引用无效");
  if (values.length !== 1 || values[0]!.length > 1200 || url.searchParams.get("frame") !== "workbench") throw invalid();
  let value: unknown;
  try { value = JSON.parse(values[0]!); } catch { throw invalid(); }
  if (!isRecord(value) || Object.keys(value).length !== 5) throw invalid();
  const { scope, install_id, installation_generation, version, manifest_digest } = value;
  if ((scope !== "project" && scope !== "home") || !identityPart(install_id) || !identityPart(installation_generation)
    || !identityPart(version) || !identityPart(manifest_digest)) throw invalid();
  return { scope, install_id, installation_generation, version, manifest_digest };
}
const identityPart = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200;

export function assertStageInstallation(scope: SurfaceInstallationRef["scope"], record: PluginInstanceRecord | null | undefined,
  expected?: SurfaceInstallationRef): asserts record is PluginInstanceRecord {
  if (!record || record.state !== "running" || (expected && (expected.scope !== scope || !sameInstalledRelease(expected, record)))) {
    throw new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开");
  }
}

const frozenDigests = new WeakMap<PluginManifest, string>();
export function installedManifestMatches(record: PluginInstanceRecord, manifest: PluginManifest | undefined): manifest is PluginManifest {
  if (!manifest || record.plugin_id !== manifest.plugin_id || record.version !== manifest.version
    || record.publisher_id !== manifest.publisher.publisher_id || record.publisher_signature !== manifest.publisher.signature) return false;
  const frozen = isFrozenRegisteredManifest(manifest);
  const digest = frozen && frozenDigests.get(manifest) || pluginManifestDigest(manifest);
  if (frozen) frozenDigests.set(manifest, digest);
  return record.manifest_digest === digest;
}

/** The renderer must have the artifact of this exact installed release, even when its version string did not change. */
export function installedStageReleaseMatches(record: PluginInstanceRecord, release: InstalledRelease | undefined,
  activeManifest?: PluginManifest): release is InstalledRelease {
  return !!release && release.pluginId === record.plugin_id && installedVersion(release) === record.version
    && installedManifestMatches(record, release.packaged?.manifest ?? activeManifest);
}
