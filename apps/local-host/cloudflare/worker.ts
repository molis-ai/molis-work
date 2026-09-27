import { API_OAUTH_PROVIDERS, apiOAuthProvider } from "../src/connector-api-oauth-providers.js";

export interface BrokerEnv {
  PUBLIC_ORIGIN: string;
  /** Worker Secret: base64url-encoded 32 random bytes. */
  ENVELOPE_KEY: string;
  /** Worker Secret: JSON object keyed by service id. Never returned to clients. */
  OAUTH_APPS?: string;
  /** Independently managed Worker Secrets; each replaces one complete app entry. */
  [secret: `OAUTH_APP_${string}`]: string | undefined;
  AUTH_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
interface App { clientId: string; clientSecret?: string; settings?: Record<string, string> }
type Payload = Record<string, unknown> & { kind: string; service: string; clientId: string; exp: number };
const encoder = new TextEncoder();
const CALLBACK = "/api/settings/connectors/methods/oauth/callback";
const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
function bytes(value: string): Uint8Array<ArrayBuffer> { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), c => c.charCodeAt(0)); }
function base64(value: Uint8Array): string { return btoa(String.fromCharCode(...value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""); }
async function digest(value: string) { return base64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))); }
async function key(env: BrokerEnv) {
  const raw = bytes(env.ENVELOPE_KEY);
  if (raw.length !== 32) throw new Error("configuration");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(env: BrokerEnv, payload: Payload): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(env), encoder.encode(JSON.stringify(payload)));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}
async function unseal(env: BrokerEnv, raw: string, kind: string, now: number): Promise<Payload> {
  if (raw.length > 32_000) throw new Error("invalid_ticket");
  const parts = raw.split(".");
  if (parts.length !== 2) throw new Error("invalid_ticket");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(parts[0]!) }, await key(env), bytes(parts[1]!));
  const payload = object(JSON.parse(new TextDecoder().decode(decrypted))) as Payload;
  if (payload.kind !== kind || !Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("invalid_ticket");
  return payload;
}
function localReturn(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !url.port || Number(url.port) < 1024 || url.pathname !== CALLBACK || url.username || url.password || url.search || url.hash) throw new Error("invalid_return");
  return url;
}
function origin(env: BrokerEnv): string {
  const url = new URL(env.PUBLIC_ORIGIN);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("configuration");
  return url.origin;
}
function application(env: BrokerEnv, service: string): App {
  if (!Object.hasOwn(API_OAUTH_PROVIDERS, service)) throw new Error("unsupported_service");
  const secretName = `OAUTH_APP_${service.replaceAll("-", "_").toUpperCase()}` as const;
  const raw = env[secretName] !== undefined
    ? JSON.parse(env[secretName]!)
    : object(JSON.parse(env.OAUTH_APPS || "{}"))[service];
  const app = object(raw) as unknown as App;
  const provider = apiOAuthProvider(service, app.settings);
  if (!app.clientId || (!provider.optionalSecret && !app.clientSecret) ||
    (provider.fields ?? []).some(field => field.required && !app.settings?.[field.key])) throw new Error("not_configured");
  return app;
}
async function requestBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_request");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 40_000) { await reader.cancel(); throw new Error("too_large"); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const combined = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { combined.set(chunk, at); at += chunk.length; }
  return object(JSON.parse(new TextDecoder().decode(combined)));
}

