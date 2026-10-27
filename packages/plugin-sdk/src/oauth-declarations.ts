import {
  OAUTH_CLIENT_AUTHS,
  OAUTH_GRANTS,
  OAUTH_RESERVED_PARAMETERS,
  OAUTH_SETTING_USES,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestService } from "@molis-ai/molis-work-contracts/services/connector-host";
import {
  oauthDeclarableHeader,
  oauthKey,
  oauthLooksLikePlaceholder,
  oauthPathPlaceholders,
  oauthPlaceholders,
  oauthPublicHostName,
  oauthSettingValueFault,
  oauthUrlTemplate,
  oauthValueTemplate,
} from "./oauth-templates.js";

// The shape of a `connection_services[].auth.methods` entry of `kind: "oauth"` that carries its flow as data (W5-11 §2.1, §2.1.1). Any
// problem fails the whole Manifest (M5). Where the access token may go is read from the platform's request table, never from the
// Manifest: `{service}` only for a service with one origin there, a full address only on one of those origins, `{tenant}` and
// `{gateway}` only for a service the table puts on tenants' origins. Endpoints receive no access token and are not held to the table.
// The template and value rules are `oauth-templates.ts`, the same ones the Host's interpreter reads by.

const METHOD_FIELDS = new Set(["kind", "grant", "authorize_url", "token_url", "refresh_url", "device_authorization_url", "issuer", "scopes",
  "pkce", "client_auth", "token_format", "client_secret", "parameters", "settings", "identity", "keep", "context", "quirks", "note"]);
const IDENTITY_FIELDS = new Set(["url", "method", "body", "headers", "query", "list", "account_id", "label", "label_prefix", "keep"]);
const REQUEST_FIELDS = new Set(["url", "method", "body", "headers", "query"]);
const CONTEXT_FIELDS = new Set([...REQUEST_FIELDS, "key", "pick"]);
const SETTING_FIELDS = new Set(["key", "label", "placeholder", "required", "default", "use", "pattern", "enum"]);
const KEEP_FIELDS = new Set(["key", "pointer", "check", "required"]);
const QUIRK_FIELDS = new Set(["refresh_redirect_uri", "omit_token_params", "expiry"]);
const ENDPOINTS = ["authorize_url", "token_url", "refresh_url", "device_authorization_url"] as const;
const POINTER = /^(?:\/(?:[^~/]|~[01])*)+$/u;
const SOURCE = /^(?:(?:identity|token):(\/.*)|context:(.+)|literal:(.+))$/su;

type Settings = ReadonlyMap<string, Record<string, unknown>>;
interface Scope { readonly id: string; readonly service: ConnectorRequestService | undefined; readonly settings: Settings }

