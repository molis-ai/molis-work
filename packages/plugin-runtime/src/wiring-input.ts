import type { ArtifactReference, ArtifactVersionRecord, FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginManifest, PluginUpstreamUnavailableReason, PluginWiringRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SystemOutputSource } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";
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
  /** The platform's producers: a version on their output must be one they wrote, under the signature they hold now. */
  systemSource?: (pluginId: string) => SystemOutputSource | undefined;
}): { scope: string | null; record: FixedVersionRecord | null; reason?: PluginUpstreamUnavailableReason } {
  const { projectId, manifest, port, repository, artifacts } = input;
  let system: SystemOutputSource | undefined;
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
    system = binding ? input.systemSource?.(binding.source_plugin_id) : undefined;
  }
  const library = artifacts.library?.(reference) ?? null;
  const record = fixed ? library : library ?? artifacts.read(reference);
  const declared = manifest.ports?.inputs.find(candidate => candidate.port === port);
  if (!record || !usableVersion(record) || (library !== null && (!declared
    || library.artifact_type_id !== declared.artifact_type_id || library.schema_version !== declared.schema_version
    || !acceptsLibraryVersion(manifest, library)))) {
    return unavailable("content_unavailable", fixed ? `输入 ${port} 固定的那一版已不可读取` : `输入 ${port} 的内容已不可读取`);
  }
  // A platform source's version carries its registration and, when it is someone's own, its owner (BSH-05): a record another producer
  // wrote, under an old signature, or of a type the port does not read is not this source's output, whatever the output row says.
  if (system && (record.producer_plugin_id !== system.plugin_id || record.producer_binding_signature !== system.signature
    || !declared || record.artifact_type_id !== declared.artifact_type_id || record.schema_version !== declared.schema_version
    || !system.process_items.some(type => type.artifact_type_id === record.artifact_type_id && type.schema_version === record.schema_version))) {
    return unavailable("content_unavailable", `输入 ${port} 的内容不是平台资料服务现行登记写下的`);
  }
  return { scope, record };
}
