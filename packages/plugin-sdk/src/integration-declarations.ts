import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import { INTEGRATION_KINDS } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

// The shape of a Manifest's `connection_services` and `integrations` (PG-046): the services a plugin works with, the cards shown for
// them, and what it does with each. Only the shape and the references between the two lists are checked here; whether an id is taken
// by another plugin is for the Home's registry when the plugin is enabled. `parsePluginManifest` is the one caller.

const SERVICE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const INTEGRATION_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const DOCUMENT_SOURCE = /^[a-z][a-z0-9-]{0,63}$/u;
const GROUPS = new Set(["mail", "files", "chat", "code", "work", "design", "crm", "social"]);
const AUTH_KINDS = new Set(["github", "gmail", "notion", "feishu", "token", "none"]);
const METHOD_KINDS = new Set(["oauth", "cli", "token", "mcp"]);
const FULFILLMENTS = new Set(["live", "unfulfilled"]);
const SERVICE_FIELDS = new Set(["service_id", "title", "group_id", "summary", "auth_kind", "auth", "auth_help", "capabilities", "outbound_note", "setup_links", "origins"]);
const INTEGRATION_FIELDS = new Set(["integration_id", "kind", "service_id", "document_source", "connection_methods"]);
const TOKEN_FIELDS = new Set(["kind", "label", "placeholder"]);

export function integrationDeclarationProblems(manifest: { kind?: unknown; connection_services?: unknown; integrations?: unknown }): string[] {
  const { connection_services: services, integrations } = manifest;
  if (services === undefined && integrations === undefined) return [];
  if (manifest.kind !== "integration") return ["只有 Integration Plugin 能声明 connection_services 和 integrations"];
  const problems: string[] = [];
  const serviceIds = new Set<string>();
  if (services !== undefined) {
    if (!Array.isArray(services) || services.length === 0) problems.push("connection_services 必须是至少一项的数组");
    else for (const service of services) problems.push(...serviceProblems(service, serviceIds));
  }
  if (integrations !== undefined) {
    if (!Array.isArray(integrations) || integrations.length === 0) problems.push("integrations 必须是至少一项的数组");
    else {
      const seen = new Set<string>();
      for (const integration of integrations) problems.push(...integrationProblems(integration, serviceIds, seen));
    }
  }
  return problems;
}

function serviceProblems(value: unknown, seen: Set<string>): string[] {
  if (!isRecord(value) || typeof value.service_id !== "string" || !SERVICE_ID.test(value.service_id)) {
    return ["连接服务的 service_id 必须是小写字母开头、只含小写字母、数字和连字符、至多 64 个字符的名字"];
  }
  const id = value.service_id;
  if (seen.has(id)) return [`连接服务重复：${id}`];
  seen.add(id);
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !SERVICE_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`连接服务 ${id} 不认这些字段：${unknown.join("、")}`);
  if (!text(value.title)) problems.push(`连接服务 ${id} 要写 title`);
  if (!text(value.summary)) problems.push(`连接服务 ${id} 要写 summary`);
  if (typeof value.group_id !== "string" || !GROUPS.has(value.group_id)) problems.push(`连接服务 ${id} 的 group_id 不是目录里的分组`);
  if (typeof value.auth_kind !== "string" || !AUTH_KINDS.has(value.auth_kind)) problems.push(`连接服务 ${id} 的 auth_kind 不合法`);
  problems.push(...methodProblems(id, value.auth));
  if (value.auth_help !== undefined && !text(value.auth_help)) problems.push(`连接服务 ${id} 的 auth_help 必须是非空文字`);
  problems.push(...capabilityProblems(id, value.capabilities));
  if (value.outbound_note !== undefined && !text(value.outbound_note)) problems.push(`连接服务 ${id} 的 outbound_note 必须是非空文字`);
  if (value.setup_links !== undefined) problems.push(...linkProblems(id, value.setup_links));
  if (value.origins !== undefined) problems.push(...originProblems(id, value.origins));
  return problems;
}

/** At most this many origins for one service. */
const MAX_ORIGINS = 8;
const IP_LITERAL = /^(?:\d+\.){3}\d+$|^\[/u;
const LOCAL_SUFFIX = /\.(?:localhost|local|internal|home\.arpa)$/u;
/** A DNS name of letters, digits and hyphens: no wildcard, no underscore. */
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

/**
 * A service's own origins (S-94): each exactly `https://host[:port]`, written as the URL parser writes it back, with a public-looking
 * name: no address literal, no loopback, no single-label or local name. The Host still refuses a private address after it resolves one.
 */
function originProblems(id: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ORIGINS) return [`连接服务 ${id} 的 origins 必须是 1 到 ${MAX_ORIGINS} 个来源`];
  const problems: string[] = [];
  for (const origin of value) {
    let url: URL | undefined;
    try { url = typeof origin === "string" ? new URL(origin) : undefined; } catch { url = undefined; }
    const host = url?.hostname ?? "";
    if (!url || url.protocol !== "https:" || url.origin !== origin) problems.push(`连接服务 ${id} 的来源 ${String(origin)} 必须正好是 https://主机[:端口]`);
    else if (IP_LITERAL.test(host) || isLoopbackHostname(host) || !HOST_NAME.test(host) || LOCAL_SUFFIX.test(host)) problems.push(`连接服务 ${id} 的来源 ${origin} 必须是公开的域名，不能是地址、本机或局域网名字`);
  }
  if (new Set(value).size !== value.length) problems.push(`连接服务 ${id} 的 origins 有重复`);
  return problems;
}