/** The problems of one `oauth` method. A bare `{ kind: "oauth" }` is still read from the platform's table until W5-11 slice 4. */
export function oauthMethodProblems(id: string, method: Record<string, unknown>): string[] {
  if (Object.keys(method).length === 1) return [];
  const where = `连接服务 ${id} 的 oauth 接入方式`;
  const unknown = Object.keys(method).filter(field => !METHOD_FIELDS.has(field));
  if (unknown.length > 0) return [`${where}不认这些字段：${unknown.join("、")}`];
  const service = Object.hasOwn(CONNECTOR_REQUEST_SERVICES, id) ? CONNECTOR_REQUEST_SERVICES[id] : undefined;
  const problems: string[] = [];
  const settings = settingMap(where, method.settings, service, problems);
  const scope: Scope = { id, service, settings };
  problems.push(...grantProblems(where, method));
  for (const field of ENDPOINTS) {
    if (method[field] !== undefined) problems.push(...endpointProblems(`${where}的 ${field}`, method[field], scope));
  }
  if (method.issuer !== undefined && !fixedHttps(method.issuer)) problems.push(`${where}的 issuer 必须是 https 地址，不带账号密码、端口、查询或片段`);
  problems.push(...scopeProblems(where, method.scopes, settings));
  if (method.pkce !== undefined && method.pkce !== "S256") problems.push(`${where}的 pkce 只收 S256`);
  problems.push(...clientAuthProblems(where, method.client_auth, settings));
  if (method.token_format !== undefined && method.token_format !== "form" && method.token_format !== "json") problems.push(`${where}的 token_format 只能是 form 或 json`);
  if (method.client_secret !== undefined && method.client_secret !== "required" && method.client_secret !== "optional") problems.push(`${where}的 client_secret 只能是 required 或 optional`);
  problems.push(...parameterProblems(where, method.parameters));
  const tenantSetting = [...settings.values()].some(setting => setting.use === "tenant");
  const tenantKeeps = tenantKeepCount(method.keep);
  const identityTenantKeeps = isRecord(method.identity) ? tenantKeepCount(method.identity.keep) : 0;
  if (tenantKeeps + identityTenantKeeps > 1) problems.push(`${where}的 keep 和 identity.keep 里至多一项 check: tenant`);
  // The interpreter pins the tenant to a kept `check: "tenant"` value, else the tenant setting: `{tenant}` needs one of them first.
  problems.push(...identityProblems(where, method.identity, scope, tenantSetting || tenantKeeps > 0));
  if (method.keep !== undefined) problems.push(...keepProblems(`${where}的 keep`, method.keep, service));
  if (method.context !== undefined) problems.push(...contextProblems(where, method.context, scope, tenantSetting || tenantKeeps + identityTenantKeeps > 0));
  if (method.quirks !== undefined) problems.push(...quirkProblems(where, method.quirks));
  if (method.note !== undefined && !text(method.note)) problems.push(`${where}的 note 必须是非空文字`);
  return problems;
}

function grantProblems(where: string, method: Record<string, unknown>): string[] {
  if (!(OAUTH_GRANTS as readonly unknown[]).includes(method.grant)) return [`${where}的 grant 必须是 ${OAUTH_GRANTS.join("、")} 之一`];
  const problems: string[] = [];
  if (method.token_url === undefined) problems.push(`${where}要写 token_url`);
  if (method.grant === "authorization_code") {
    if (method.authorize_url === undefined) problems.push(`${where}要写 authorize_url`);
    if (method.device_authorization_url !== undefined) problems.push(`${where}的 authorization_code 不写 device_authorization_url`);
  } else {
    if (method.device_authorization_url === undefined) problems.push(`${where}的 device 要写 device_authorization_url`);
    if (method.authorize_url !== undefined) problems.push(`${where}的 device 不写 authorize_url`);
  }
  return problems;
}

function settingMap(where: string, value: unknown, service: ConnectorRequestService | undefined, problems: string[]): Settings {
  const settings = new Map<string, Record<string, unknown>>();
  if (value === undefined) return settings;
  if (!Array.isArray(value)) { problems.push(`${where}的 settings 必须是数组`); return settings; }
  for (const setting of value) {
    if (!isRecord(setting) || !oauthKey(setting.key)) { problems.push(`${where}的 setting 要有小写的 key`); continue; }
    const at = `${where}的 setting ${setting.key}`;
    if (settings.has(setting.key)) { problems.push(`${at}重复`); continue; }
    settings.set(setting.key, setting);
    const unknown = Object.keys(setting).filter(field => !SETTING_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`${at}不认这些字段：${unknown.join("、")}`);
    if (!text(setting.label)) problems.push(`${at}要写 label`);
    for (const field of ["placeholder", "default"] as const) if (setting[field] !== undefined && typeof setting[field] !== "string") problems.push(`${at}的 ${field} 必须是文字`);
    if (typeof setting.default === "string" && setting.default.trim() !== "") problems.push(...defaultProblems(at, setting, setting.default.trim(), service));
    if (setting.required !== undefined && typeof setting.required !== "boolean") problems.push(`${at}的 required 必须是 true 或 false`);
    if (!(OAUTH_SETTING_USES as readonly unknown[]).includes(setting.use)) problems.push(`${at}的 use 必须是 ${OAUTH_SETTING_USES.join("、")} 之一`);
    if (setting.use === "tenant" && !service?.tenant) problems.push(`${at}写了 use: tenant，但平台的请求表没有把这个服务放在租户的来源上`);
    if (setting.pattern !== undefined && setting.enum !== undefined) problems.push(`${at}的 pattern 和 enum 只写一个`);
    if (setting.pattern !== undefined && !compiles(setting.pattern)) problems.push(`${at}的 pattern 不是正则`);
    if (setting.enum !== undefined && (!Array.isArray(setting.enum) || setting.enum.length === 0 || !setting.enum.every(text))) problems.push(`${at}的 enum 必须是非空的文字数组`);
    if (setting.use === "path" && setting.pattern === undefined && setting.enum === undefined) problems.push(`${at}用在路径里，要写 pattern 或 enum`);
    if (setting.use === "client_auth" && !(Array.isArray(setting.enum) && setting.enum.every(entry => (OAUTH_CLIENT_AUTHS as readonly unknown[]).includes(entry)))) {
      problems.push(`${at}的 enum 只能取 ${OAUTH_CLIENT_AUTHS.join("、")}`);
    }
  }
  if ([...settings.values()].filter(setting => setting.use === "tenant").length > 1) problems.push(`${where}至多一个 use: tenant 的 setting`);
  return settings;
}

