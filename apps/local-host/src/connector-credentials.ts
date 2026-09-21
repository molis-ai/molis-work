import type { ConnectorCredentialStatus } from "@molis-ai/molis-work-plugin-feed";
import { createFileSecretStore, peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";

export const GITHUB_AUTH_REF = "connector:github:token";
export const GMAIL_AUTH_REF = "connector:gmail:token";
export const GITHUB_CLIENT_ID_REF = "connector:github:client_id";

const CONNECTOR_ID = /^[a-z][a-z0-9-]*$/u;

export type ConnectorCredentialKind = string;

export function authRefFor(connectorId: string): string {
  if (!CONNECTOR_ID.test(connectorId)) throw new Error("connector id invalid");
  return `connector:${connectorId}:token`;
}

export function resolveConnectorToken(connectorId: string): string | null {
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
  createFileSecretStore().put(authRef, value);
  return { authRef };
}

export function unbindConnectorToken(connectorId: string): void {
  const store = createFileSecretStore();
  store.delete(authRefFor(connectorId));
  if (connectorId === "gmail") {
    store.delete("connector:gmail:refresh");
    store.delete("connector:gmail:token_expires_at");
    store.delete("connector:gmail:oauth:pending");
  }
}

export function connectorCredentialStatus(connectorId: string): ConnectorCredentialStatus {
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