/** Dependency injection is for deterministic protocol tests; production uses fetch and wall clock. */
export function createOAuthBroker(fetchImpl: typeof fetch = fetch, clock: () => number = Date.now) {
  return { async fetch(request: Request, env: BrokerEnv): Promise<Response> {
    try {
      const url = new URL(request.url); const now = clock(); const base = origin(env);
      if (url.origin !== base) return json({ error: "invalid_origin" }, 400);
      if (request.method === "GET" && url.pathname === "/health") return json({ service: "Molis OAuth", status: "ok" });
      if (request.method === "GET" && url.pathname === "/providers") {
        const services = Object.keys(API_OAUTH_PROVIDERS).filter(service => { try { application(env, service); return true; } catch { return false; } });
        return json({ services });
      }
      if (["/start", "/token"].includes(url.pathname)) {
        if (!env.AUTH_RATE_LIMITER) return json({ error: "not_configured" }, 503);
        const actor = request.headers.get("cf-connecting-ip") || "local-development";
        if (!(await env.AUTH_RATE_LIMITER.limit({ key: `${url.pathname}:${await digest(actor)}` })).success) {
          return new Response(JSON.stringify({ error: "rate_limited", message: "登录请求过于频繁，请稍后重试。" }), {
            status: 429, headers: { ...headers, "content-type": "application/json", "retry-after": "60" },
          });
        }
      }
      if (request.method === "POST" && url.pathname === "/start") {
        const input = await requestBody(request); const service = text(input.service_id); const app = application(env, service);
        const local = localReturn(text(input.return_uri)); const localState = text(input.state); const challenge = text(input.code_challenge);
        if (!/^[A-Za-z0-9_-]{32,256}$/u.test(localState) || !/^[A-Za-z0-9_-]{43}$/u.test(challenge)) throw new Error("invalid_request");
        const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
        const state = await seal(env, { kind: "state", service, clientId: app.clientId, exp: now + 600_000,
          local: local.href, localState, challenge, verifier });
        const provider = apiOAuthProvider(service, app.settings); const authorize = new URL(provider.authorize);
        authorize.searchParams.set("client_id", app.clientId); authorize.searchParams.set("redirect_uri", `${base}/callback`);
        authorize.searchParams.set("response_type", "code"); authorize.searchParams.set("state", state);
        if (provider.scope) authorize.searchParams.set("scope", provider.scope);
        for (const [k, v] of Object.entries(provider.parameters ?? {})) authorize.searchParams.set(k, v);
        if (provider.pkce) { authorize.searchParams.set("code_challenge", await digest(verifier)); authorize.searchParams.set("code_challenge_method", "S256"); }
        return json({ authorization_url: authorize.href, client_id: app.clientId, settings: app.settings ?? {} });
      }
      if (request.method === "GET" && url.pathname === "/callback") {
        const state = await unseal(env, url.searchParams.get("state") || "", "state", now);
        const app = application(env, state.service); if (app.clientId !== state.clientId) throw new Error("changed_client");
        const local = localReturn(text(state.local)); local.searchParams.set("state", text(state.localState));
        const code = url.searchParams.get("code");
        if (url.searchParams.has("error") || !code) local.searchParams.set("error", "access_denied");
        else {
          if (code.length > 4096) throw new Error("invalid_code");
          local.searchParams.set("code", await seal(env, { kind: "ticket", service: state.service, clientId: state.clientId,
            exp: now + 120_000, code, verifier: state.verifier, challenge: state.challenge }));
        }
        return new Response(null, { status: 302, headers: { ...headers, location: local.href } });
      }
      if (request.method === "POST" && url.pathname === "/token") {
        const input = await requestBody(request); const service = text(input.service_id); const app = application(env, service);
        const refreshing = input.grant_type === "refresh_token";
        if (!refreshing && input.grant_type !== "authorization_code") throw new Error("invalid_grant");
        const payload = await unseal(env, text(refreshing ? input.refresh_token : input.code), refreshing ? "refresh" : "ticket", now);
        if (payload.service !== service || payload.clientId !== app.clientId) throw new Error("invalid_grant");
        if (!refreshing && (!/^[A-Za-z0-9_-]{43,128}$/u.test(text(input.code_verifier)) || await digest(text(input.code_verifier)) !== payload.challenge)) throw new Error("invalid_grant");
        const provider = apiOAuthProvider(service, app.settings);
        const body: Record<string, string> = refreshing ? { grant_type: "refresh_token", refresh_token: text(payload.refreshToken) }
          : { grant_type: "authorization_code", code: text(payload.code), redirect_uri: `${base}/callback` };
        if (provider.pkce && !refreshing) body.code_verifier = text(payload.verifier);
        if (service === "gitlab" && refreshing) body.redirect_uri = `${base}/callback`;
        const upstreamHeaders: Record<string, string> = { accept: "application/json", "content-type": provider.format === "json" ? "application/json" : "application/x-www-form-urlencoded" };
        if (provider.auth === "basic" && app.clientSecret) upstreamHeaders.authorization = `Basic ${btoa(`${app.clientId}:${app.clientSecret}`)}`;
        else { body.client_id = app.clientId; if (app.clientSecret) body.client_secret = app.clientSecret; }
        if (service === "clickup") { delete body.grant_type; delete body.redirect_uri; }
        const response = await fetchImpl(refreshing && provider.refresh ? provider.refresh : provider.token, {
          method: "POST", headers: upstreamHeaders, body: provider.format === "json" ? JSON.stringify(body) : new URLSearchParams(body).toString(),
          redirect: "error", signal: AbortSignal.timeout(25_000),
        });
        const result = object(await response.json());
        if (!response.ok || result.error || result.ok === false || (typeof result.code === "number" && result.code !== 0) || !text(result.access_token)) return json({ error: "provider_rejected", message: "授权服务拒绝请求，请重新登录。" }, 400);
        // Provider account/context fields are retained; client secrets and unknown
        // error bodies never pass through. Refresh tokens remain opaque to clients.
        const safe: Record<string, unknown> = {};
        for (const field of ["access_token", "token_type", "expires_in", "scope", "workspace_id", "team_id", "instance_url"]) if (result[field] !== undefined) safe[field] = result[field];
        // Retain only Sentry's stable identity, not profile/email or unknown fields.
        if (service === "sentry" && text(object(result.user).id)) safe.user = { id: text(object(result.user).id) };
        const refresh = text(result.refresh_token) || (refreshing ? text(payload.refreshToken) : "");
        if (refresh) safe.refresh_token = await seal(env, { kind: "refresh", service, clientId: app.clientId, exp: now + 365 * 86400_000, refreshToken: refresh });
        return json(safe);
      }
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "authorization_unavailable", message: "授权无效、已过期或服务尚未配置，请重新开始登录。" }, 400);
    }
  } };
}
export default createOAuthBroker();
