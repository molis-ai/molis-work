import { randomUUID } from "node:crypto";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "./connector-connection-store.js";

const STATE = /^[A-Za-z0-9_-]{16,128}$/u;
const TTL_MS = 10 * 60_000;
type Service = "gmail" | "notion";

function pendingRef(service: Service, state: string): string {
  if (!STATE.test(state)) throw new Error("授权状态无效");
  return `connector:${service}:oauth:connection-target:${state}`;
}

export function prepareOAuthConnectionId(homeDirectory: string, service: Service, existingId?: string): string {
  if (!existingId) return randomUUID();
  withConnectorConnections(homeDirectory, (store) => {
    const existing = store.require(existingId, service);
    if (existing.auth_method !== "oauth") throw new Error("请选择同服务的 OAuth 连接重新授权");
  });
  return existingId;
}

export function saveOAuthConnectionTarget(service: Service, state: string, connectionId: string, displayName?: string, onboarding?: { id: string; desktop: boolean }): void {
  createFileSecretStore().put(pendingRef(service, state), JSON.stringify({ connectionId, displayName, onboarding, createdAt: Date.now() }));
}

export function readOAuthConnectionTarget(service: Service, state: string, options: { allowExpired?: boolean } = {}): { connectionId: string; displayName?: string; onboarding?: { id: string; desktop: boolean }; expired: boolean } | null {
  const raw = createFileSecretStore().get(pendingRef(service, state));
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || !("connectionId" in parsed) || !("createdAt" in parsed)
    || typeof parsed.connectionId !== "string" || typeof parsed.createdAt !== "number") {
    throw new Error("授权连接已过期，请重新开始");
  }
  const expired = Date.now() - parsed.createdAt > TTL_MS || Date.now() < parsed.createdAt;
  if (expired && !options.allowExpired) throw new Error("授权连接已过期，请重新开始");
  const onboarding = "onboarding" in parsed && parsed.onboarding && typeof parsed.onboarding === "object" && "id" in parsed.onboarding && typeof parsed.onboarding.id === "string" && /^[0-9a-f-]{36}$/u.test(parsed.onboarding.id)
    ? { id: parsed.onboarding.id, desktop: "desktop" in parsed.onboarding && parsed.onboarding.desktop === true } : undefined;
  return { connectionId: parsed.connectionId, onboarding, expired,
    ...("displayName" in parsed && typeof parsed.displayName === "string" ? { displayName: parsed.displayName } : {}) };
}

export function clearOAuthConnectionTarget(service: Service, state: string): void {
  createFileSecretStore().delete(pendingRef(service, state));
}

export function oauthConnectionRefs(connectionId: string): { access: string; refresh: string; expiresAt: string } {
  return {
    access: `connector-connection:${connectionId}:access`,
    refresh: `connector-connection:${connectionId}:refresh`,
    expiresAt: `connector-connection:${connectionId}:expires_at`,
  };
}
