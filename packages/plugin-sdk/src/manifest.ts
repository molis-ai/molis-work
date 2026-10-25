import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SURFACE_BROWSER_PERMISSION, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_VIEW_SLOTS } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLUGIN_REVIEW_KINDS, PLUGIN_REVIEW_PERMISSION_PREFIX } from "@molis-ai/molis-work-contracts/services/agent-host";
import { inspectActionCrossReferences } from "./action-cross-references.js";
import { inspectActionDeclarations, projectReachPermissionProblems } from "./action-declarations.js";
import { inspectAgentDeclaration, inspectMethodDeclarations } from "./agent-declarations.js";
import { artifactDeclarationProblems } from "./artifact-declarations.js";
import { backgroundDeclarationProblems } from "./background-declarations.js";
import { attentionDeclarationProblems } from "./attention-declarations.js";
import { connectionDeclarationProblems } from "./connection-declarations.js";
import { databaseDeclarationProblems } from "./database-declarations.js";
import { ownerFilesDeclarationProblems } from "./owner-files-declaration.js";
import { imageGenerationDeclarationProblems, localToolsDeclarationProblems, modelConfigurationDeclarationProblems } from "./service-declarations.js";
import { inspectContextDeclarations } from "./context-declarations.js";
import { inspectEventDeclarations, inspectPortDeclarations } from "./wiring-declarations.js";
import { createStations, viewPlacementProblems } from "./view-placement-declarations.js";
import { PLUGIN_ID } from "./plugin-id.js";



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
    throw pluginErrors.manifest_invalid("Plugin Manifest schema_version 必须是 1 或 2，且 host_api_version 与之相同");
  }
  if (!text(manifest.plugin_id) || !PLUGIN_ID.test(manifest.plugin_id)
    || !text(manifest.version) || !SEMVER.test(manifest.version)
    || !text(manifest.name) || !text(publisher.publisher_id) || !text(publisher.signature)
    || (manifest.kind !== "native" && manifest.kind !== "integration" && manifest.kind !== "app")) {
    throw pluginErrors.manifest_invalid("Plugin Manifest 身份、名称、类型或版本不合法");
  }
  if (manifest.kind === "app" && schemaVersion !== 2) {
    throw pluginErrors.manifest_invalid("app Plugin 必须使用 schema_version 2");
  }
  inspectUpgradeCompatibility(manifest);
  inspectPresentation(manifest);
  if (manifest.always_on !== undefined && typeof manifest.always_on !== "boolean") invalid("always_on 必须为布尔值");
  if (!Array.isArray(manifest.entrypoints) || manifest.entrypoints.length === 0) {
    throw pluginErrors.entrypoint_missing("Plugin 至少需要一个 entrypoint");
  }
  const deployments = new Set<string>();
  for (const value of manifest.entrypoints) {
    const entry = record(value, "entrypoint");
    if ((entry.deployment !== "local" && entry.deployment !== "server")
      || !text(entry.entrypoint) || deployments.has(entry.deployment)) {
      throw pluginErrors.entrypoint_missing("同一部署环境只能声明一个有效 entrypoint");
    }
    deployments.add(entry.deployment);
  }
  if (!Array.isArray(manifest.permissions)) {
    throw pluginErrors.permission_invalid("Plugin permissions 必须为数组");
  }
  const permissions = new Set<string>();
  for (const value of manifest.permissions) {
    const permission = record(value, "permission");
    if (!text(permission.permission) || !text(permission.reason)
      || typeof permission.required !== "boolean" || permissions.has(permission.permission)) {
      throw pluginErrors.permission_invalid("Plugin permission 必须唯一并说明用途及是否必需");
    }
    permissions.add(permission.permission);
    if (permission.permission === SURFACE_BROWSER_PERMISSION) {
      // Coarse and exact, like a site rule: a path or query would make the declaration say less than it allows.
      if (!Array.isArray(permission.origins) || permission.origins.length === 0 || permission.origins.some(origin => !isWebOrigin(origin))) {
        throw pluginErrors.permission_invalid("surface:browser 的 origins 必须列出完整的网站来源（如 https://example.com），不带路径、查询串或片段");
      }
    } else if (permission.origins !== undefined) {
      throw pluginErrors.permission_invalid("只有 surface:browser 可以列出 origins");
    }
    // A review kind is the platform's, never the plugin's: only the listed ones exist (PG-009).
    if (permission.permission.startsWith(PLUGIN_REVIEW_PERMISSION_PREFIX)
      && !(PLUGIN_REVIEW_KINDS as readonly string[]).includes(permission.permission.slice(PLUGIN_REVIEW_PERMISSION_PREFIX.length))) {
      throw pluginErrors.permission_invalid(`没有 ${permission.permission} 这种审查；能声明的只有 ${PLUGIN_REVIEW_KINDS.map(kind => PLUGIN_REVIEW_PERMISSION_PREFIX + kind).join("、")}`);
    }
  }
  const databaseProblems = databaseDeclarationProblems(manifest.databases, permissions);
  if (databaseProblems.length > 0) invalid(databaseProblems.join("；"));
  const serviceProblems = [...ownerFilesDeclarationProblems(manifest.owner_files, permissions), ...modelConfigurationDeclarationProblems(manifest.model_configuration, permissions),
    ...imageGenerationDeclarationProblems(manifest.image_generation, permissions), ...localToolsDeclarationProblems(manifest.local_tools, permissions)];
  if (serviceProblems.length > 0) invalid(serviceProblems.join("；"));
  const capabilities = record(manifest.capabilities, "capabilities");
  strings(capabilities.provides, "capabilities.provides");
  strings(capabilities.consumes, "capabilities.consumes");
  for (const field of ["artifacts", "process_items"] as const) {
    if (field === "process_items" && manifest.process_items === undefined) continue;
    const declared = record(manifest[field], field);
    for (const key of ["produces", "consumes"] as const) {
      const types = declared[key];
      if (!Array.isArray(types)) invalid(`${field}.${key} 必须为数组`);
      for (const value of types) {
        const type = record(value, `${field}.${key}`);
        if (!text(type.artifact_type_id) || typeof type.schema_version !== "number"
          || !Number.isSafeInteger(type.schema_version) || type.schema_version < 1) {
          invalid("类型必须声明 type ID 与正整数 schema_version");
        }
      }
    }
  }
  const ui = record(manifest.ui, "ui");
  strings(ui.contributions, "ui.contributions");
  if (ui.commands !== undefined) throw pluginErrors.declaration_invalid("ui.commands 已取消：没有界面调用插件的命令，请删掉这一项（BL-363）");
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
    assertArtifactDeclarations(parsed);
  } else {
    assertV2Blocks(parsed, ui);
  }

  return parsed;
}

