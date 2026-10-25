import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSupervisorEntry } from "./supervisor.js";
import { pluginManifestDigest } from "./identity.js";
import { defaultGrants } from "./install-rules.js";
import { UNSIGNED_TRUST, hostBuildConsents, isHostTrust } from "./trust-rules.js";
import { createPluginRuntimeReleaseArtifact, type PluginRuntimeReleaseArtifactRepository } from "./release-artifacts.js";

/** Persist a trusted factory once per exact manifest before activation or restoration. */
export async function persistReleaseArtifact(entry: PluginSupervisorEntry, repository?: PluginRuntimeReleaseArtifactRepository): Promise<void> {
  if (!entry.releaseArtifact) return;
  if (!repository) throw Object.assign(new Error("Native 插件 Runtime 发行物存储未装配"), { code: "plugin.release_store_unavailable" });
  const manifest = entry.definition.manifest;
  const digest = pluginManifestDigest(manifest);
  if (repository.get(manifest.plugin_id, manifest.publisher.signature, manifest.version, digest)) return;
  const source = await entry.releaseArtifact.capture();
  repository.save(createPluginRuntimeReleaseArtifact(manifest, source));
}

/**
 * What a start installs an entry with: its trust (the entry's, or `unsigned`), its own grants, or `defaultGrants`. An entry of `host`
 * trust also names what the existing install's own build declared, from that build's row in the release archive (every start
 * writes the build it runs there before installing, so the row is there for any record a start left), and following a new build
 * then tells a permission new to the plugin, which starts switched on, from one the person switched off (`hostBuildGrants`); and
 * the Host agrees, on its build's behalf, to every declaration of the Manifest that asks for consent (`entries` name the
 * publisher signature of a default wiring's source among the start list's plugins).
 */
export function startInstallInput(entry: PluginSupervisorEntry, installs: readonly PluginInstanceRecord[], releases: PluginRuntimeReleaseArtifactRepository | undefined,
  entries: ReadonlyMap<string, { readonly definition: { readonly manifest: { readonly publisher: { readonly signature: string } } } }>) {
  const manifest = entry.definition.manifest;
  const trust = entry.trust ?? UNSIGNED_TRUST;
  const input = { definition: entry.definition, deployment: entry.deployment ?? "local" as const, grants: entry.grants ?? defaultGrants(manifest, installs), trust };
  if (!isHostTrust(trust)) return input;
  const record = installs.find(row => row.plugin_id === manifest.plugin_id && row.publisher_signature === manifest.publisher.signature && row.state !== "uninstalled");
  const before = record ? releases?.get(record.plugin_id, record.publisher_signature, record.version, record.manifest_digest) : null;
  return { ...input, consents: hostBuildConsents(manifest, pluginId => entries.get(pluginId)?.definition.manifest.publisher.signature), ...before ? { declared_before: before.manifest.permissions.map(permission => permission.permission) } : {} };
}
