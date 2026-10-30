import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
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

type OAuthTarget = { connectionId: string; expectedRevision?: string };
export function prepareOAuthConnectionTarget(homeDirectory: string, service: Service, existingId?: string): OAuthTarget {
  if (!existingId) return { connectionId: randomUUID() };
  return withConnectorConnections(homeDirectory, (store) => {
    const existing = store.require(existingId, service);
    if (existing.auth_method !== "oauth") throw new Error("请选择同服务的 OAuth 连接重新授权");
    return { connectionId: existingId, expectedRevision: existing.updated_at };
  });
}

export function saveOAuthConnectionTarget(service: Service, state: string, target: OAuthTarget, displayName?: string, onboarding?: { id: string; desktop: boolean }): void {
  createFileSecretStore().put(pendingRef(service, state), JSON.stringify({ ...target, displayName, onboarding, createdAt: Date.now() }));
}

export function readOAuthConnectionTarget(service: Service, state: string, options: { allowExpired?: boolean } = {}): OAuthTarget & { displayName?: string; onboarding?: { id: string; desktop: boolean }; expired: boolean } | null {
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
    ...("expectedRevision" in parsed && typeof parsed.expectedRevision === "string" ? { expectedRevision: parsed.expectedRevision } : {}),
    ...("displayName" in parsed && typeof parsed.displayName === "string" ? { displayName: parsed.displayName } : {}) };
}

export function clearOAuthConnectionTarget(service: Service, state: string): void {
  createFileSecretStore().delete(pendingRef(service, state));
}

/** A token refresh belongs to the connection revision that sent it, even if it was disabled and enabled meanwhile. */
export function oauthRefreshGuard(home: string, connectionId: string): () => void {
  const connection = withConnectorConnections(home, store => store.require(connectionId));
  if (!connection.enabled || connection.disconnected_at) throw new Error("连接已停用或断开，请重新连接");
  return () => {
    const current = withConnectorConnections(home, store => store.require(connectionId));
    if (current.updated_at !== connection.updated_at) throw new Error("连接在刷新期间已变化，请重试");
  };
}

export function oauthConnectionRefs(connectionId: string): { access: string; refresh: string; expiresAt: string } {
  return {
    access: `connector-connection:${connectionId}:access`,
    refresh: `connector-connection:${connectionId}:refresh`,
    expiresAt: `connector-connection:${connectionId}:expires_at`,
  };
}

/** An account-level reader's current revision, combined with its existing caller control when it has one. */
export function connectorAccountControl(home: string, connectionId: string,
  caller: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void>; current?: () => void } = {}): ConnectorCallControl {
  const signal = caller.signal ?? AbortSignal.any([]), accountCurrent = oauthRefreshGuard(home, connectionId);
  const current = () => { signal.throwIfAborted(); caller.current?.(); accountCurrent(); signal.throwIfAborted(); };
  return { signal, current, beforeEffect: async () => { current(); await caller.beforeEffect?.(); current(); } };
}
