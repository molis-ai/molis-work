import type {
  PluginManifest,
  PluginRequirementDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Static dependency resolution over Manifests.
 *
 * Capability requirements are hard dependencies and decide activation order.
 * Ports are not ordering constraints: a consumer activates lazily and receives
 * a complete input set when its upstream publishes, so two Plugins may feed
 * each other different types without forming a cycle.
 */

export type PluginResolutionDiagnosticCode =
  | "capability_missing"
  | "capability_optional_missing"
  | "capability_self_provided"
  | "port_type_unsatisfiable"
  | "dependency_cycle";

export interface PluginResolutionDiagnostic {
  code: PluginResolutionDiagnosticCode;
  plugin_id: string;
  message: string;
  /** Contract identity this diagnostic is about, when there is exactly one. */
  contract?: string;
}

export interface PluginCapabilityProvider {
  capability_id: string;
  version: number;
}

export interface PluginResolutionInput {
  manifests: readonly PluginManifest[];
  /** Capabilities the Host itself provides through Modules and Services. */
  hostCapabilities?: readonly PluginCapabilityProvider[];
}

export interface PluginResolution {
  /**
   * Activation order, blocked Plugins already removed. Providers come before
   * the Plugins that require them.
   */
  order: string[];
  /** Blocked by an unsatisfied required Capability or by a cycle. */
  blocked: string[];
  diagnostics: PluginResolutionDiagnostic[];
}

function capabilityKey(capabilityId: string, version: number): string {
  return `${capabilityId}@${version}`;
}

/** `foo.v1` means version 1; `foo@2` states the version explicitly. */
function parseProvided(entry: string): PluginCapabilityProvider | null {
  const trimmed = entry.trim();
  if (trimmed === "") return null;
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return { capability_id: trimmed, version: 1 };
  const version = Number(trimmed.slice(at + 1));
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return { capability_id: trimmed.slice(0, at), version };
}

function portTypeKey(artifactTypeId: string, schemaVersion: number): string {
  return `${artifactTypeId}@${schemaVersion}`;
}

function requirementsOf(manifest: PluginManifest): readonly PluginRequirementDeclaration[] {
  return manifest.requires ?? [];
}

export function resolvePluginActivation(input: PluginResolutionInput): PluginResolution {
  const diagnostics: PluginResolutionDiagnostic[] = [];
  const manifests = [...input.manifests].sort((left, right) =>
    left.plugin_id.localeCompare(right.plugin_id));

  const providersByCapability = new Map<string, string[]>();
  for (const provider of input.hostCapabilities ?? []) {
    const key = capabilityKey(provider.capability_id, provider.version);
    providersByCapability.set(key, [...(providersByCapability.get(key) ?? []), "@host"]);
  }
  const producedPortTypes = new Set<string>();
  for (const manifest of manifests) {
    for (const entry of manifest.capabilities.provides) {
      const provided = parseProvided(entry);
      if (!provided) continue;
      const key = capabilityKey(provided.capability_id, provided.version);
      providersByCapability.set(key, [...(providersByCapability.get(key) ?? []), manifest.plugin_id]);
    }
    for (const output of manifest.ports?.outputs ?? []) {
      producedPortTypes.add(portTypeKey(output.artifact_type_id, output.schema_version));
    }
    for (const produced of manifest.artifacts.produces) {
      producedPortTypes.add(portTypeKey(produced.artifact_type_id, produced.schema_version));
    }
  }

  const blocked = new Set<string>();
  const dependencies = new Map<string, Set<string>>();
  for (const manifest of manifests) {
    const needs = new Set<string>();
    for (const requirement of requirementsOf(manifest)) {
      const key = capabilityKey(requirement.capability_id, requirement.version);
      const providers = (providersByCapability.get(key) ?? [])
        .filter((provider) => provider !== manifest.plugin_id);
      const selfProvided = (providersByCapability.get(key) ?? []).includes(manifest.plugin_id);
      if (selfProvided) {
        diagnostics.push({
          code: "capability_self_provided",
          plugin_id: manifest.plugin_id,
          contract: key,
          message: `${manifest.plugin_id} 不能依赖自己提供的 Capability ${key}`,
        });
      }
      if (providers.length === 0) {
        if (requirement.optional === true) {
          diagnostics.push({
            code: "capability_optional_missing",
            plugin_id: manifest.plugin_id,
            contract: key,
            message: `可选依赖 ${key} 没有提供者：${manifest.plugin_id} 以降级方式运行`,
          });
          continue;
        }
        diagnostics.push({
          code: "capability_missing",
          plugin_id: manifest.plugin_id,
          contract: key,
          message: `必需依赖 ${key} 没有提供者：${requirement.reason}`,
        });
        blocked.add(manifest.plugin_id);
        continue;
      }
      for (const provider of providers) {
        if (provider !== "@host") needs.add(provider);
      }
    }
    dependencies.set(manifest.plugin_id, needs);

    for (const port of manifest.ports?.inputs ?? []) {
      if (port.optional === true) continue;
      const key = portTypeKey(port.artifact_type_id, port.schema_version);
      if (!producedPortTypes.has(key)) {
        diagnostics.push({
          code: "port_type_unsatisfiable",
          plugin_id: manifest.plugin_id,
          contract: key,
          message: `输入端口 ${port.port} 需要 ${key}，当前没有任何插件产出该类型`,
        });
      }
    }
  }

  const order: string[] = [];
  const state = new Map<string, "visiting" | "done">();
  const inCycle = new Set<string>();

  const visit = (pluginId: string, stack: string[]): void => {
    const current = state.get(pluginId);
    if (current === "done") return;
    if (current === "visiting") {
      const start = stack.indexOf(pluginId);
      const cycle = start >= 0 ? [...stack.slice(start), pluginId] : [pluginId, pluginId];
      for (const member of cycle) inCycle.add(member);
      diagnostics.push({
        code: "dependency_cycle",
        plugin_id: pluginId,
        message: `依赖成环：${cycle.join(" → ")}`,
      });
      return;
    }
    state.set(pluginId, "visiting");
    stack.push(pluginId);
    for (const dependency of [...(dependencies.get(pluginId) ?? [])].sort()) {
      if (!dependencies.has(dependency)) continue;
      visit(dependency, stack);
    }
    stack.pop();
    state.set(pluginId, "done");
    order.push(pluginId);
  };

  for (const manifest of manifests) visit(manifest.plugin_id, []);

  for (const member of inCycle) blocked.add(member);

  // A Plugin whose provider is blocked cannot start either. Propagate once the
  // direct blocks are known, following the resolved order.
  let changed = true;
  while (changed) {
    changed = false;
    for (const manifest of manifests) {
      if (blocked.has(manifest.plugin_id)) continue;
      for (const dependency of dependencies.get(manifest.plugin_id) ?? []) {
        if (blocked.has(dependency)) {
          blocked.add(manifest.plugin_id);
          diagnostics.push({
            code: "capability_missing",
            plugin_id: manifest.plugin_id,
            contract: dependency,
            message: `依赖的插件 ${dependency} 未能激活`,
          });
          changed = true;
          break;
        }
      }
    }
  }

  return {
    order: order.filter((pluginId) => !blocked.has(pluginId)),
    blocked: [...blocked].sort(),
    diagnostics,
  };
}
