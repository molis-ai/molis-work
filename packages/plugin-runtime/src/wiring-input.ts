import type { ArtifactReference, ArtifactVersionRecord, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginManifest, PluginUpstreamUnavailableReason, PluginWiringRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginArtifactReaderPort } from "./wiring.js";

/** A version a port can hand on: still readable and not archived. */
export function usableVersion(record: FixedVersionRecord | null): boolean {
  return Boolean(record && record.availability === "available" && record.lifecycle_state === "active");
}

export function acceptsLibraryVersion(manifest: PluginManifest, record: ArtifactVersionRecord): boolean {
  return manifest.artifacts.consumes.some(type => type.artifact_type_id === record.artifact_type_id && type.schema_version === record.schema_version);
}

/** Resolve the selected exact version once for status, references and the wiring view. A fixed binding never falls through. */
export function resolvePortInput(input: {
  projectId: string;
  manifest: PluginManifest;
  port: string;
  repository: PluginWiringRepository;
  artifacts: PluginArtifactReaderPort;
}): { scope: string | null; record: FixedVersionRecord | null; reason?: PluginUpstreamUnavailableReason } {
  const { projectId, manifest, port, repository, artifacts } = input;
  const pluginId = manifest.plugin_id;
  const fixed = repository.getArtifactBinding(projectId, pluginId, port);
  const unavailable = (code: PluginUpstreamUnavailableReason["code"], message: string) => ({
    scope: null, record: null, reason: { binding_id: `${pluginId}:${port}`, code, message },
  });
  let reference: ArtifactReference | null = fixed;
  let scope: string | null = null;
  if (!reference) {
    const binding = repository.getBinding(projectId, pluginId, port);
    const output = binding ? repository.getOutput(projectId, binding.source_plugin_id, binding.source_port) : null;
    if (!output || output.artifact_id === null || output.version === null) return { scope, record: null };
    if (output.invalidated_reason !== null) return unavailable("source_invalidated", output.invalidated_reason);
    reference = { artifact_id: output.artifact_id, version: output.version };
    scope = output.scope_key;
  }
  const library = artifacts.library?.(reference) ?? null;
  const record = fixed ? library : library ?? artifacts.read(reference);
  const declared = manifest.ports?.inputs.find(candidate => candidate.port === port);
  if (!record || !usableVersion(record) || (library !== null && (!declared
    || library.artifact_type_id !== declared.artifact_type_id || library.schema_version !== declared.schema_version
    || !acceptsLibraryVersion(manifest, library)))) {
    return unavailable("content_unavailable", fixed ? `输入 ${port} 固定的那一版已不可读取` : `输入 ${port} 的内容已不可读取`);
  }
  return { scope, record };
}