/** A `default` is held to its setting's own rules, as a value the person typed would be; a setting whose rules are broken is reported apart. */
function defaultProblems(at: string, setting: Record<string, unknown>, value: string, service: ConnectorRequestService | undefined): string[] {
  if (typeof setting.use !== "string" || (setting.pattern !== undefined && !compiles(setting.pattern))) return [];
  if (setting.enum !== undefined && !(Array.isArray(setting.enum) && setting.enum.every(entry => typeof entry === "string"))) return [];
  const fault = oauthSettingValueFault({ use: setting.use, ...(typeof setting.pattern === "string" ? { pattern: setting.pattern } : {}),
    ...(Array.isArray(setting.enum) ? { enum: setting.enum.filter(entry => typeof entry === "string") } : {}) }, value, service?.tenant?.domain);
  return fault ? [`${at}的 default 不合这个 setting 自己的规则（${fault}）`] : [];
}

function tenantKeepCount(keeps: unknown): number {
  return Array.isArray(keeps) ? keeps.filter(keep => isRecord(keep) && keep.check === "tenant").length : 0;
}

/**
 * An endpoint: a fixed `https://` address of a public name, no credentials, port, query or fragment, `{setting.<key>}` only as a path
 * segment of a `use: "path"` setting; or `{tenant}/path` when the method has a `use: "tenant"` setting.
 */
function endpointProblems(where: string, value: unknown, scope: Scope): string[] {
  if (typeof value !== "string") return [`${where}必须是文字`];
  const template = oauthUrlTemplate(value);
  if (template && "head" in template) {
    if (template.head !== "tenant") return [`${where}只认 {tenant} 开头，不认 {${template.head}}`];
    if (![...scope.settings.values()].some(setting => setting.use === "tenant")) return [`${where}写了 {tenant}，但没有 use: tenant 的 setting`];
    return pathPlaceholderProblems(where, template.path, scope, ["setting"]);
  }
  const url = template ? parse(template.origin) : undefined;
  if (!template || !url || !fixedHttps(template.origin) || !oauthPublicHostName(url.hostname)) {
    return [`${where}必须是 https 地址，主机是公开的名字，不带账号密码、端口、查询或片段；{setting} 只能写在路径里`];
  }
  return pathPlaceholderProblems(where, template.path, scope, ["setting"]);
}

/** The placeholders of a path: each fills a whole segment, and names a setting of `use: "path"` or a context key. */
function pathPlaceholderProblems(where: string, path: string, scope: Scope, kinds: readonly ("setting" | "context")[]): string[] {
  const names = oauthPathPlaceholders(path);
  if (!names) return [`${where}的路径不带查询或片段，花括号成对，每个占位占满一个路径段`];
  const problems: string[] = [];
  for (const name of names) {
    const [kind, key = ""] = name.split(".", 2) as [string, string?];
    if (kind === "setting" && kinds.includes("setting") && scope.settings.get(key)?.use === "path") continue;
    if (kind === "context" && kinds.includes("context") && oauthKey(key)) continue;
    problems.push(`${where}有未知的占位 {${name}}`);
  }
  return problems;
}

