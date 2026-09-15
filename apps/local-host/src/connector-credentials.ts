import type { FeedConnectorKind, ConnectorCredentialStatus } from "@molis-ai/molis-work-plugin-feed";
import { createFileSecretStore, peekSealedEntry, readProductEnv } from "@molis-ai/molis-work-storage";

export const GITHUB_AUTH_REF = "connector:github:token";
export const GMAIL_AUTH_REF = "connector:gmail:token";
export const GITHUB_CLIENT_ID_REF = "connector:github:client_id";

export type ConnectorCredentialKind = FeedConnectorKind;

export function authRefFor(kind: ConnectorCredentialKind): string {
  return kind === "github" ? GITHUB_AUTH_REF : GMAIL_AUTH_REF;
}

export function resolveGithubToken(): string | null {
  const stored = createFileSecretStore().get(GITHUB_AUTH_REF)?.trim();
  return stored || readProductEnv("GITHUB_TOKEN") || null;
}

export function resolveGmailToken(): string | null {
  const stored = createFileSecretStore().get(GMAIL_AUTH_REF)?.trim();
  return stored || readProductEnv("GMAIL_ACCESS_TOKEN") || null;
}

export function bindConnectorToken(
  kind: ConnectorCredentialKind,
  token: string,
): { authRef: string } {
  const value = token.trim();
  if (value.length < 8) throw new Error("token too short");
  const authRef = authRefFor(kind);
  createFileSecretStore().put(authRef, value);
  return { authRef };
}

export function unbindConnectorToken(kind: ConnectorCredentialKind): void {
  const store = createFileSecretStore();
  store.delete(authRefFor(kind));
  if (kind === "gmail") {
    store.delete("connector:gmail:refresh");
    store.delete("connector:gmail:token_expires_at");
    store.delete("connector:gmail:oauth:pending");
  }
}

export function connectorCredentialStatus(kind: ConnectorCredentialKind): ConnectorCredentialStatus {
  const authRef = authRefFor(kind);
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
  const fromEnvironment = kind === "github"
    ? readProductEnv("GITHUB_TOKEN")
    : readProductEnv("GMAIL_ACCESS_TOKEN");
  return fromEnvironment
    ? { bound: true, source: "env", authRef, hint: `…${fromEnvironment.slice(-4)}` }
    : { bound: false, source: "none", authRef };
}
