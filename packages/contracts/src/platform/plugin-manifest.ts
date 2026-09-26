import { inspectAgentDeclaration } from "./plugin-agent.js";
import { inspectActionDeclarations } from "./actions.js";
import { inspectEventDeclarations } from "./plugin-events.js";
import { inspectMcpExports } from "./plugin-mcp.js";
import { inspectBehaviors, inspectFunctionScenes, inspectJudgmentSubjects } from "./plugin-behaviors.js";
import { inspectPortDeclarations } from "./plugin-wiring.js";
import { UI_COMMAND_INPUT_KINDS, UI_VIEW_SLOTS } from "./ui.js";
import type { PluginManifest } from "./plugin.js";

export class PluginManifestError extends Error {
  constructor(
    readonly code:
      | "plugin_manifest_invalid"
      | "plugin_entrypoint_missing"
      | "plugin_permission_invalid"
      | "plugin_declaration_invalid",
    message: string,
  ) {
    super(message);
    this.name = "PluginManifestError";
  }
}

export function canonicalPluginId(pluginId: string): string {
  return pluginId;
}

const PLUGIN_ID = /^io\.molis\.work\.[a-z0-9][a-z0-9.-]*$/u;
const ROUTE_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const NUMERIC = "(?:0|[1-9]\\d*)";
const PRERELEASE_IDENTIFIER = "(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const SEMVER = new RegExp(`^${NUMERIC}\\.${NUMERIC}\\.${NUMERIC}(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`, "u");

/** Validate the public wire shape before authors or tools use any Manifest fields. */
export function parsePluginManifest(input: unknown): PluginManifest {
  const manifest = record(input, "Manifest");
  const publisher = record(manifest.publisher, "publisher");
  const schemaVersion = manifest.schema_version;
  if ((schemaVersion !== 1 && schemaVersion !== 2) || manifest.host_api_version !== schemaVersion) {
    throw new PluginManifestError(
      "plugin_manifest_invalid",
      "Plugin Manifest schema_version 必须是 1 或 2，且 host_api_version 与之相同",
    );
  }
  if (!text(manifest.plugin_id) || !PLUGIN_ID.test(manifest.plugin_id)
    || !text(manifest.version) || !SEMVER.test(manifest.version)
    || !text(manifest.name) || !text(publisher.publisher_id) || !text(publisher.signature)
    || (manifest.kind !== "native" && manifest.kind !== "integration" && manifest.kind !== "app")) {
    throw new PluginManifestError("plugin_manifest_invalid", "Plugin Manifest 身份、名称、类型或版本不合法");
  }
  if (manifest.kind === "app" && schemaVersion !== 2) {
    throw new PluginManifestError("plugin_manifest_invalid", "app Plugin 必须使用 schema_version 2");
  }
  inspectUpgradeCompatibility(manifest);
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
  const ui = record(manifest.ui, "ui");
  strings(ui.contributions, "ui.contributions");
  if (ui.embedded_plugins !== undefined) {
    strings(ui.embedded_plugins, "ui.embedded_plugins");
    const ids = ui.embedded_plugins as string[];
    if (ids.some(id => !PLUGIN_ID.test(id) || id === manifest.plugin_id) || new Set(ids).size !== ids.length) {
      invalid("ui.embedded_plugins 必须为不含自身、重复项或首尾空白的 Plugin ID");
    }
  }

  const parsed = input as PluginManifest;
  if (schemaVersion === 1) {
    assertNoV2Blocks(manifest, ui);
  } else {
    assertV2Blocks(parsed, ui);
  }

  const pluginId = canonicalPluginId(parsed.plugin_id);
  return pluginId === parsed.plugin_id ? parsed : { ...parsed, plugin_id: pluginId };
}

