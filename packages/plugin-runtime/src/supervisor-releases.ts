import { systemOutputSource } from "@molis-ai/molis-work-contracts/platform/project-materials";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginSupervisorEntry } from "./supervisor.js";
import { comparePluginVersions } from "@molis-ai/molis-work-plugin-sdk";
import { platformDefinition } from "./platform-definitions.js";
import { pluginManifestDigest } from "./identity.js";
import { defaultGrants, directlyUsable } from "./install-rules.js";
import { UNSIGNED_TRUST, hostBuildConsents, isHostTrust } from "./trust-rules.js";
import { createPluginRuntimeReleaseArtifact, type PluginRuntimeReleaseArtifactRepository } from "./release-artifacts.js";

/** Persist a trusted factory once per exact manifest before activation or restoration. */
export async function persistReleaseArtifact(entry: PluginSupervisorEntry, repository?: PluginRuntimeReleaseArtifactRepository, assertCurrent?: () => void): Promise<void> {
  if (!entry.releaseArtifact) return;
  if (!repository) throw Object.assign(new Error("Native 插件 Runtime 发行物存储未装配"), { code: "plugin.release_store_unavailable" });
  const manifest = entry.definition.manifest;
  const digest = pluginManifestDigest(manifest);
  if (repository.get(manifest.plugin_id, manifest.publisher.signature, manifest.version, digest)) return;
  const source = await entry.releaseArtifact.capture();
  assertCurrent?.();
  repository.save(createPluginRuntimeReleaseArtifact(manifest, source));
}

/**
 * The Host agrees to read a default wiring only from what the Host itself ships, the platform's own producers included: a source of any
 * other trust level has no signature to agree to. Whether a platform source is agreed to on its own is the ledger's rule (`newRows`).
 */
const hostSourceSignature = (entries: ReadonlyMap<string, { readonly trust?: PluginTrust; readonly definition: { readonly manifest: { readonly publisher: { readonly signature: string } } } }>) =>
  (pluginId: string): string | undefined => {
    const system = systemOutputSource(pluginId);
    if (system) return system.signature;
    const source = entries.get(pluginId);
    return source && isHostTrust(source.trust ?? UNSIGNED_TRUST) ? source.definition.manifest.publisher.signature : undefined;
  };

/**
 * What a start installs an entry with: its trust (the entry's, or `unsigned`), its own grants, or `defaultGrants`. An entry of `host`
 * trust also names what the existing install's own build declared, from that build's row in the release archive (every start
 * writes the build it runs there before installing, so the row is there for any record a start left), and following a new build
 * then tells a permission new to the plugin, which starts switched on, from one the person switched off (`hostBuildGrants`); and
 * the Host agrees, on its build's behalf, to every declaration of the Manifest that asks for consent (`entries` name the
 * publisher signature of a default wiring's source among the start list's plugins).
 */
export function startInstallInput(entry: PluginSupervisorEntry, installs: readonly PluginInstanceRecord[], releases: PluginRuntimeReleaseArtifactRepository | undefined,
  entries: ReadonlyMap<string, { readonly trust?: PluginTrust; readonly definition: { readonly manifest: { readonly publisher: { readonly signature: string } } } }>) {
  const manifest = entry.definition.manifest;
  const trust = entry.trust ?? UNSIGNED_TRUST;
  const input = { definition: entry.definition, deployment: entry.deployment ?? "local" as const, grants: entry.grants ?? defaultGrants(manifest, installs), trust };
  if (!isHostTrust(trust)) return input;
  const record = installs.find(row => row.plugin_id === manifest.plugin_id && row.publisher_signature === manifest.publisher.signature && row.state !== "uninstalled");
  const before = record ? releases?.get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest) : null;
  return { ...input, consents: hostBuildConsents(manifest, hostSourceSignature(entries)), ...before ? { declared_before: before.manifest.permissions.map(permission => permission.permission) } : {} };
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/** Select the exact stored Native definition or a release that already declares compatibility with the recorded version. */
export async function resolveInstalledEntry(candidate: PluginSupervisorEntry, installs: readonly PluginInstanceRecord[],
  repository: PluginRuntimeReleaseArtifactRepository | undefined, assertCurrent?: () => void): Promise<PluginSupervisorEntry> {
  const manifest = candidate.definition.manifest;
  const installed = installs.find(record => record.plugin_id === manifest.plugin_id
    && record.publisher_signature === manifest.publisher.signature
    && record.state !== "uninstalled");
  if (!installed || !candidate.releaseArtifact) return candidate;

  if (directlyUsable(manifest, isHostTrust(candidate.trust ?? UNSIGNED_TRUST), installed)) {
    await persistReleaseArtifact(candidate, repository, assertCurrent);
    return candidate;
  }

  if (!repository) {
    throw codedError("plugin.release_store_unavailable", "Native 插件需要恢复已安装版本，但 Runtime 发行物存储未装配");
  }
  const artifacts = repository.list(manifest.plugin_id, manifest.publisher.signature);
  const exact = artifacts.filter(artifact => artifact.version === installed.version
    && artifact.manifest_digest === installed.manifest_digest);
  const compatible = artifacts.filter(artifact => artifact.version !== installed.version
    && comparePluginVersions(artifact.version, installed.version) >= 0
    && (artifact.manifest.upgrade_compatibility?.compatible_from_versions ?? []).includes(installed.version))
    .sort((left, right) => comparePluginVersions(right.version, left.version));

  for (const artifact of [...exact, ...compatible]) {
    try {
      if (artifact.plugin_id !== manifest.plugin_id
        || artifact.publisher_signature !== manifest.publisher.signature
        || artifact.manifest.version !== artifact.version
        || artifact.manifest_digest !== pluginManifestDigest(artifact.manifest)
        || !artifact.module_source.trim()) continue;
      const definition = await candidate.releaseArtifact.restore(artifact.module_source);
      if (definition.manifest.plugin_id !== artifact.plugin_id
        || definition.manifest.publisher.signature !== artifact.publisher_signature
        || definition.manifest.version !== artifact.version
        || pluginManifestDigest(definition.manifest) !== artifact.manifest_digest) continue;
      const host = { ...candidate, definition: platformDefinition(definition) };
      delete host.releaseArtifact;
      return host;
    } catch {
      // An unreadable older artifact must not prevent trying another exact
      // compatible release. If none can be loaded, the installed version stays blocked.
    }
  }
  throw codedError("plugin.release_artifact_missing", `找不到 ${installed.version} 的可运行 Native 发行物；未启动不兼容的新版本`);
}
