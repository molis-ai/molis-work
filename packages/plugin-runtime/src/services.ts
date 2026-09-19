import type {
  ArtifactReference,
  ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { HostCapabilityDefinition } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  PluginWiringError,
  requiredPorts,
  type PluginArtifactClient,
  type PluginCapabilityClient,
  type PluginInputsClient,
  type PluginInputStatus,
  type PluginManifest,
  type PluginOutputsClient,
  type PluginOutputPublishInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginInputGraph } from "./wiring.js";

/**
 * Builds the v2 author-facing services a Plugin receives at activation.
 *
 * Each one is present only when the Manifest declared it, so an author cannot
 * reach a surface they never asked for, and the Host can see from the Manifest
 * alone what a Plugin is able to touch.
 */

/** A port's value is one Artifact identity whose versions are that port's history. */
export function portArtifactId(pluginId: string, port: string): string {
  return `${pluginId}:${port}`;
}

export interface PluginWiringServicesInput {
  manifest: PluginManifest;
  graph: PluginInputGraph;
  artifacts: PluginArtifactClient;
  /**
   * Opaque scope key attached to everything this Plugin publishes, so the Host
   * can tell two inputs belong together without reading business fields.
   */
  scopeKey?: string | null;
}

export function createPluginInputsClient(input: PluginWiringServicesInput): PluginInputsClient {
  const { manifest, graph } = input;
  const pluginId = manifest.plugin_id;
  const declared = (manifest.ports?.inputs ?? []).map((port) => port.port);
  return {
    status(): PluginInputStatus {
      return graph.status(pluginId);
    },
    read(port: string): ArtifactVersionRecord | null {
      if (!declared.includes(port)) {
        throw new PluginWiringError("port_unknown", `${pluginId} 没有输入端口 ${port}`);
      }
      const status = graph.status(pluginId);
      if (status.status !== "ready") return null;
      const reference = graph.reference(pluginId, port);
      return reference === null ? null : input.artifacts.read(reference);
    },
    reference(port: string): ArtifactReference | null {
      if (!declared.includes(port)) {
        throw new PluginWiringError("port_unknown", `${pluginId} 没有输入端口 ${port}`);
      }
      return graph.reference(pluginId, port);
    },
    selectedGroup(): string | undefined {
      return graph.selectedGroup(pluginId);
    },
  };
}

export function createPluginOutputsClient(input: PluginWiringServicesInput): PluginOutputsClient {
  const { manifest, graph, artifacts } = input;
  const pluginId = manifest.plugin_id;
  const outputs = manifest.ports?.outputs ?? [];
  return {
    publish(request: PluginOutputPublishInput) {
      const declared = outputs.find((port) => port.port === request.port);
      if (!declared) {
        throw new PluginWiringError("port_unknown", `${pluginId} 没有输出端口 ${request.port}`);
      }
      const artifactId = portArtifactId(pluginId, request.port);
      const previous = graph.currentVersion(pluginId, request.port);
      const version = previous + 1;
      const result = artifacts.publish({
        artifact_id: artifactId,
        version,
        artifact_type_id: declared.artifact_type_id,
        schema_version: declared.schema_version,
        content: request.content,
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
        supersedes_version: request.supersedes_version ?? (previous === 0 ? null : previous),
      });
      graph.publish({
        plugin_id: pluginId,
        port: request.port,
        reference: { artifact_id: artifactId, version },
        scope_key: input.scopeKey ?? null,
      });
      graph.evaluateAll();
      return result;
    },
    invalidate(port: string, safeReason: string) {
      if (!outputs.some((declared) => declared.port === port)) {
        throw new PluginWiringError("port_unknown", `${pluginId} 没有输出端口 ${port}`);
      }
      graph.invalidate(pluginId, port, safeReason);
      graph.evaluateAll();
    },
    retain(reference: ArtifactReference) {
      graph.retain(pluginId, reference);
    },
    read(reference: ArtifactReference) {
      return artifacts.read(reference);
    },
  };
}

export interface PluginCapabilityPort {
  invoke<Input, Output>(
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output>;
}

export class PluginCapabilityAccessError extends Error {
  readonly code = "plugin_capability_denied";
  constructor(message: string) {
    super(message);
    this.name = "PluginCapabilityAccessError";
  }
}

/**
 * A Plugin may invoke exactly the Capabilities its Manifest lists under
 * `capabilities.consumes`. Anything else is refused before the Host is asked,
 * so the Manifest stays a complete account of what this Plugin can reach.
 */
export function createPluginCapabilityClient(
  manifest: PluginManifest,
  port: PluginCapabilityPort,
): PluginCapabilityClient {
  const allowed = new Set(manifest.capabilities.consumes);
  return {
    async invoke<Input, Output>(
      capability: HostCapabilityDefinition<Input, Output>,
      input: Input,
    ): Promise<Output> {
      if (!allowed.has(capability.capability_id)) {
        throw new PluginCapabilityAccessError(
          `${manifest.plugin_id} 没有声明消费 Capability ${capability.capability_id}`,
        );
      }
      return await port.invoke(capability, input);
    },
  };
}

/** Ports this Plugin must have bound before its declared work can run. */
export function pluginRequiredPorts(
  manifest: PluginManifest,
  selectedGroup: string | undefined,
): string[] {
  return requiredPorts(manifest.ports, selectedGroup);
}