function inspectUpgradeCompatibility(manifest: Record<string, unknown>): void {
  const value = manifest.upgrade_compatibility;
  if (value === undefined) return;
  const compatibility = record(value, "upgrade_compatibility");
  const fields = ["compatible_from_versions", "migratable_from_versions"] as const;
  const seen = new Set<string>();
  let count = 0;
  for (const field of fields) {
    const versions = compatibility[field];
    if (versions === undefined) continue;
    if (!Array.isArray(versions)) invalid(`upgrade_compatibility.${field} 必须为数组`);
    count += versions.length;
    for (const version of versions) {
      if (typeof version !== "string" || !SEMVER.test(version) || seen.has(version)) {
        invalid("升级来源必须是不重复的精确 SemVer；每个来源只能声明为兼容或可迁移之一");
      }
      const isSameVersion = version === manifest.version;
      if (isSameVersion && field !== "compatible_from_versions") {
        invalid("同版本 Manifest 只能声明为直接兼容，不能声明为可迁移");
      }
      if (!isSameVersion && comparePluginVersions(version, String(manifest.version)) >= 0) {
        invalid("升级来源版本必须早于当前 Manifest 版本");
      }
      seen.add(version);
    }
  }
  if (count === 0) invalid("upgrade_compatibility 至少要声明一个兼容或可迁移来源版本");
}

export function comparePluginVersions(left: string, right: string): number {
  const parse = (value: string) => {
    const withoutBuild = value.split("+", 1)[0]!;
    const [core, prerelease] = withoutBuild.split("-", 2);
    return { core: core!.split(".").map(BigInt), prerelease: prerelease?.split(".") ?? null };
  };
  const a = parse(left), b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index]! < b.core[index]! ? -1 : 1;
  }
  if (a.prerelease === null || b.prerelease === null) {
    return a.prerelease === b.prerelease ? 0 : a.prerelease === null ? 1 : -1;
  }
  for (let index = 0; index < Math.min(a.prerelease.length, b.prerelease.length); index += 1) {
    const leftPart = a.prerelease[index]!, rightPart = b.prerelease[index]!;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart), rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return BigInt(leftPart) < BigInt(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length < b.prerelease.length ? -1 : 1;
}

/** A v1 Manifest cannot carry v2 declarations: the version must state the contract. */
function assertNoV2Blocks(manifest: Record<string, unknown>, ui: Record<string, unknown>): void {
  const v2Blocks: Array<[string, unknown]> = [
    ["ports", manifest.ports],
    ["events", manifest.events],
    ["routes", manifest.routes],
    ["requires", manifest.requires],
    ["agent", manifest.agent],
    ["mcp_exports", manifest.mcp_exports],
    ["behaviors", manifest.behaviors],
    ["function_scenes", manifest.function_scenes],
    ["judgment_subjects", manifest.judgment_subjects],
    ["actions", manifest.actions],
    ["action_scenes", manifest.action_scenes],
    ["ui.embedded_plugins", ui.embedded_plugins],
    ["ui.views", ui.views],
    ["ui.commands", ui.commands],
  ];
  for (const [name, value] of v2Blocks) {
    if (value !== undefined) {
      throw new PluginManifestError(
        "plugin_declaration_invalid",
        `${name} 需要 schema_version 2；请递增 Manifest 版本而不是混用`,
      );
    }
  }
}