function methodProblems(id: string, auth: unknown): string[] {
  if (!isRecord(auth) || Object.keys(auth).some(field => field !== "methods") || !Array.isArray(auth.methods)) {
    return [`连接服务 ${id} 的 auth 必须是 { methods: [...] }`];
  }
  const problems: string[] = [];
  const kinds = new Set<string>();
  for (const method of auth.methods) {
    if (!isRecord(method) || typeof method.kind !== "string" || !METHOD_KINDS.has(method.kind)) {
      problems.push(`连接服务 ${id} 的接入方式 kind 必须是 oauth、cli、token、mcp 之一`);
      continue;
    }
    if (kinds.has(method.kind)) { problems.push(`连接服务 ${id} 的接入方式重复：${method.kind}`); continue; }
    kinds.add(method.kind);
    if (method.kind !== "token") {
      if (Object.keys(method).length !== 1) problems.push(`连接服务 ${id} 的 ${method.kind} 接入方式现在只写 kind，数据仍在平台的表里`);
      continue;
    }
    const unknown = Object.keys(method).filter(field => !TOKEN_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`连接服务 ${id} 的 token 接入方式不认这些字段：${unknown.join("、")}`);
    if (!text(method.label)) problems.push(`连接服务 ${id} 的 token 接入方式要写 label`);
    if (method.placeholder !== undefined && typeof method.placeholder !== "string") problems.push(`连接服务 ${id} 的 token.placeholder 必须是文字`);
  }
  return problems;
}

function capabilityProblems(id: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`连接服务 ${id} 要写 capabilities`];
  const bad = value.some(entry => !isRecord(entry) || !text(entry.label) || typeof entry.fulfillment !== "string" || !FULFILLMENTS.has(entry.fulfillment));
  return bad ? [`连接服务 ${id} 的 capabilities 每项要有 label 和 fulfillment（live 或 unfulfilled）`] : [];
}

function linkProblems(id: string, value: unknown): string[] {
  if (!Array.isArray(value)) return [`连接服务 ${id} 的 setup_links 必须是数组`];
  const bad = value.some(link => !isRecord(link) || !text(link.label) || typeof link.url !== "string" || !link.url.startsWith("https://"));
  return bad ? [`连接服务 ${id} 的 setup_links 每项要有 label 和 https 地址`] : [];
}

function integrationProblems(value: unknown, serviceIds: ReadonlySet<string>, seen: Set<string>): string[] {
  if (!isRecord(value) || typeof value.integration_id !== "string" || !INTEGRATION_ID.test(value.integration_id)) {
    return ["集成的 integration_id 必须是小写字母开头、只含小写字母、数字和连字符、至多 64 个字符的名字"];
  }
  const id = value.integration_id;
  if (seen.has(id)) return [`集成重复：${id}`];
  seen.add(id);
  const problems: string[] = [];
  const unknown = Object.keys(value).filter(field => !INTEGRATION_FIELDS.has(field));
  if (unknown.length > 0) problems.push(`集成 ${id} 不认这些字段：${unknown.join("、")}`);
  if (typeof value.kind !== "string" || !(INTEGRATION_KINDS as readonly string[]).includes(value.kind)) {
    problems.push(`集成 ${id} 的 kind 必须是 ${INTEGRATION_KINDS.join("、")} 之一`);
  }
  // A plugin works with its own services; reaching another plugin's account is a grant (S-57), not a declaration.
  if (typeof value.service_id !== "string" || !serviceIds.has(value.service_id)) {
    problems.push(`集成 ${id} 的 service_id 必须是本 Manifest 的 connection_services 里声明的服务`);
  }
  const documentSource = value.document_source;
  if (value.kind === "document_import") {
    if (typeof documentSource !== "string" || !DOCUMENT_SOURCE.test(documentSource)) problems.push(`文档导入集成 ${id} 要写 document_source`);
    problems.push(...connectionMethodProblems(id, value.connection_methods));
  } else {
    if (documentSource !== undefined) problems.push(`集成 ${id} 只有文档导入才写 document_source`);
    if (value.connection_methods !== undefined) problems.push(`集成 ${id} 只有文档导入才写 connection_methods`);
  }
  return problems;
}

function connectionMethodProblems(id: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`文档导入集成 ${id} 要写 connection_methods：它能用哪几种接入方式的连接读文档`];
  if (value.some(method => typeof method !== "string" || !METHOD_KINDS.has(method))) return [`文档导入集成 ${id} 的 connection_methods 只能是 oauth、cli、token、mcp`];
  return new Set(value).size === value.length ? [] : [`文档导入集成 ${id} 的 connection_methods 有重复`];
}

function text(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
