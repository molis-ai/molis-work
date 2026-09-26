import type { ConnectorCredentialStatus } from "@molis-ai/molis-work-plugin-feed";
import { createFileSecretStore, peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";
import { feishuCliMarker, feishuCliStatus } from "./feishu-cli.js";
import { clearNotionOAuth } from "./notion-oauth.js";

export const GITHUB_AUTH_REF = "connector:github:token";
export const GMAIL_AUTH_REF = "connector:gmail:token";
export const GITHUB_CLIENT_ID_REF = "connector:github:client_id";
export const FEISHU_MODE_REF = "connector:feishu:auth_mode";

const CONNECTOR_ID = /^[a-z][a-z0-9-]*$/u;

export type ConnectorCredentialKind = string;

export function authRefFor(connectorId: string): string {
  if (!CONNECTOR_ID.test(connectorId)) throw new Error("connector id invalid");
  return `connector:${connectorId}:token`;
}

export function resolveConnectorToken(connectorId: string): string | null {
  if (connectorId === "feishu" && peekSealedEntry(FEISHU_MODE_REF) && createFileSecretStore().get(FEISHU_MODE_REF) === "cli") {
    return feishuCliStatus().authorized ? feishuCliMarker() : null;
  }
  const stored = createFileSecretStore().get(authRefFor(connectorId))?.trim();
  if (stored) return stored;
  if (connectorId === "github") return readProductEnv("GITHUB_TOKEN") || null;
  if (connectorId === "gmail") return readProductEnv("GMAIL_ACCESS_TOKEN") || null;
  return readProductEnv(`${connectorId.replaceAll("-", "_").toUpperCase()}_TOKEN`) || null;
}

export function resolveGithubToken(): string | null {
  return resolveConnectorToken("github");
}

export function resolveGmailToken(): string | null {
  return resolveConnectorToken("gmail");
}

export function bindConnectorToken(
  connectorId: string,
  token: string,
): { authRef: string } {
  const value = token.trim();
  if (value.length < 8) throw new Error("token too short");
  const authRef = authRefFor(connectorId);
  const store = createFileSecretStore();
  store.put(authRef, value);
  if (connectorId === "feishu") store.delete(FEISHU_MODE_REF);
  if (connectorId === "notion") clearNotionOAuth();
  return { authRef };
}

/** Manual Gmail token selection must not leave an old OAuth refresh token active. */
export function clearGmailOAuthForManualToken(): void {
  const store = createFileSecretStore();
  try {
    const pending: unknown = JSON.parse(store.get("connector:gmail:oauth:pending:index") || "[]");
    if (Array.isArray(pending)) for (const entry of pending) {
      const state = entry && typeof entry === "object" && "state" in entry ? entry.state : null;
      if (typeof state === "string" && /^[A-Za-z0-9_-]{20,100}$/u.test(state)) {
        store.delete(`connector:gmail:oauth:pending:${state}`);
      }
    }
  } catch { /* A malformed stale index should not block the manual connection. */ }
  store.delete("connector:gmail:refresh");
  store.delete("connector:gmail:token_expires_at");
  store.delete("connector:gmail:oauth:pending");
  store.delete("connector:gmail:oauth:pending:index");
}

export function bindFeishuCli(): void {
  if (!feishuCliStatus({ fresh: true }).authorized) throw new Error("请先完成飞书 CLI 用户授权");
  const store = createFileSecretStore();
  store.put(FEISHU_MODE_REF, "cli");
  store.delete(authRefFor("feishu"));
}

export function unbindConnectorToken(connectorId: string): void {
  const store = createFileSecretStore();
  store.delete(authRefFor(connectorId));
  if (connectorId === "feishu") store.delete(FEISHU_MODE_REF);
  if (connectorId === "notion") clearNotionOAuth();
  if (connectorId === "gmail") {
    store.delete("connector:gmail:refresh");
    store.delete("connector:gmail:token_expires_at");
    store.delete("connector:gmail:oauth:pending");
  }
}

export function connectorCredentialStatus(connectorId: string): ConnectorCredentialStatus {
  if (connectorId === "feishu") {
    try {
      if (peekSealedEntry(FEISHU_MODE_REF) && createFileSecretStore().get(FEISHU_MODE_REF) === "cli") {
        const status = feishuCliStatus();
        return status.authorized
          ? { bound: true, source: "secret_store", authRef: FEISHU_MODE_REF, hint: status.account || "飞书 CLI" }
          : { bound: false, source: "none", authRef: FEISHU_MODE_REF, problem: "credential_unreadable" };
      }
    } catch { return { bound: false, source: "none", authRef: FEISHU_MODE_REF, problem: "credential_store_unavailable" }; }
  }
  const authRef = authRefFor(connectorId);
  let sealed = false;
  let stored: string | null = null;
  try {
    sealed = Boolean(peekSealedEntry(authRef));
    stored = sealed ? createFileSecretStore().get(authRef)?.trim() || null : null;
  } catch {
    return { bound: false, source: "none", authRef, problem: "credential_store_unavailable" };
  }
  if (stored) return { bound: true, source: "secret_store", authRef, hint: `…${stored.slice(-4)}` };
  if (sealed) return { bound: false, source: "none", authRef, problem: "credential_unreadable" };
  const fromEnvironment = connectorId === "github"
    ? readProductEnv("GITHUB_TOKEN")
    : connectorId === "gmail"
      ? readProductEnv("GMAIL_ACCESS_TOKEN")
      : readProductEnv(`${connectorId.replaceAll("-", "_").toUpperCase()}_TOKEN`);
  return fromEnvironment
    ? { bound: true, source: "env", authRef, hint: `…${fromEnvironment.slice(-4)}` }
    : { bound: false, source: "none", authRef };
}