function assertV2Blocks(parsed: PluginManifest, ui: Record<string, unknown>): void {
  const problems: string[] = [];
  problems.push(...inspectActionDeclarations(parsed.actions, parsed.action_scenes));
  const declaredPermissions = new Set(parsed.permissions.map(p => p.permission));
  for (const action of Array.isArray(parsed.actions) ? parsed.actions : []) {
    for (const permission of Array.isArray(action?.action?.permissions) ? action.action.permissions : []) {
      if (!declaredPermissions.has(permission)) problems.push(`能力 ${action.capability_id} 使用未声明权限 ${permission}`);
    }
  }
  for (const scene of Array.isArray(parsed.action_scenes) ? parsed.action_scenes : []) {
    for (const permission of [...(Array.isArray(scene?.permissions) ? scene.permissions : []), ...(Array.isArray(scene?.configuration_permissions) ? scene.configuration_permissions : [])]) {
      if (!declaredPermissions.has(permission)) problems.push(`场景 ${scene.scene_id} 使用未声明权限 ${permission}`);
    }
  }
  problems.push(...inspectPortDeclarations(parsed.ports));
  problems.push(...inspectEventDeclarations(parsed.plugin_id, parsed.events));
  problems.push(...inspectAgentDeclaration(
    parsed.agent,
    (parsed.ports?.inputs ?? []).map((input) => input.port),
  ));
  problems.push(...inspectViewDeclarations(parsed, ui));
  problems.push(...inspectCommandDeclarations(parsed));
  problems.push(...inspectRouteDeclarations(parsed));
  problems.push(...inspectMcpExports(parsed.mcp_exports));
  problems.push(...inspectBehaviors(parsed.plugin_id, parsed.behaviors));
  problems.push(...inspectFunctionScenes(parsed.function_scenes));
  problems.push(...inspectJudgmentSubjects(parsed.judgment_subjects));
  problems.push(...inspectRequirementDeclarations(parsed));
  problems.push(...inspectPortPermissions(parsed));
  if (problems.length > 0) {
    throw new PluginManifestError("plugin_declaration_invalid", problems.join("；"));
  }
}

function inspectViewDeclarations(parsed: PluginManifest, ui: Record<string, unknown>): string[] {
  const views = parsed.ui.views;
  if (views === undefined) return [];
  if (!Array.isArray(ui.views)) return ["ui.views 必须为数组"];
  const problems: string[] = [];
  const contributions = new Set(parsed.ui.contributions);
  const seen = new Set<string>();
  for (const view of views) {
    if (!text(view.view_id)) {
      problems.push("视图缺少 ID");
      continue;
    }
    if (seen.has(view.view_id)) {
      problems.push(`视图重复：${view.view_id}`);
      continue;
    }
    seen.add(view.view_id);
    if (!UI_VIEW_SLOTS.includes(view.slot)) {
      problems.push(`视图 ${view.view_id} 的 slot 不合法`);
    }
    if (!text(view.title)) problems.push(`视图 ${view.view_id} 缺少标题`);
    const contributionId = view.contribution_id ?? `${parsed.plugin_id}.${view.view_id}`;
    if (!contributions.has(contributionId)) {
      problems.push(`视图 ${view.view_id} 的 contribution ${contributionId} 未在 ui.contributions 声明`);
    }
  }
  return problems;
}

function inspectCommandDeclarations(parsed: PluginManifest): string[] {
  const commands = parsed.ui.commands;
  if (commands === undefined) return [];
  const problems: string[] = [];
  const views = new Set((parsed.ui.views ?? []).map((view) => view.view_id));
  const seen = new Set<string>();
  for (const command of commands) {
    if (!text(command.command_id)) {
      problems.push("命令缺少 ID");
      continue;
    }
    if (seen.has(command.command_id)) {
      problems.push(`命令重复：${command.command_id}`);
      continue;
    }
    seen.add(command.command_id);
    if (!text(command.title)) problems.push(`命令 ${command.command_id} 缺少标题`);
    if (!Array.isArray(command.input_kinds) || command.input_kinds.length === 0) {
      problems.push(`命令 ${command.command_id} 必须声明输入种类`);
    } else {
      for (const kind of command.input_kinds) {
        if (!UI_COMMAND_INPUT_KINDS.includes(kind)) {
          problems.push(`命令 ${command.command_id} 的输入种类 ${kind} 不合法`);
        }
      }
    }
    if (!views.has(command.opens_view_id)) {
      problems.push(`命令 ${command.command_id} 打开的视图 ${command.opens_view_id} 未声明`);
    }
  }
  return problems;
}

