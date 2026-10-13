import { randomBytes, timingSafeEqual } from "node:crypto";
import { CatalogLiveError, NotionOAuthError, notionAuthorizationUrl, notionOAuthToken, type NotionOAuthTokens } from "@molis-ai/molis-work-integration-catalog";
import { createFileSecretStore, readProductEnv, resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { oauthConnectionRefs } from "./connector-oauth-targets.js";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";

const PREFIX = "connector:notion:";
const PENDING_REF = `${PREFIX}oauth:pending`;
const PENDING_INDEX = `${PENDING_REF}:index`;
const CLIENT_ID_REF = `${PREFIX}client_id`;
const CLIENT_SECRET_REF = `${PREFIX}client_secret`;
const CALLBACK_PATH = "/api/settings/connectors/notion/oauth/callback";
const PENDING_TTL_MS = 10 * 60_000;

type Pending = { state: string; clientId: string; clientSecret?: string; redirectUri: string; createdAt: number; connectionId: string; displayName?: string };
const refreshInFlight = new Map<string, Promise<string>>();
function pendingIndex(): Array<{ state: string; at: number }> {
  try { return JSON.parse(createFileSecretStore().get(PENDING_INDEX) || "[]"); } catch { return []; }
}
function removePending(state: string): void {
  const store = createFileSecretStore();
  store.delete(`${PENDING_REF}:${state}`);
  store.put(PENDING_INDEX, JSON.stringify(pendingIndex().filter(row => row.state !== state)));
}
type TokenRefs = { access: string; refresh: string; workspace: string };

function scopedRefs(connectionId: string): TokenRefs {
  const refs = oauthConnectionRefs(connectionId);
  return { access: refs.access, refresh: refs.refresh, workspace: `connector-connection:${connectionId}:workspace` };
}

function credentials() {
  const store = createFileSecretStore();
  return {
    clientId: store.get(CLIENT_ID_REF)?.trim() || readProductEnv("NOTION_CLIENT_ID")?.trim() || "",
    clientSecret: store.get(CLIENT_SECRET_REF)?.trim() || readProductEnv("NOTION_CLIENT_SECRET")?.trim() || "",
  };
}

function assertLoopback(url: URL): void {
  if (!isLoopbackHttpUrl(url)
    || url.pathname !== CALLBACK_PATH || url.username || url.password || url.search || url.hash) {
    throw new Error("Notion 回调必须是本机连接器地址");
  }
}

function saveTokens(tokens: NotionOAuthTokens, refs: TokenRefs): void {
  const store = createFileSecretStore();
  // The refresh token rotates. Persist it before the access token so a later retry can recover.
  store.put(refs.refresh, tokens.refreshToken);
  store.put(refs.access, tokens.accessToken);
  store.put(refs.workspace, JSON.stringify({ id: tokens.workspaceId, name: tokens.workspaceName, botId: tokens.botId }));
}

export function notionOAuthConfigured(): boolean {
  try {
    const { clientId, clientSecret } = credentials();
    return Boolean(clientId && clientSecret);
  } catch { return false; }
}

export function startNotionOAuth(input: {
  origin: string;
  clientId?: string;
  clientSecret?: string;
  /** The connection the authorized workspace is saved to. */
  connectionId: string;
  displayName?: string;
  nowMs?: number;
}): { authorizationUrl: string; redirectUri: string } {
  const store = createFileSecretStore();
  if (input.clientId?.trim()) store.put(CLIENT_ID_REF, input.clientId.trim());
  if (input.clientSecret?.trim()) store.put(CLIENT_SECRET_REF, input.clientSecret.trim());
  const { clientId, clientSecret } = credentials();
  if (!clientId || !clientSecret) throw new Error("请先配置 Notion 公共连接的 Client ID 和 Client Secret");
  const callback = new URL(CALLBACK_PATH, input.origin);
  assertLoopback(callback);
  // Notion rejects numeric IP hosts in registered redirect URIs.
  callback.hostname = "localhost";
  const redirectUri = callback.toString();
  const state = randomBytes(24).toString("base64url");
  const now = input.nowMs ?? Date.now();
  for (const entry of pendingIndex()) if (entry.at > now || now - entry.at > PENDING_TTL_MS) removePending(entry.state);
  store.put(PENDING_INDEX, JSON.stringify([...pendingIndex(), { state, at: now }]));
  const pendingValue = JSON.stringify({ state, clientId, clientSecret, redirectUri, createdAt: input.nowMs ?? Date.now(),
    connectionId: input.connectionId, ...(input.displayName ? { displayName: input.displayName } : {}) } satisfies Pending);
  store.put(`${PENDING_REF}:${state}`, pendingValue);
  return { authorizationUrl: notionAuthorizationUrl({ clientId, redirectUri, state }), redirectUri };
}

function readPending(state: string, nowMs: number): Pending {
  if (!/^[A-Za-z0-9_-]{32}$/u.test(state)) throw new Error("Notion 授权状态不匹配");
  const raw = createFileSecretStore().get(`${PENDING_REF}:${state}`);
  if (!raw) throw new Error("Notion 授权会话不存在，请重新开始授权");
  let pending: Pending;
  try { pending = JSON.parse(raw) as Pending; }
  catch { throw new Error("Notion 授权会话无效，请重新开始授权"); }
  const expected = Buffer.from(pending.state ?? "");
  const actual = Buffer.from(state);
  if (!state || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Notion 授权状态不匹配");
  if (!Number.isFinite(pending.createdAt) || nowMs < pending.createdAt || nowMs - pending.createdAt > PENDING_TTL_MS) {
    removePending(state);
    throw new Error("Notion 授权已过期，请重新开始");
  }
  assertLoopback(new URL(pending.redirectUri));
  if (typeof pending.connectionId !== "string" || !pending.connectionId) throw new Error("Notion 授权会话无效，请重新开始授权");
  if (pending.clientSecret === undefined && pending.clientId !== credentials().clientId) throw new Error("Notion 应用配置已改变，请重新开始授权");
  return pending;
}

export async function completeNotionOAuth(input: {
  code: string;
  state: string;
  callbackUrl: URL;
  nowMs?: number;
  fetchImpl?: typeof fetch;
  validateAccount?: (tokens: NotionOAuthTokens, connectionId: string) => void;
}): Promise<NotionOAuthTokens & { connectionId: string; displayName?: string }> {
  const pending = readPending(input.state, input.nowMs ?? Date.now());
  if (input.callbackUrl.origin + input.callbackUrl.pathname !== pending.redirectUri) throw new Error("Notion 回调地址不匹配");
  if (!input.code.trim()) throw new Error("Notion 未返回授权码");
  const clientSecret = pending.clientSecret ?? credentials().clientSecret;
  const store = createFileSecretStore();
  removePending(input.state);
  const tokens = await notionOAuthToken({
    clientId: pending.clientId, clientSecret,
    grant: { type: "authorization_code", code: input.code.trim(), redirectUri: pending.redirectUri },
    fetchImpl: input.fetchImpl,
  });
  input.validateAccount?.(tokens, pending.connectionId);
  const refs = scopedRefs(pending.connectionId);
  saveTokens(tokens, refs);
  store.put(`${refs.access}:client`, JSON.stringify({ clientId: pending.clientId, clientSecret }));
  return { ...tokens, connectionId: pending.connectionId, ...(pending.displayName ? { displayName: pending.displayName } : {}) };
}

/** A connection's Notion access token, refreshed once when asked or when only the refresh token is left. */
export async function resolveUsableNotionToken(connectionId: string, forceRefresh = false, fetchImpl?: typeof fetch): Promise<string | null> {
  const store = createFileSecretStore();
  const refs = scopedRefs(connectionId);
  const current = store.get(refs.access)?.trim() || null;
  if (!current && store.get(refs.refresh)) forceRefresh = true;
  if (!forceRefresh || !store.get(refs.refresh)) return current;
  const key = JSON.stringify([resolveMolisWorkHome(), refs.refresh]);
  if (!refreshInFlight.has(key)) {
    const pending = (async () => {
      const refreshToken = store.get(refs.refresh)?.trim();
      const snapshot = store.get(`${refs.access}:client`);
      const { clientId, clientSecret } = snapshot ? JSON.parse(snapshot) as ReturnType<typeof credentials> : credentials();
      if (!refreshToken || !clientId || !clientSecret) throw new Error("Notion 缺少刷新凭据，请重新授权");
      let tokens: NotionOAuthTokens;
      try {
        tokens = await notionOAuthToken({
          clientId, clientSecret, grant: { type: "refresh_token", refreshToken }, fetchImpl,
        });
      } catch (error) {
        if (error instanceof NotionOAuthError && [400, 401, 403].includes(error.status)) {
          throw new CatalogLiveError("needs_auth", error.status, "Notion 授权已失效，请重新授权");
        }
        throw error;
      }
      if (store.get(refs.refresh)?.trim() !== refreshToken) throw new Error("Notion 连接在刷新期间已改变，请重试");
      saveTokens(tokens, refs);
      return tokens.accessToken;
    })().finally(() => { refreshInFlight.delete(key); });
    refreshInFlight.set(key, pending);
  }
  return refreshInFlight.get(key)!;
}
