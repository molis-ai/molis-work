import type { FixedVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import {
  portTypeKey,
  requiredPorts,
  type PluginInputPortView,
  type PluginInputSourceCandidate,
  type PluginWiringRepository,
  type PluginWiringView,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginHostLifecycle } from "./lifecycle.js";
import type { PluginArtifactReaderPort } from "./wiring.js";

/** A version a port can hand on: still readable and not archived. */
export function usableVersion(record: FixedVersionRecord | null): boolean {
  return Boolean(record && record.availability === "available" && record.lifecycle_state === "active");
}

/** Every enabled plugin's output port that offers this type, except the consumer's own. */
function candidatesFor(
  input: { projectId: string; lifecycle: PluginHostLifecycle; repository: PluginWiringRepository },
  artifactTypeId: string,
  schemaVersion: number,
  excludePluginId: string,
): PluginInputSourceCandidate[] {
  const wanted = portTypeKey(artifactTypeId, schemaVersion);
  const candidates: PluginInputSourceCandidate[] = [];
  for (const pluginId of input.lifecycle.enabledPluginIds()) {
    if (pluginId === excludePluginId) continue;
    const manifest = input.lifecycle.manifest(pluginId);
    for (const output of manifest?.ports?.outputs ?? []) {
      if (portTypeKey(output.artifact_type_id, output.schema_version) !== wanted) continue;
      const record = input.repository.getOutput(input.projectId, pluginId, output.port);
      candidates.push({
        source_plugin_id: pluginId,
        source_port: output.port,
        title: `${manifest?.name ?? pluginId} · ${output.port}`,
        availability: record === null || record.artifact_id === null
          ? "waiting"
          : record.invalidated_reason !== null
            ? "unavailable"
            : "ready",
      });
    }
  }
  return candidates;
}

/** What each enabled consumer's input ports are given right now: another plugin's output, a fixed 成果 version, or nothing. */
export function buildWiringView(input: {
  projectId: string;
  lifecycle: PluginHostLifecycle;
  repository: PluginWiringRepository;
  artifacts: PluginArtifactReaderPort;
  selectedGroup(pluginId: string): string | undefined;
}): PluginWiringView {
  const { projectId, lifecycle, repository } = input;
  const plugins = lifecycle.enabledPluginIds()
    .map((pluginId) => {
      const manifest = lifecycle.manifest(pluginId);
      if (!manifest) return null;
      const inputs = manifest.ports?.inputs ?? [];
      const selected = input.selectedGroup(pluginId);
      const required = new Set(requiredPorts(manifest.ports, selected));
      const ports: PluginInputPortView[] = inputs.map((port) => {
        const candidates = candidatesFor(input, port.artifact_type_id, port.schema_version, pluginId);
        const optional = port.optional === true || !required.has(port.port);
        const fixed = repository.getArtifactBinding(projectId, pluginId, port.port);
        if (fixed) {
          const readable = usableVersion(input.artifacts.library?.(fixed) ?? null);
          return {
            port: port.port, artifact_type_id: port.artifact_type_id, schema_version: port.schema_version, optional,
            state: readable ? "selected" : "unavailable", origin: "user",
            artifact: { artifact_id: fixed.artifact_id, version: fixed.version },
            ...(readable ? {} : { reason: "固定的那一版已不可读取" }), candidates,
          };
        }
        const binding = repository.getBinding(projectId, pluginId, port.port);
        const output = binding
          ? repository.getOutput(projectId, binding.source_plugin_id, binding.source_port)
          : null;
        const state: PluginInputPortView["state"] = binding === null
          ? (candidates.length > 1 ? "ambiguous" : "missing")
          : output === null || output.artifact_id === null
            ? "missing"
            : output.invalidated_reason !== null
              ? "unavailable"
              : "selected";
        return {
          port: port.port,
          artifact_type_id: port.artifact_type_id,
          schema_version: port.schema_version,
          optional,
          state,
          ...(binding
            ? {
              origin: binding.origin,
              source: {
                source_plugin_id: binding.source_plugin_id,
                source_port: binding.source_port,
              },
            }
            : {}),
          ...(output?.invalidated_reason ? { reason: output.invalidated_reason } : {}),
          candidates,
        };
      });
      return {
        plugin_id: pluginId,
        title: manifest.name,
        enabled: true,
        ports,
        groups: (manifest.ports?.input_groups ?? [])
          .map((group) => ({ group_id: group.group_id, title: group.title })),
        ...(selected === undefined ? {} : { selected_group: selected }),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  return { project_id: projectId, plugins };
}
