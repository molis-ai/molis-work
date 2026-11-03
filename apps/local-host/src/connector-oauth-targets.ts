import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { randomUUID } from "node:crypto";
import { withConnectorConnections } from "./connector-connection-store.js";

type Service = "notion";

type OAuthTarget = { connectionId: string; expectedRevision?: string };
export function prepareOAuthConnectionTarget(homeDirectory: string, service: Service, existingId?: string): OAuthTarget {
  if (!existingId) return { connectionId: randomUUID() };
  return withConnectorConnections(homeDirectory, (store) => {
    const existing = store.require(existingId, service);
    if (existing.auth_method !== "oauth") throw new Error("请选择同服务的 OAuth 连接重新授权");
    return { connectionId: existingId, expectedRevision: existing.updated_at };
  });
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