function inspectRouteDeclarations(parsed: PluginManifest): string[] {
  const routes = parsed.routes;
  if (routes === undefined) return [];
  const problems: string[] = [];
  const permissions = new Set(parsed.permissions.map((item) => item.permission));
  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const route of routes) {
    if (!text(route.route_id)) {
      problems.push("路由缺少 ID");
      continue;
    }
    if (seenIds.has(route.route_id)) {
      problems.push(`路由重复：${route.route_id}`);
      continue;
    }
    seenIds.add(route.route_id);
    if (!ROUTE_METHODS.includes(route.method)) {
      problems.push(`路由 ${route.route_id} 的方法不合法`);
    }
    if (!text(route.path) || !route.path.startsWith("/") || route.path.includes("..")) {
      problems.push(`路由 ${route.route_id} 的路径不合法`);
      continue;
    }
    const key = `${route.method} ${route.path}`;
    if (seenPaths.has(key)) problems.push(`路由路径重复：${key}`);
    seenPaths.add(key);
    if (route.permission !== undefined && !permissions.has(route.permission)) {
      problems.push(`路由 ${route.route_id} 要求未声明的权限 ${route.permission}`);
    }
  }
  return problems;
}

function inspectRequirementDeclarations(parsed: PluginManifest): string[] {
  const requires = parsed.requires;
  if (requires === undefined) return [];
  const problems: string[] = [];
  const consumes = new Set(parsed.capabilities.consumes);
  const seen = new Set<string>();
  for (const requirement of requires) {
    if (!text(requirement.capability_id)) {
      problems.push("依赖缺少 Capability ID");
      continue;
    }
    if (!Number.isSafeInteger(requirement.version) || requirement.version < 1) {
      problems.push(`依赖 ${requirement.capability_id} 的版本无效`);
      continue;
    }
    const key = `${requirement.capability_id}@${requirement.version}`;
    if (seen.has(key)) {
      problems.push(`依赖重复：${key}`);
      continue;
    }
    seen.add(key);
    if (!text(requirement.reason)) {
      problems.push(`依赖 ${key} 必须说明用途`);
    }
    if (!consumes.has(requirement.capability_id)) {
      problems.push(`依赖 ${key} 未列入 capabilities.consumes`);
    }
  }
  return problems;
}

/**
 * Ports move Artifacts, so a Manifest that declares them must also declare the
 * Artifact permission it will need. Catching it here means an author learns at
 * validation time instead of at the first publish.
 */
function inspectPortPermissions(parsed: PluginManifest): string[] {
  const ports = parsed.ports;
  if (!ports) return [];
  const permissions = new Set(parsed.permissions.map((item) => item.permission));
  const problems: string[] = [];
  if (ports.outputs.length > 0 && !permissions.has("artifact:write")) {
    problems.push("声明了输出端口就必须声明 artifact:write 权限");
  }
  if (ports.inputs.length > 0 && !permissions.has("artifact:read")) {
    problems.push("声明了输入端口就必须声明 artifact:read 权限");
  }

  // Ports and the Artifact declarations must agree. `artifacts.produces` and
  // `artifacts.consumes` remain the one security-relevant list the Host checks
  // at publish time; a port naming a type that is missing there would only fail
  // on the first publish.
  const typeKey = (artifactTypeId: string, schemaVersion: number) =>
    `${artifactTypeId}@${schemaVersion}`;
  const produces = new Set(parsed.artifacts.produces
    .map((item) => typeKey(item.artifact_type_id, item.schema_version)));
  const consumes = new Set(parsed.artifacts.consumes
    .map((item) => typeKey(item.artifact_type_id, item.schema_version)));
  for (const output of ports.outputs) {
    const key = typeKey(output.artifact_type_id, output.schema_version);
    if (!produces.has(key)) {
      problems.push(`输出端口 ${output.port} 的类型 ${key} 没有列入 artifacts.produces`);
    }
  }
  for (const port of ports.inputs) {
    const key = typeKey(port.artifact_type_id, port.schema_version);
    if (!consumes.has(key)) {
      problems.push(`输入端口 ${port.port} 的类型 ${key} 没有列入 artifacts.consumes`);
    }
  }
  return problems;
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
