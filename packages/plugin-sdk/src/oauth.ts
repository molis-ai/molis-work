import { isLoopbackHostname } from "@molis-ai/molis-work-contracts/platform/loopback";
import {
  OAUTH_PLATFORM_HEADERS,
  type PluginAuthMethodDeclaration,
  type PluginOAuthMethodDeclaration,
} from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

// The rules an `oauth` declaration's templates and values are read by (W5-11 §2.1), one copy for both readers: the SDK's shape check
// and the Host's interpreter take them from here, so neither accepts what the other refuses.

const BRACES = /\{([^{}]*)\}/gu;
const KEY = /^[a-z][a-z0-9_]{0,63}$/u;
const HEADER_NAME = /^[A-Za-z][A-Za-z0-9-]{0,63}$/u;
const WHOLE = /^\{([^{}]*)\}$/u;
const URL_HEAD = /^\{([^{}]*)\}(\/.*)$/su;
const HEADS: readonly OAuthUrlHead[] = ["service", "tenant", "gateway"];
const URL_ORIGIN = /^(https:\/\/[^/{}?#]+)(\/.*)$/su;
const IP_LITERAL = /^(?:\d+\.){3}\d+$|^\[/u;
const LOCAL_SUFFIX = /\.(?:localhost|local|internal|home\.arpa)$/u;
const HOST_NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PLATFORM_HEADERS: ReadonlySet<string> = new Set(OAUTH_PLATFORM_HEADERS);

/** An `oauth` method that carries its flow as data; the bare `{ kind: "oauth" }` is still read from the platform's table until slice 4. */
export function isDeclaredOAuth(method: PluginAuthMethodDeclaration): method is PluginOAuthMethodDeclaration {
  return method.kind === "oauth" && "grant" in method;
}

/** A key a declaration names: a setting, a context value, a kept value. */
export function oauthKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

/** A placeholder that stands for an address's origin. */
export type OAuthUrlHead = "service" | "tenant" | "gateway";

/** The one placeholder grammar every template is read by: `{client_id}`, an address head, `{context.<key>}`, `{setting.<key>}`. */
export type OAuthPlaceholder =
  | { readonly kind: "client_id" }
  | { readonly kind: "head"; readonly head: OAuthUrlHead }
  | { readonly kind: "context" | "setting"; readonly key: string };

/** What the text between a pair of braces names; `undefined` when it is not a placeholder. `{account}` joins the heads in slice 4. */
export function oauthPlaceholder(name: string): OAuthPlaceholder | undefined {
  if (name === "client_id") return { kind: "client_id" };
  if ((HEADS as readonly string[]).includes(name)) return { kind: "head", head: name as OAuthUrlHead };
  const dot = name.indexOf(".");
  const kind = name.slice(0, dot);
  const key = name.slice(dot + 1);
  return dot > 0 && (kind === "context" || kind === "setting") && KEY.test(key) ? { kind, key } : undefined;
}

/** The text inside every innermost `{…}` of a template, in order; each is read by `oauthPlaceholder`. */
export function oauthPlaceholders(template: string): string[] {
  return [...template.matchAll(BRACES)].map(match => match[1]!);
}

/** A template with each `{…}` replaced by what `fill` gives for its text. */
export function oauthFillPlaceholders(template: string, fill: (name: string) => string): string {
  return template.replace(BRACES, (_, name: string) => fill(name));
}

/**
 * Whether a text taken as written (`body`, `label_prefix`) holds a pair of braces the grammar would read as a placeholder once its
 * spaces and case are set aside, as `{ Context.x }`; GraphQL's `{ viewer { id } }` holds none.
 */
export function oauthLooksLikePlaceholder(text: string): boolean {
  return oauthPlaceholders(text).some(name => oauthPlaceholder(name.trim().toLowerCase()) !== undefined);
}

/**
 * An address template split where its origin ends: a `{…}` head (`head` is what the grammar reads it as, `undefined` when it is not an
 * address head; `name` is its text) or a written `https://` origin, then a path starting with `/`. `undefined` for anything else, such
 * as a placeholder in the host name.
 */
export function oauthUrlTemplate(template: string): { readonly head: OAuthUrlHead | undefined; readonly name: string; readonly path: string }
  | { readonly origin: string; readonly path: string } | undefined {
  const head = URL_HEAD.exec(template);
  if (head) {
    const placeholder = oauthPlaceholder(head[1]!);
    return { head: placeholder?.kind === "head" ? placeholder.head : undefined, name: head[1]!, path: head[2]! };
  }
  const origin = URL_ORIGIN.exec(template);
  return origin ? { origin: origin[1]!, path: origin[2]! } : undefined;
}

/**
 * The placeholders of a path when each fills a whole segment, with the grammar's reading of each (`undefined` for a name it does not
 * know); `undefined` for an unpaired brace, a shared segment, a query or fragment.
 */
export function oauthPathPlaceholders(path: string): { readonly name: string; readonly placeholder: OAuthPlaceholder | undefined }[] | undefined {
  if (/[?#]/u.test(path)) return undefined;
  const found: { name: string; placeholder: OAuthPlaceholder | undefined }[] = [];
  for (const segment of path.split("/")) {
    const inner = oauthPlaceholders(segment);
    if (/[{}]/u.test(segment.replace(BRACES, "")) || (inner.length > 0 && segment !== `{${inner[0]}}`)) return undefined;
    for (const name of inner) found.push({ name, placeholder: oauthPlaceholder(name) });
  }
  return found;
}

/** A value that may fill one path segment: no `/`, `\`, `..`, nor an encoded slash, backslash or dot. */
export function oauthPathSegment(value: string): boolean {
  return value !== "" && value !== "." && !value.includes("/") && !value.includes("\\") && !value.includes("..") && !/%2f|%5c|%2e/iu.test(value);
}

/** A header or query value: a constant, or exactly `{client_id}` or `{context.<key>}`; `null` for anything else with a brace in it. */
export function oauthValueTemplate(value: string): { readonly kind: "literal"; readonly value: string } | { readonly kind: "client_id" } | { readonly kind: "context"; readonly key: string } | null {
  if (!/[{}]/u.test(value)) return { kind: "literal", value };
  const whole = WHOLE.exec(value);
  const placeholder = whole ? oauthPlaceholder(whole[1]!) : undefined;
  if (placeholder?.kind === "client_id") return placeholder;
  return placeholder?.kind === "context" ? { kind: "context", key: placeholder.key } : null;
}

/** Whether a declaration may write this request header: not one the platform writes, nor one that would carry a credential. */
export function oauthDeclarableHeader(name: string): boolean {
  return HEADER_NAME.test(name) && !PLATFORM_HEADERS.has(name.toLowerCase());
}

/** A host name an address may go to: a public name, not an IP literal, loopback or a local suffix. */
export function oauthPublicHostName(host: string): boolean {
  return !IP_LITERAL.test(host) && !isLoopbackHostname(host) && HOST_NAME.test(host) && !LOCAL_SUFFIX.test(host);
}

/**
 * A tenant's origin under `domain` (the platform request table's `tenant.domain`; the rule `salesforceOrigin` had): `https://`, no
 * credentials, port, path, query or fragment, a public name equal to or under the domain. `undefined` when the value is not one.
 */
export function oauthTenantOriginUnder(domain: string, raw: string): string | undefined {
  let url: URL | undefined;
  try { url = new URL(raw.trim()); } catch { url = undefined; }
  const host = url?.hostname ?? "";
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash
    || /[?#]/u.test(raw) || !oauthPublicHostName(host) || (host !== domain && !host.endsWith(`.${domain}`))) return undefined;
  return url.origin;
}

/** What is wrong with a setting's value, filled in or its `default`: outside `enum`, off `pattern`, unsafe in a path, not a tenant origin. */
export type OAuthSettingValueFault = "enum" | "pattern" | "path" | "tenant";

/** The setting rules a value must meet; `tenantDomain` is the platform request table's, for `use: "tenant"`. */
export function oauthSettingValueFault(setting: { readonly use: string; readonly pattern?: string; readonly enum?: readonly string[] }, value: string,
  tenantDomain: string | undefined): OAuthSettingValueFault | undefined {
  const words = setting.use === "scope" ? value.split(/\s+/u) : [value];
  if (setting.enum && !words.every(word => setting.enum!.includes(word))) return "enum";
  if (setting.pattern !== undefined && !words.every(word => new RegExp(`^(?:${setting.pattern})$`, "u").test(word))) return "pattern";
  if (setting.use === "path" && !oauthPathSegment(value)) return "path";
  if (setting.use === "tenant" && (!tenantDomain || !oauthTenantOriginUnder(tenantDomain, value))) return "tenant";
  return undefined;
}

/** A JSON Pointer's reference tokens, `~1` and `~0` restored. */
export function oauthPointerTokens(pointer: string): string[] {
  return pointer.split("/").slice(1).map(part => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** Order by Unicode code point, the same on every machine (not the locale's collation). */
export function oauthCodePointOrder(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const step = left[index]!.codePointAt(0)! - right[index]!.codePointAt(0)!;
    if (step !== 0) return step;
  }
  return left.length - right.length;
}