const SUMMARY_LIMIT = 120;

/** What the market and the page heading show (W5-02 B2): `summary` is non-empty and at most 120 characters once trimmed, `developer` only `true`. */
function inspectPresentation(manifest: Record<string, unknown>): void {
  const summary = typeof manifest.summary === "string" ? manifest.summary.trim() : null;
  if (manifest.summary !== undefined && (!summary || [...summary].length > SUMMARY_LIMIT)) invalid(`summary 必须是不超过 ${SUMMARY_LIMIT} 字的非空文字`);
  if (manifest.developer !== undefined && manifest.developer !== true) invalid("developer 只能写 true，不是开发者插件就不写");
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
    const separator = withoutBuild.indexOf("-");
    const core = separator < 0 ? withoutBuild : withoutBuild.slice(0, separator);
    return { core: core.split(".").map(BigInt), prerelease: separator < 0 ? null : withoutBuild.slice(separator + 1).split(".") };
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
    ["always_on", manifest.always_on],
    ["ports", manifest.ports],
    ["events", manifest.events],
    ["routes", manifest.routes],
    ["requires", manifest.requires],
    ["agent", manifest.agent],
    ["actions", manifest.actions],
    ["action_scenes", manifest.action_scenes],
    ["background", manifest.background],
    ["connections", manifest.connections],
    ["attention", manifest.attention],
    ["ui.embedded_plugins", ui.embedded_plugins],
    ["ui.views", ui.views],
  ];
  for (const [name, value] of v2Blocks) {
    if (value !== undefined) {
      throw pluginErrors.declaration_invalid(`${name} 需要 schema_version 2；请递增 Manifest 版本而不是混用`);
    }
  }
}

/** A v1 Manifest has no problems list of its own to add the 成果 types to (v2 adds them to its list in `assertV2Blocks`). */
function assertArtifactDeclarations(parsed: PluginManifest): void {
  assertNoDeclarationProblems(artifactDeclarationProblems(parsed));
}

/** The one place a list of declaration problems becomes the refusal (the error-code gates count each literal of a code). */
function assertNoDeclarationProblems(problems: readonly string[]): void {
  if (problems.length > 0) throw pluginErrors.declaration_invalid(problems.join("；"));
}

