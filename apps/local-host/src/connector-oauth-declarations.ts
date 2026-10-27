import { createHash } from "node:crypto";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  OAuthClientAuth,
  OAuthContextDeclaration,
  OAuthIdentityDeclaration,
  OAuthKeepDeclaration,
  OAuthTokenRequestDeclaration,
  OAuthValueSource,
  PluginOAuthMethodDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { CONNECTOR_REQUEST_SERVICES, type ConnectorRequestService } from "@molis-ai/molis-work-contracts/services/connector-host";
import {
  oauthCodePointOrder,
  oauthDeclarableHeader,
  oauthFillPlaceholders,
  oauthPathPlaceholders,
  oauthPathSegment,
  oauthPointerTokens,
  oauthPublicHostName,
  oauthSettingValueFault,
  oauthTenantOriginUnder,
  oauthUrlTemplate,
  oauthValueTemplate,
} from "@molis-ai/molis-work-plugin-sdk";

// The platform's one reader of an `oauth` method declared in a plugin's Manifest (W5-11 §2.2). Everything here is a pure function: it
// turns the declaration, the settings the person filled in and what the connection already holds into addresses and request
// descriptions, and reads accounts out of responses. Nothing is sent here. Where an access token may go is the platform's request table;
// every address is checked again after its template is filled in (S-09, S-10), before anything could be sent to it. The template and
// value rules are the SDK's (`oauth-templates.ts`), the same ones the Manifest check reads by.

export const oauthDeclarationErrors = defineErrorCodes("connector.oauth_declarations", {
  setting_invalid: "invalid", template_invalid: "invalid", target_refused: "forbidden", account_missing: "upstream", context_missing: "upstream",
});

/** The Atlassian gateway an OAuth token is accepted on (`ConnectorRequestTenant.gateway`). */
const ATLASSIAN_GATEWAY = "https://api.atlassian.com";
const USER_AGENT = "Molis-Work";

type Json = Record<string, unknown>;

/** The settings of one authorization once checked: each declared key, its default filled in, and the tenant origin if there is one. */
export interface OAuthResolvedSettings {
  readonly values: Readonly<Record<string, string>>;
  readonly tenant?: string;
}