function scopeProblems(where: string, value: unknown, settings: Settings): string[] {
  if (!Array.isArray(value)) return [`${where}的 scopes 必须是文字数组`];
  const problems: string[] = [];
  for (const entry of value) {
    if (!text(entry)) { problems.push(`${where}的 scopes 每项必须是非空文字`); continue; }
    const names = oauthPlaceholders(entry);
    if (names.length === 0 && !/[{}]/u.test(entry)) continue;
    const key = names.length === 1 && entry === `{${names[0]}}` && names[0]!.startsWith("setting.") ? names[0]!.slice("setting.".length) : "";
    if (settings.get(key)?.use !== "scope") problems.push(`${where}的 scopes 里 ${entry} 必须正好是一个 use: scope 的 {setting.<key>}`);
  }
  return problems;
}

function clientAuthProblems(where: string, value: unknown, settings: Settings): string[] {
  if (value === undefined || (OAUTH_CLIENT_AUTHS as readonly unknown[]).includes(value)) return [];
  if (isRecord(value) && Object.keys(value).length === 1 && typeof value.setting === "string" && settings.get(value.setting)?.use === "client_auth") return [];
  return [`${where}的 client_auth 必须是 ${OAUTH_CLIENT_AUTHS.join("、")} 之一，或 { setting } 指向 use: client_auth 的 setting`];
}

function parameterProblems(where: string, value: unknown): string[] {
  if (value === undefined) return [];
  if (!isRecord(value) || !Object.values(value).every(entry => typeof entry === "string")) return [`${where}的 parameters 键值都必须是文字`];
  const reserved = Object.keys(value).filter(key => (OAUTH_RESERVED_PARAMETERS as readonly string[]).includes(key));
  return reserved.length > 0 ? [`${where}的 parameters 不许写平台写的参数：${reserved.join("、")}`] : [];
}

function identityProblems(where: string, value: unknown, scope: Scope, tenantSource: boolean): string[] {
  const at = `${where}的 identity`;
  if (!isRecord(value)) return [`${at}必须是对象`];
  const unknown = Object.keys(value).filter(field => !IDENTITY_FIELDS.has(field));
  if (unknown.length > 0) return [`${at}不认这些字段：${unknown.join("、")}`];
  const problems: string[] = [];
  const sends = value.url !== undefined;
  if (sends) problems.push(...requestProblems(at, value, scope, tenantSource));
  else if (["method", "body", "headers", "query", "list", "keep"].some(field => value[field] !== undefined)) problems.push(`${at}不写 url 就不发请求，也不写 method、body、headers、query、list、keep`);
  if (value.list !== undefined && !(isRecord(value.list) && Object.keys(value.list).length === 1 && pointer(value.list.min_by))) problems.push(`${at}的 list 只能是 { min_by: 指针 }`);
  const segments = value.account_id;
  if (!Array.isArray(segments) || segments.length === 0 || !segments.every(Array.isArray)) problems.push(`${at}的 account_id 必须是至少一段的数组，每段是一组来源`);
  else {
    if (segments.length === 1 && segments[0].length === 0) problems.push(`${at}的 account_id 只有一段时不能是空段`);
    for (const segment of segments as unknown[][]) problems.push(...sourceProblems(`${at}的 account_id`, segment, sends));
  }
  if (!Array.isArray(value.label) || value.label.length === 0) problems.push(`${at}的 label 必须是至少一项的来源数组`);
  else problems.push(...sourceProblems(`${at}的 label`, value.label, sends));
  if (value.label_prefix !== undefined && (typeof value.label_prefix !== "string" || oauthLooksLikePlaceholder(value.label_prefix))) problems.push(`${at}的 label_prefix 必须是文字，不展开占位`);
  if (value.keep !== undefined) problems.push(...keepProblems(`${at}的 keep`, value.keep, scope.service));
  return problems;
}