function assertV2Blocks(parsed: PluginManifest, ui: Record<string, unknown>): void {
  const problems: string[] = [];
  problems.push(...inspectActionDeclarations(parsed.actions, parsed.action_scenes), ...inspectActionCrossReferences(parsed.actions));
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
  problems.push(...projectReachPermissionProblems(parsed.actions, declaredPermissions));
  problems.push(...inspectPortDeclarations(parsed.ports, parsed.plugin_id));
  problems.push(...inspectEventDeclarations(parsed.plugin_id, parsed.events, declaredPermissions));
  problems.push(...inspectAgentDeclaration(
    parsed.agent,
    (parsed.ports?.inputs ?? []).map((input) => input.port),
  ));
  problems.push(...inspectMethodDeclarations(parsed.methods));
  problems.push(...inspectViewDeclarations(parsed, ui));
  problems.push(...inspectRouteDeclarations(parsed));
  problems.push(...inspectRequirementDeclarations(parsed));
  problems.push(...inspectPortPermissions(parsed));
  problems.push(...artifactDeclarationProblems(parsed));
  problems.push(...inspectContextDeclarations(parsed));
  problems.push(...backgroundDeclarationProblems(parsed.background, declaredPermissions, parsed.actions));
  problems.push(...connectionDeclarationProblems(parsed.connections, declaredPermissions));
  problems.push(...attentionDeclarationProblems(parsed.attention, declaredPermissions));
  assertNoDeclarationProblems(problems);
}

function inspectViewDeclarations(parsed: PluginManifest, ui: Record<string, unknown>): string[] {
  const views = parsed.ui.views;
  if (views === undefined) return [];
  if (!Array.isArray(ui.views)) return ["ui.views 必须为数组"];
  const problems: string[] = [];
  const contributions = new Set(parsed.ui.contributions);
  const stations = createStations(parsed);
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
    if (view.context_binding !== undefined && (view.slot !== "side" || view.context_binding !== "focused-object")) {
      problems.push(`视图 ${view.view_id} 的 context_binding 只支持 side 的 focused-object`);
    }
    if (!text(view.title)) problems.push(`视图 ${view.view_id} 缺少标题`);
    const contributionId = view.contribution_id ?? `${parsed.plugin_id}.${view.view_id}`;
    if (!contributions.has(contributionId)) {
      problems.push(`视图 ${view.view_id} 的 contribution ${contributionId} 未在 ui.contributions 声明`);
    }
    problems.push(...viewPlacementProblems(view, stations));
  }
  return problems;
}

/** A declared folder upload may contain 64 MiB of files encoded as JSON/base64. */
const MAX_ROUTE_BODY_BYTES = 96 * 1024 * 1024;

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
    if (route.max_body_bytes !== undefined && !(Number.isSafeInteger(route.max_body_bytes) && route.max_body_bytes > 0 && route.max_body_bytes <= MAX_ROUTE_BODY_BYTES)) {
      problems.push(`路由 ${route.route_id} 的请求体上限不合法（1 到 ${MAX_ROUTE_BODY_BYTES} 字节）`);
    }
    if (route.stream !== undefined && !(route.stream === "ndjson" && route.method === "POST")) {
      problems.push(`路由 ${route.route_id} 的流式回复不合法（只有 POST 能声明 "ndjson"）`);
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

  // Ports and the type declarations must agree. `artifacts` and `process_items` remain the security-relevant lists the
  // Host checks at publish time; a port naming a type missing from both would only fail on the first publish.
  const typeKey = (artifactTypeId: string, schemaVersion: number) =>
    `${artifactTypeId}@${schemaVersion}`;
  // A port carries either kind: process items it records, or 成果 it pins and then selects.
  const keys = (items: ReadonlyArray<{ artifact_type_id: string; schema_version: number }> | undefined) =>
    new Set((items ?? []).map((item) => typeKey(item.artifact_type_id, item.schema_version)));
  const pinned = keys(parsed.artifacts.produces), recorded = keys(parsed.process_items?.produces);
  const produces = new Set([...pinned, ...recorded]);
  const consumes = new Set([...keys(parsed.artifacts.consumes), ...keys(parsed.process_items?.consumes)]);
  for (const key of pinned) {
    if (recorded.has(key)) problems.push(`类型 ${key} 不能既是成果又是过程项`);
  }
  for (const output of ports.outputs) {
    const key = typeKey(output.artifact_type_id, output.schema_version);
    if (!produces.has(key)) {
      problems.push(`输出端口 ${output.port} 的类型 ${key} 没有列入 artifacts.produces 或 process_items.produces`);
    }
  }
  for (const port of ports.inputs) {
    const key = typeKey(port.artifact_type_id, port.schema_version);
    if (!consumes.has(key)) {
      problems.push(`输入端口 ${port.port} 的类型 ${key} 没有列入 artifacts.consumes 或 process_items.consumes`);
    }
  }
  return problems;
}

function isWebOrigin(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value; } catch { return false; }
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
  throw pluginErrors.manifest_invalid(message);
}
