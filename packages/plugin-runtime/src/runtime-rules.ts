import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createHash } from "node:crypto";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ACTION_ERROR_CODE } from "@molis-ai/molis-work-contracts/platform/actions";


export function validateManifest(manifest: PluginManifest): void {
  if (
    (manifest.schema_version !== 1 && manifest.schema_version !== 2)
    || manifest.host_api_version !== manifest.schema_version
    || !manifest.plugin_id.trim()
    || !manifest.version.trim()
    || !manifest.publisher.publisher_id.trim()
    || !manifest.publisher.signature.trim()
  ) {
    throw pluginErrors.manifest_invalid("Plugin Manifest 身份、签名或 Host API 不合法");
  }
  try {
    parsePluginManifest(manifest);
  } catch (error) {
    throw pluginErrors.manifest_invalid(error instanceof Error ? error.message : "Plugin Manifest 不合法");
  }
}

export function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "数据无法读取";
}

export function assertRequiredGrants(manifest: PluginManifest, grants: readonly string[]): void {
  const missing = manifest.permissions
    .filter((permission) => permission.required && !grants.includes(permission.permission))
    .map((permission) => permission.permission);
  if (missing.length > 0) {
    throw pluginErrors.grant_denied(`Plugin 缺少必需 grant：${missing.join(", ")}`);
  }
}

export function installIdentity(manifest: PluginManifest): string {
  return `plugin-install-${createHash("sha256")
    .update(`${manifest.plugin_id}\u0000${manifest.publisher.signature}`)
    .digest("hex")
    .slice(0, 32)}`;
}

export function definitionKey(manifest: PluginManifest | PluginInstanceRecord): string {
  const signature = "publisher" in manifest
    ? manifest.publisher.signature
    : manifest.publisher_signature;
  return `${manifest.plugin_id}\u0000${manifest.version}\u0000${signature}`;
}

export function normalizeErrorCode(value: string): string {
  return ACTION_ERROR_CODE.test(value) ? value : "plugin.process_crashed";
}

export function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return normalizeErrorCode(code);
  }
  return "plugin.executor_failed";
}

export function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function cloneRecord(record: PluginInstanceRecord): PluginInstanceRecord {
  return { ...record, grants: [...record.grants] };
}