function sourceProblems(where: string, sources: unknown[], identitySent: boolean): string[] {
  const problems: string[] = [];
  for (const source of sources) {
    const match = typeof source === "string" ? SOURCE.exec(source) : null;
    if (!match || (match[1] !== undefined && !pointer(match[1])) || (match[2] !== undefined && !oauthKey(match[2]))) {
      problems.push(`${where}的来源 ${String(source)} 必须是 identity:/指针、token:/指针、context:键 或 literal:文字`);
    } else if (!identitySent && match[1] !== undefined && String(source).startsWith("identity:")) problems.push(`${where}取了 identity 响应，但 identity 没写 url`);
  }
  return problems;
}

function keepProblems(where: string, value: unknown, service: ConnectorRequestService | undefined): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${where}必须是非空数组`];
  const problems: string[] = [];
  for (const keep of value) {
    if (!isRecord(keep) || !oauthKey(keep.key) || !pointer(keep.pointer)) { problems.push(`${where}每项要有小写的 key 和指针 pointer`); continue; }
    const unknown = Object.keys(keep).filter(field => !KEEP_FIELDS.has(field));
    if (unknown.length > 0) problems.push(`${where}的 ${keep.key} 不认这些字段：${unknown.join("、")}`);
    if (keep.required !== undefined && typeof keep.required !== "boolean") problems.push(`${where}的 ${keep.key}.required 必须是 true 或 false`);
    const check = keep.check;
    if (check === "tenant") { if (!service?.tenant) problems.push(`${where}的 ${keep.key} 写了 check: tenant，但平台的请求表没有把这个服务放在租户的来源上`); }
    else if (check !== undefined && !(isRecord(check) && Object.keys(check).length === 1 && compiles(check.pattern))) problems.push(`${where}的 ${keep.key}.check 只能是 tenant 或 { pattern }`);
  }
  return problems;
}

function contextProblems(where: string, value: unknown, scope: Scope, tenantSource: boolean): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${where}的 context 必须是非空数组`];
  const problems: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !oauthKey(entry.key)) { problems.push(`${where}的 context 每项要有小写的 key`); continue; }
    const at = `${where}的 context ${entry.key}`;
    const unknown = Object.keys(entry).filter(field => !CONTEXT_FIELDS.has(field));
    if (unknown.length > 0) { problems.push(`${at}不认这些字段：${unknown.join("、")}`); continue; }
    problems.push(...requestProblems(at, entry, scope, tenantSource));
    const pick = entry.pick;
    if (isRecord(pick) && pick.kind === "ids" && Object.keys(pick).length === 2 && pointer(String(pick.pointer).replaceAll("/*", "/x"))) continue;
    // The interpreter reads the matched setting as an origin, so it can only be the tenant setting.
    if (isRecord(pick) && pick.kind === "match_setting" && Object.keys(pick).length === 5 && typeof pick.setting === "string" && scope.settings.get(pick.setting)?.use === "tenant"
      && pointer(pick.match) && pointer(pick.take) && compiles(pick.pattern)) continue;
    problems.push(`${at}的 pick 只能是 { kind: ids, pointer } 或 { kind: match_setting, setting, match, take, pattern }，setting 指向 use: tenant 的 setting`);
  }
  return problems;
}

/**
 * A request that carries the access token (identity, context): where it may go is the platform's request table, the Manifest only
 * picks which of its origins and the path. `{account}` comes with the account origins table (W5-11 slice 4).
 */
function requestProblems(where: string, request: Record<string, unknown>, scope: Scope, tenantSource: boolean): string[] {
  const problems = urlProblems(`${where}的 url`, request.url, scope, tenantSource);
  if (request.method !== undefined && request.method !== "GET" && request.method !== "POST") problems.push(`${where}的 method 只能是 GET 或 POST`);
  if (request.body !== undefined && request.method !== "POST") problems.push(`${where}只有 POST 才写 body`);
  if (request.body !== undefined && texts(request.body).some(oauthLooksLikePlaceholder)) problems.push(`${where}的 body 是固定的 JSON，不展开占位`);
  if (request.headers !== undefined) {
    if (!isRecord(request.headers)) problems.push(`${where}的 headers 必须是对象`);
    else for (const [name, header] of Object.entries(request.headers)) {
      if (!oauthDeclarableHeader(name)) problems.push(`${where}不能写请求头 ${name}`);
      problems.push(...valueProblems(`${where}的请求头 ${name}`, header));
    }
  }
  if (request.query !== undefined) {
    if (!isRecord(request.query)) problems.push(`${where}的 query 必须是对象`);
    else for (const [name, query] of Object.entries(request.query)) problems.push(...valueProblems(`${where}的查询参数 ${name}`, query));
  }
  return problems;
}

