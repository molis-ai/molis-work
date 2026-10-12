import type { PluginSupervisorEntry } from "./supervisor.js";
import { pluginManifestDigest } from "./identity.js";
import { createPluginRuntimeReleaseArtifact, type PluginRuntimeReleaseArtifactRepository } from "./release-artifacts.js";

/** Persist a trusted factory once per exact manifest before activation or restoration. */
export async function persistReleaseArtifact(entry: PluginSupervisorEntry, repository?: PluginRuntimeReleaseArtifactRepository): Promise<void> {
  if (!entry.releaseArtifact) return;
  if (!repository) throw Object.assign(new Error("Native 插件 Runtime 发行物存储未装配"), { code: "plugin_release_store_unavailable" });
  const manifest = entry.definition.manifest;
  const digest = pluginManifestDigest(manifest);
  if (repository.get(manifest.plugin_id, manifest.publisher.signature, manifest.version, digest)) return;
  const source = await entry.releaseArtifact.capture();
  repository.save(createPluginRuntimeReleaseArtifact(manifest, source));
}
