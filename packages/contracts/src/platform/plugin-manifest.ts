import type { PluginManifest } from "./plugin.js";

export class PluginManifestError extends Error {
  constructor(
    readonly code: "plugin_manifest_invalid" | "plugin_entrypoint_missing" | "plugin_permission_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PluginManifestError";
  }
}

export function canonicalPluginId(pluginId: string): string {
  return pluginId.startsWith("io.goalboard.") ? `io.molis.work.${pluginId.slice("io.goalboard.".length)}` : pluginId;
}

/** Validate the public wire shape before authors or tools use any Manifest fields. */
export function parsePluginManifest(input: unknown): PluginManifest {
  const manifest = record(input, "Manifest");
  const publisher = record(manifest.publisher, "publisher");
  if (manifest.schema_version !== 1 || manifest.host_api_version !== 1) {
    throw new PluginManifestError("plugin_manifest_invalid", "Plugin Manifest schema_version 和 host_api_version 必须为 1");
  }
  if (!text(manifest.plugin_id) || !/^io\.(?:molis\.work|goalboard)\.[a-z0-9][a-z0-9.-]*$/u.test(manifest.plugin_id)
    || !text(manifest.version) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version)
    || !text(manifest.name) || !text(publisher.publisher_id) || !text(publisher.signature)
    || (manifest.kind !== "native" && manifest.kind !== "integration")) {
    throw new PluginManifestError("plugin_manifest_invalid", "Plugin Manifest 身份、名称、类型或版本不合法");
  }
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length === 0) {
    throw new PluginManifestError("plugin_entrypoint_missing", "Plugin 至少需要一个 entrypoint");
  }
  const deployments = new Set<string>();
  for (const value of manifest.entrypoints) {
    const entry = record(value, "entrypoint");
    if ((entry.deployment !== "local" && entry.deployment !== "server")
      || !text(entry.entrypoint) || deployments.has(entry.deployment)) {
      throw new PluginManifestError("plugin_entrypoint_missing", "同一部署环境只能声明一个有效 entrypoint");
    }
    deployments.add(entry.deployment);
  }
  if (!Array.isArray(manifest.permissions)) {
    throw new PluginManifestError("plugin_permission_invalid", "Plugin permissions 必须为数组");
  }
  const permissions = new Set<string>();
  for (const value of manifest.permissions) {
    const permission = record(value, "permission");
    if (!text(permission.permission) || !text(permission.reason)
      || typeof permission.required !== "boolean" || permissions.has(permission.permission)) {
      throw new PluginManifestError("plugin_permission_invalid", "Plugin permission 必须唯一并说明用途及是否必需");
    }
    permissions.add(permission.permission);
  }
  const capabilities = record(manifest.capabilities, "capabilities");
  strings(capabilities.provides, "capabilities.provides");
  strings(capabilities.consumes, "capabilities.consumes");
  const artifacts = record(manifest.artifacts, "artifacts");
  for (const key of ["produces", "consumes"] as const) {
    const types = artifacts[key];
    if (!Array.isArray(types)) invalid(`artifacts.${key} 必须为数组`);
    for (const value of types) {
      const type = record(value, `artifacts.${key}`);
      if (!text(type.artifact_type_id) || typeof type.schema_version !== "number"
        || !Number.isSafeInteger(type.schema_version) || type.schema_version < 1) {
        invalid("Artifact 必须声明 type ID 与正整数 schema_version");
      }
    }
  }
  strings(record(manifest.ui, "ui").contributions, "ui.contributions");
  const parsed = input as PluginManifest;
  const pluginId = canonicalPluginId(parsed.plugin_id);
  return pluginId === parsed.plugin_id ? parsed : { ...parsed, plugin_id: pluginId };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label} 必须为对象`);
  return value as Record<string, unknown>;
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strings(value: unknown, label: string): void {
  if (!Array.isArray(value) || !value.every(text)) invalid(`${label} 必须为非空字符串数组（可为空数组）`);
}

function invalid(message: string): never {
  throw new PluginManifestError("plugin_manifest_invalid", message);
}
