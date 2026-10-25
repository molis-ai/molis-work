import type {
  ArtifactReference,
  FixedVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import {
  PluginWiringError,
  requiredPorts,
  type PluginArtifactClient,
  type PluginProcessItemClient,
  type PluginInputsClient,
  type PluginInputStatus,
  type PluginManifest,
  type PluginOutputsClient,
  type PluginOutputPublishInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { assertPluginActionCurrent } from "./action-scope.js";
import type { PluginInputGraph } from "./wiring.js";

/**
 * Builds the v2 author-facing services a Plugin receives at activation.
 *
 * Each one is present only when the Manifest declared it, so an author cannot
 * reach a surface they never asked for, and the Host can see from the Manifest
 * alone what a Plugin is able to touch.
 */

/** Generated publications use one identity; selected fixed references keep theirs. */
export function portArtifactId(pluginId: string, port: string): string {
  return `${pluginId}:${port}`;
}

export interface PluginWiringServicesInput {
  manifest: PluginManifest;
  /** The instance these clients write for; inside an action the action's original caller is asked before each write. */
  install_id: string;
  installation_generation: string;
  graph: PluginInputGraph;
  artifacts: PluginArtifactClient;
  /** Where port publications go: process items, kept out of the 成果库 (specs/artifact-positioning A2). */
  processItems: PluginProcessItemClient;
  /** Host reads the canonical publication history of a port's process item, independently of selected references. */
  latestVersion(artifactId: string): number;
  requireGrant(permission: string): void;
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
      input.requireGrant("artifact:read");
      return graph.status(pluginId);
    },
    read(port: string): FixedVersionRecord | null {
      if (!declared.includes(port)) {
        throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输入端口 ${port}`);
      }
      input.requireGrant("artifact:read");
      const status = graph.status(pluginId);
      if (status.status !== "ready") return null;
      const reference = graph.reference(pluginId, port);
      return reference === null ? null : input.artifacts.read(reference);
    },
    reference(port: string): ArtifactReference | null {
      if (!declared.includes(port)) {
        throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输入端口 ${port}`);
      }
      input.requireGrant("artifact:read");
      return graph.reference(pluginId, port);
    },
    selectedGroup(): string | undefined {
      return graph.selectedGroup(pluginId);
    },
  };
}

export function createPluginOutputsClient(input: PluginWiringServicesInput, assertActive: () => void): PluginOutputsClient {
  const { manifest, graph, artifacts } = input;
  const pluginId = manifest.plugin_id;
  const outputs = manifest.ports?.outputs ?? [];
  return {
    publish(request: PluginOutputPublishInput) {
      const declared = outputs.find((port) => port.port === request.port);
      if (!declared) {
        throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输出端口 ${request.port}`);
      }
      if (!(manifest.process_items?.produces ?? []).some(type => type.artifact_type_id === declared.artifact_type_id
        && type.schema_version === declared.schema_version)) {
        // A 成果 reaches a port only after it is pinned: select it instead of copying content into the port.
        throw new PluginWiringError("plugin.port_binding_invalid", `${pluginId} 的输出端口 ${request.port} 传的是成果，请先固定再选择`);
      }
      const artifactId = portArtifactId(pluginId, request.port);
      const previous = input.latestVersion(artifactId);
      const version = previous + 1;
      const result = input.processItems.record({
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
    reference(port: string) {
      if (!outputs.some(item => item.port === port)) throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输出端口 ${port}`);
      return graph.outputReference(pluginId, port);
    },
    select(request) {
      const declared = outputs.find(item => item.port === request.port);
      if (!declared) throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输出端口 ${request.port}`);
      if (!manifest.permissions.some(item => item.permission === "artifact:write")) throw new PluginWiringError("plugin.port_binding_invalid", "未声明发布成果权限");
      input.requireGrant("artifact:write");
      const artifact = artifacts.read(request.reference);
      if (!artifact || artifact.availability !== "available" || artifact.lifecycle_state !== "active"
        || artifact.producer_plugin_id !== pluginId || artifact.producer_binding_signature !== manifest.publisher.signature) {
        throw new PluginWiringError("plugin.port_binding_invalid", "只能选择当前插件自己的可用固定版本");
      }
      if (artifact.artifact_type_id !== declared.artifact_type_id || artifact.schema_version !== declared.schema_version) {
        throw new PluginWiringError("plugin.port_type_mismatch", "固定成果与输出端口类型不一致");
      }
      const same = (a: ArtifactReference | null, b: ArtifactReference | null) => a?.artifact_id === b?.artifact_id && a?.version === b?.version;
      const current = graph.outputReference(pluginId, request.port);
      const reference = { artifact_id: artifact.artifact_id, version: artifact.version };
      if (same(current, reference)) return reference;
      if (!same(current, request.expected_reference)) throw new PluginWiringError("plugin.port_binding_invalid", "当前输出已变化，请重新查看后选择");
      assertPluginActionCurrent(input);
      graph.publish({ plugin_id: pluginId, port: request.port, reference, scope_key: input.scopeKey ?? null });
      graph.evaluateAll();
      return reference;
    },
    invalidate(port: string, safeReason: string) {
      if (!outputs.some((declared) => declared.port === port)) {
        throw new PluginWiringError("plugin.port_unknown", `${pluginId} 没有输出端口 ${port}`);
      }
      assertPluginActionCurrent(input);
      assertActive();
      graph.invalidate(pluginId, port, safeReason);
      graph.evaluateAll();
    },
    retain(reference: ArtifactReference) {
      assertPluginActionCurrent(input);
      assertActive();
      graph.retain(pluginId, reference);
    },
    read(reference: ArtifactReference) {
      return artifacts.read(reference);
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