function urlProblems(where: string, value: unknown, scope: Scope, tenantSource: boolean): string[] {
  if (typeof value !== "string") return [`${where}必须是文字`];
  const tenant = scope.service?.tenant;
  const template = oauthUrlTemplate(value);
  if (template && "head" in template) {
    const base = template.head;
    if (base === "service" && scope.service?.origins.length !== 1) return [`${where}的 {service} 只给平台请求表里只有一个来源的服务；有几个来源的写完整地址`];
    if (base === "tenant" && !tenant) return [`${where}的 {tenant} 只给平台请求表里放在租户来源上的服务`];
    if (base === "tenant" && !tenantSource) return [`${where}写了 {tenant}，但这个方法既没有 use: tenant 的 setting，也没有在这之前留下 check: tenant 的值`];
    if (base === "gateway" && !tenant?.gateway) return [`${where}的 {gateway} 只给平台请求表里有网关的服务`];
    if (!["service", "tenant", "gateway"].includes(base)) return [`${where}有未知的占位 {${base}}`];
    return pathPlaceholderProblems(where, template.path, scope, ["setting", "context"]);
  }
  const url = template ? parse(template.origin) : undefined;
  if (!template || !url || !fixedHttps(template.origin) || !scope.service?.origins.includes(url.origin)) return [`${where}写完整地址时，来源必须是平台请求表里这个服务的来源之一`];
  return pathPlaceholderProblems(where, template.path, scope, ["setting", "context"]);
}

/** A header or query value: a constant, or exactly `{client_id}` or `{context.<key>}`. */
function valueProblems(where: string, value: unknown): string[] {
  if (typeof value !== "string") return [`${where}必须是文字`];
  return oauthValueTemplate(value) ? [] : [`${where}只能是固定文字、{client_id} 或 {context.<key>}`];
}

function quirkProblems(where: string, value: unknown): string[] {
  if (!isRecord(value) || Object.keys(value).some(field => !QUIRK_FIELDS.has(field))) return [`${where}的 quirks 只认 ${[...QUIRK_FIELDS].join("、")}`];
  const problems: string[] = [];
  if (value.refresh_redirect_uri !== undefined && value.refresh_redirect_uri !== true) problems.push(`${where}的 quirks.refresh_redirect_uri 只能是 true`);
  const omit = value.omit_token_params;
  if (omit !== undefined && !(Array.isArray(omit) && omit.length > 0 && new Set(omit).size === omit.length && omit.every(entry => entry === "grant_type" || entry === "redirect_uri"))) {
    problems.push(`${where}的 quirks.omit_token_params 只能取 grant_type、redirect_uri`);
  }
  if (value.expiry !== undefined && value.expiry !== "jwt_exp") problems.push(`${where}的 quirks.expiry 只能是 jwt_exp`);
  return problems;
}

/** `https://`, no credentials, port, query or fragment. */
function fixedHttps(value: unknown): boolean {
  if (typeof value !== "string" || /[?#]/u.test(value)) return false;
  const url = parse(value);
  return !!url && url.protocol === "https:" && !url.username && !url.password && !url.port;
}

function parse(value: string): URL | undefined {
  try { return new URL(value); } catch { return undefined; }
}

function compiles(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try { return new RegExp(value, "u") instanceof RegExp; } catch { return false; }
}

function pointer(value: unknown): value is string {
  return typeof value === "string" && POINTER.test(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Every string in a JSON value, keys included. */
function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (isRecord(value)) return Object.entries(value).flatMap(([key, entry]) => [key, ...texts(entry)]);
  return [];
}