/** A request the Host will send; `body` is already encoded. */
export interface OAuthRequestDescription {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

function service(serviceId: string): ConnectorRequestService | undefined {
  return Object.hasOwn(CONNECTOR_REQUEST_SERVICES, serviceId) ? CONNECTOR_REQUEST_SERVICES[serviceId] : undefined;
}

/**
 * A tenant's origin, as the platform's request table bounds it (the rule `salesforceOrigin` had): `https://`, no credentials, port,
 * path, query or fragment, a public name equal to or under the table's `tenant.domain`.
 */
export function oauthTenantOrigin(serviceId: string, raw: string): string {
  const domain = service(serviceId)?.tenant?.domain;
  if (!domain) throw oauthDeclarationErrors.target_refused(`${serviceId} 不在租户的来源上`);
  const origin = oauthTenantOriginUnder(domain, raw);
  if (!origin) throw oauthDeclarationErrors.target_refused(`地址必须是 ${domain} 下的 https 来源，不带账号密码、端口或路径`);
  return origin;
}

/** The person's settings checked against the declaration: required, default, `pattern` or `enum`, path-safe, the tenant bounded. */
export function resolveOAuthSettings(serviceId: string, method: PluginOAuthMethodDeclaration, raw: Readonly<Record<string, string>>): OAuthResolvedSettings {
  const values: Record<string, string> = {};
  let tenant: string | undefined;
  for (const setting of method.settings ?? []) {
    const value = (raw[setting.key] ?? "").trim() || setting.default || "";
    if (!value) {
      if (setting.required) throw oauthDeclarationErrors.setting_invalid(`请填写${setting.label}`);
      values[setting.key] = "";
      continue;
    }
    if (setting.use === "tenant") tenant = oauthTenantOrigin(serviceId, value);
    switch (oauthSettingValueFault(setting, value, service(serviceId)?.tenant?.domain)) {
      case "enum": throw oauthDeclarationErrors.setting_invalid(`${setting.label}只能是 ${setting.enum!.join("、")}`);
      case "pattern": throw oauthDeclarationErrors.setting_invalid(`${setting.label}的格式不对`);
      case "path": throw oauthDeclarationErrors.setting_invalid(`${setting.label}不能带 /、..、反斜杠或编码过的斜杠`);
      case "tenant": throw oauthDeclarationErrors.target_refused(`${setting.label}不是可用的租户地址`);
      case undefined: break;
    }
    values[setting.key] = setting.use === "tenant" ? tenant! : value;
  }
  for (const key of Object.keys(raw)) if (!Object.hasOwn(values, key)) throw oauthDeclarationErrors.setting_invalid(`这个服务没有设置项 ${key}`);
  return { values, ...(tenant ? { tenant } : {}) };
}

/** An endpoint with its template filled in: `{tenant}` from the tenant setting, `{setting.<key>}` as one encoded path segment. */
export function oauthEndpoint(template: string, settings: OAuthResolvedSettings): string {
  const parts = oauthUrlTemplate(template);
  if (!parts || ("head" in parts && parts.head !== "tenant")) throw oauthDeclarationErrors.template_invalid("端点只认 https 地址或 {tenant} 开头");
  let origin: string | undefined;
  if ("head" in parts) {
    if (!settings.tenant) throw oauthDeclarationErrors.template_invalid("没有填写租户地址");
    origin = settings.tenant;
  }
  const filled = fillPath(parts.path, name => {
    if (!name.startsWith("setting.")) throw oauthDeclarationErrors.template_invalid(`端点里有未知的占位 {${name}}`);
    return settings.values[name.slice("setting.".length)];
  });
  const url = checkedUrl(`${origin ?? ("origin" in parts ? parts.origin : "")}${filled}`);
  if (origin && url.origin !== origin) throw oauthDeclarationErrors.target_refused("端点不在所填的租户来源上");
  return url.href;
}

export function oauthClientAuth(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings): OAuthClientAuth {
  const declared = method.client_auth ?? "post";
  if (typeof declared === "string") return declared;
  const value = settings.values[declared.setting];
  return value === "basic" || value === "post" || value === "none" ? value : "post";
}

/** Whether the person must give a client secret: never for a public client (`client_auth` comes out `none`). */
export function oauthSecretRequired(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings): boolean {
  return oauthClientAuth(method, settings) !== "none" && (method.client_secret ?? "required") === "required";
}

export function oauthScope(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings): string {
  return method.scopes
    .map(scope => scope.startsWith("{setting.") ? settings.values[scope.slice("{setting.".length, -1)] ?? "" : scope)
    .filter(Boolean)
    .join(" ");
}

/** The address the browser is sent to. The platform alone writes the client, the callback, the state and the PKCE challenge. */
export function oauthAuthorizationUrl(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings, input: {
  clientId: string; redirectUri: string; state: string; codeChallenge: string;
}): string {
  if (method.grant !== "authorization_code" || !method.authorize_url) throw oauthDeclarationErrors.template_invalid("这个方法不走浏览器授权");
  const url = new URL(oauthEndpoint(method.authorize_url, settings));
  for (const [key, value] of Object.entries(method.parameters ?? {})) url.searchParams.set(key, value);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  const scope = oauthScope(method, settings);
  if (scope) url.searchParams.set("scope", scope);
  if (method.pkce === "S256") {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.href;
}

/** The token request: the code exchange or a refresh, the client written the way `client_auth` says, the three quirks applied. */
export function oauthTokenRequest(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings, input: {
  clientId: string; clientSecret: string; redirectUri: string;
} & ({ code: string; verifier: string } | { refreshToken: string } | { deviceCode: string })): OAuthRequestDescription {
  const body: Record<string, string> = "refreshToken" in input ? { grant_type: "refresh_token", refresh_token: input.refreshToken }
    : "deviceCode" in input ? { grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: input.deviceCode }
      : { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri };
  if ("code" in input && method.pkce === "S256") body.code_verifier = input.verifier;
  if ("refreshToken" in input && method.quirks?.refresh_redirect_uri) body.redirect_uri = input.redirectUri;
  const headers: Record<string, string> = { accept: "application/json", "user-agent": USER_AGENT };
  const auth = oauthClientAuth(method, settings);
  if (auth === "basic" && input.clientSecret) headers.authorization = `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`;
  else {
    body.client_id = input.clientId;
    if (auth !== "none" && input.clientSecret) body.client_secret = input.clientSecret;
  }
  for (const omitted of method.quirks?.omit_token_params ?? []) delete body[omitted];
  const json = method.token_format === "json";
  headers["content-type"] = json ? "application/json" : "application/x-www-form-urlencoded";
  const endpoint = "refreshToken" in input && method.refresh_url ? method.refresh_url : method.token_url;
  return { url: oauthEndpoint(endpoint, settings), method: "POST", headers, body: json ? JSON.stringify(body) : new URLSearchParams(body).toString() };
}

/** The device authorization request (RFC 8628): the client and the scopes, nothing secret. */
export function oauthDeviceRequest(method: PluginOAuthMethodDeclaration, settings: OAuthResolvedSettings, clientId: string): OAuthRequestDescription {
  if (method.grant !== "device" || !method.device_authorization_url) throw oauthDeclarationErrors.template_invalid("这个方法不走设备授权");
  const body: Record<string, string> = { client_id: clientId };
  const scope = oauthScope(method, settings);
  if (scope) body.scope = scope;
  return { url: oauthEndpoint(method.device_authorization_url, settings), method: "POST",
    headers: { accept: "application/json", "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() };
}

/** When the access token runs out: `expires_in`, or the token's own `exp` for `quirks.expiry: "jwt_exp"`; `null` when neither says. */
export function oauthExpiry(method: PluginOAuthMethodDeclaration, token: Json, now: number): number | null {
  const seconds = Number(token.expires_in);
  if (Number.isFinite(seconds) && seconds > 0) return now + seconds * 1000;
  if (method.quirks?.expiry !== "jwt_exp" || typeof token.access_token !== "string") return null;
  const payload = token.access_token.split(".")[1] ?? "";
  try {
    const exp = Number((JSON.parse(Buffer.from(payload, "base64url").toString()) as Json).exp);
    return exp > 0 ? exp * 1000 : null;
  } catch { return null; }
}

/**
 * The values a connection keeps from a response. `check: "tenant"` bounds an origin by the platform's table (it is then the connection's
 * pinned tenant), `{ pattern }` the whole value; a `required` value that is missing fails the authorization.
 */
export function oauthKept(serviceId: string, keeps: readonly OAuthKeepDeclaration[] | undefined, response: unknown): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const keep of keeps ?? []) {
    const value = textAt(response, keep.pointer);
    if (!value) {
      if (keep.required) throw oauthDeclarationErrors.account_missing(`服务没有返回 ${keep.key}，请检查应用权限`);
      continue;
    }
    if (keep.check === "tenant") kept[keep.key] = oauthTenantOrigin(serviceId, value);
    else if (keep.check && !new RegExp(`^(?:${keep.check.pattern})$`, "u").test(value)) throw oauthDeclarationErrors.account_missing(`服务返回的 ${keep.key} 格式不对`);
    else kept[keep.key] = value;
  }
  return kept;
}

/** What a request with the access token may fill in: the connection's context so far (kept values included) and the settings. */
export interface OAuthRequestScope {
  readonly serviceId: string;
  readonly method: PluginOAuthMethodDeclaration;
  readonly accessToken: string;
  readonly clientId: string;
  readonly context: Readonly<Record<string, string>>;
  readonly settings: OAuthResolvedSettings;
}

/**
 * The tenant origin a request with the access token goes to, worked out here and never by the caller: the value kept by the method's one
 * `check: "tenant"` keep (in `keep` or `identity.keep`), checked against the platform's table again, else the tenant setting.
 */
export function oauthPinnedTenant(scope: Pick<OAuthRequestScope, "serviceId" | "method" | "context" | "settings">): string | undefined {
  const keep = [...scope.method.keep ?? [], ...scope.method.identity.keep ?? []].find(entry => entry.check === "tenant");
  const kept = keep ? (scope.context[keep.key] ?? "").trim() : "";
  return kept ? oauthTenantOrigin(scope.serviceId, kept) : scope.settings.tenant;
}

/**
 * An identity or context request: sent only to an origin of the platform's request table for the service, the pinned tenant origin, or
 * the service's gateway; the credential written the way the table says for an OAuth connection. `{account}` is not read yet (slice 4).
 */
export function oauthAccountRequest(request: OAuthTokenRequestDeclaration, scope: OAuthRequestScope): OAuthRequestDescription {
  const entry = service(scope.serviceId);
  const parts = oauthUrlTemplate(request.url);
  if (!parts) throw oauthDeclarationErrors.template_invalid("请求地址必须是 https 来源或 {service}、{tenant}、{gateway} 开头，再接路径");
  const tenant = "head" in parts && parts.head === "tenant" && entry?.tenant ? oauthPinnedTenant(scope) : undefined;
  let allowed: readonly string[];
  if ("origin" in parts) allowed = entry?.origins ?? [];
  else if (parts.head === "service" && entry?.origins.length === 1) allowed = entry.origins;
  else if (parts.head === "tenant" && tenant) allowed = [tenant];
  else if (parts.head === "gateway" && entry?.tenant?.gateway === "atlassian") allowed = [ATLASSIAN_GATEWAY];
  else throw oauthDeclarationErrors.template_invalid(`请求地址的 {${parts.head}} 在这个服务上不可用`);
  const address = `${"origin" in parts ? parts.origin : allowed[0]}${fillPath(parts.path, name => {
    if (name.startsWith("context.")) return scope.context[name.slice("context.".length)];
    if (name.startsWith("setting.")) return scope.settings.values[name.slice("setting.".length)];
    throw oauthDeclarationErrors.template_invalid(`请求地址里有未知的占位 {${name}}`);
  })}`;
  const url = checkedUrl(address);
  if (!allowed.includes(url.origin)) throw oauthDeclarationErrors.target_refused(`请求地址的来源 ${url.origin} 不在平台为这个服务定的来源里`);
  for (const [key, template] of Object.entries(request.query ?? {})) {
    const value = fillValue(template, scope);
    if (value) url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = {};
  for (const [name, template] of Object.entries(request.headers ?? {})) {
    if (!oauthDeclarableHeader(name)) throw oauthDeclarationErrors.template_invalid(`声明不能写请求头 ${name}`);
    const value = fillValue(template, scope);
    if (value) headers[name.toLowerCase()] = value;
  }
  Object.assign(headers, { accept: "application/json", "user-agent": USER_AGENT }, oauthCredentialHeader(entry, scope.accessToken));
  const method = request.method ?? "GET";
  if (method === "GET" || request.body === undefined) return { url: url.href, method, headers };
  return { url: url.href, method, headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(request.body) };
}

/** An OAuth connection's token on a request: the table's `credential.oauth`, `bearer` for a service the table does not have. */
function oauthCredentialHeader(entry: ConnectorRequestService | undefined, token: string): Record<string, string> {
  switch (entry?.credential.oauth ?? "bearer") {
    case "bearer": return { authorization: `Bearer ${token}` };
    case "bot": return { authorization: `Bot ${token}` };
    case "bare": return { authorization: token.replace(/^Bearer\s+/iu, "") };
    case "private-token": return { "private-token": token };
    case "x-figma-token": return { "x-figma-token": token };
    case "basic": throw oauthDeclarationErrors.template_invalid("OAuth 连接不能用 basic 写令牌");
  }
}

/**
 * The account read from the identity response (and the token response and context): `account_id` segment by segment, the label with its
 * prefix (not added twice), and what `identity.keep` keeps. For a list response, the entry with the smallest `list.min_by`.
 */
export function oauthAccount(serviceId: string, identity: OAuthIdentityDeclaration, responses: {
  identity?: unknown; token: unknown; context: Readonly<Record<string, string>>;
}): { account_id: string; label: string; kept: Record<string, string> } {
  const entry = identity.list ? listEntry(identity.list.min_by, responses.identity) : responses.identity;
  const read = (source: OAuthValueSource) => sourceValue(source, entry, responses.token, responses.context);
  const segments = identity.account_id.map(segment => segment.map(read).find(Boolean) ?? "");
  segments.forEach((value, index) => {
    const prefix = index === 0 && segments.length > 1;
    if (!value && !prefix && identity.account_id[index]!.length > 0) throw oauthDeclarationErrors.account_missing("服务未返回稳定账号身份，请检查应用权限后重新授权");
  });
  const label = identity.label.map(read).find(Boolean);
  if (!label) throw oauthDeclarationErrors.account_missing("无法读取账号身份");
  const prefix = identity.label_prefix ?? "";
  return { account_id: segments.join(":"), label: label.startsWith(prefix) ? label : `${prefix}${label}`, kept: oauthKept(serviceId, identity.keep, entry) };
}

/**
 * The value a context request contributes: the ids of a list in code-point order, or the id of the entry matching the tenant setting's
 * origin. An empty list fails the authorization (W5-11 §2.1.1): the account has nothing yet to authorize, and the message says what to do.
 */
export function oauthContextValue(pick: OAuthContextDeclaration["pick"], response: unknown, settings: OAuthResolvedSettings): string {
  if (pick.kind === "ids") {
    const ids = valuesAt(response, oauthPointerTokens(pick.pointer));
    if (ids === null) throw oauthDeclarationErrors.context_missing("服务未返回已授权工作区");
    if (ids.length === 0) throw oauthDeclarationErrors.context_missing("这个账号在服务里还没有可授权的工作区或组织，先建一个或加入一个，再重新连接");
    return ids.sort(oauthCodePointOrder).join(",");
  }
  const origin = settings.tenant;
  if (!origin) throw oauthDeclarationErrors.setting_invalid("没有填写站点地址");
  const rows = Array.isArray(response) ? response : [];
  const match = rows.find(row => textAt(row, pick.match).replace(/\/$/u, "") === origin);
  const value = match === undefined ? "" : textAt(match, pick.take);
  if (!value || !new RegExp(`^(?:${pick.pattern})$`, "u").test(value)) throw oauthDeclarationErrors.context_missing("所填站点未在本次授权范围内");
  return value;
}

/**
 * Who the connection's tokens belong to (W5-11 §2.6): a hash of the token and refresh endpoints as written (a `{tenant}` endpoint keeps
 * its template; the tenant origin is pinned apart), the client auth and the token format.
 */
export function oauthEndpointFingerprint(method: PluginOAuthMethodDeclaration): string {
  const canonical = JSON.stringify([method.token_url, method.refresh_url ?? null, method.client_auth ?? "post", method.token_format ?? "form"]);
  return createHash("sha256").update(canonical).digest("hex");
}

function listEntry(minBy: string, response: unknown): unknown {
  const rows = Array.isArray(response) ? response : [];
  return rows.slice().sort((a, b) => oauthCodePointOrder(textAt(a, minBy), textAt(b, minBy)))[0];
}

function sourceValue(source: OAuthValueSource, identity: unknown, token: unknown, context: Readonly<Record<string, string>>): string {
  if (source.startsWith("identity:")) return textAt(identity, source.slice("identity:".length));
  if (source.startsWith("token:")) return textAt(token, source.slice("token:".length));
  if (source.startsWith("context:")) return (context[source.slice("context:".length)] ?? "").trim();
  return source.slice("literal:".length);
}

/** The value at a JSON Pointer as text: a trimmed string or a finite number; anything else is empty. */
function textAt(value: unknown, pointer: string): string {
  let current = value;
  for (const token of oauthPointerTokens(pointer)) {
    if (Array.isArray(current) && /^\d+$/u.test(token)) current = current[Number(token)];
    else if (current && typeof current === "object" && !Array.isArray(current) && Object.hasOwn(current, token)) current = (current as Json)[token];
    else return "";
  }
  if (typeof current === "string") return current.trim();
  return typeof current === "number" && Number.isFinite(current) ? String(current) : "";
}

/** Every text value along a pointer where `*` steps over each entry of a list; `null` when a `*` meets something that is not a list. */
function valuesAt(value: unknown, path: readonly string[]): string[] | null {
  if (path.length === 0) {
    const one = textAt(value, "");
    return one ? [one] : [];
  }
  const [head, ...rest] = path as [string, ...string[]];
  if (head === "*") {
    if (!Array.isArray(value)) return null;
    const all: string[] = [];
    for (const item of value) all.push(...(valuesAt(item, rest) ?? []));
    return all;
  }
  const next = value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, head) ? (value as Json)[head] : undefined;
  return next === undefined ? null : valuesAt(next, rest);
}

/** A path with each placeholder filled in as one encoded segment, the value `fill` gives for it. */
function fillPath(path: string, fill: (name: string) => string | undefined): string {
  if (!oauthPathPlaceholders(path)) throw oauthDeclarationErrors.template_invalid("地址的每个占位要占满一个路径段，不带查询或片段");
  return oauthFillPlaceholders(path, name => {
    const value = fill(name);
    if (!value || !oauthPathSegment(value)) throw oauthDeclarationErrors.template_invalid("地址的路径段为空，或带 /、..、反斜杠、编码过的斜杠");
    return encodeURIComponent(value);
  });
}

/** A header or query value: a constant, `{client_id}` or `{context.<key>}`. */
function fillValue(template: string, scope: OAuthRequestScope): string {
  const value = oauthValueTemplate(template);
  if (!value) throw oauthDeclarationErrors.template_invalid(`请求头或查询参数里有未知的占位 ${template}`);
  if (value.kind === "client_id") return scope.clientId;
  return value.kind === "context" ? scope.context[value.key] ?? "" : value.value;
}

/** A filled-in address checked again (S-09, S-10): `https://`, a public name, no credentials, port or fragment. */
function checkedUrl(address: string): URL {
  let url: URL | undefined;
  try { url = new URL(address); } catch { url = undefined; }
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port || url.hash || !oauthPublicHostName(url.hostname)) {
    throw oauthDeclarationErrors.target_refused("展开后的地址不是可以发往的 https 地址");
  }
  return url;
}
