import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";

/** A token refresh belongs to the connection revision that sent it, even if it was disabled and enabled meanwhile. */
export function oauthRefreshGuard(home: string, connectionId: string): () => void {
  const connection = withConnectorConnections(home, store => store.require(connectionId));
  if (!connection.enabled || connection.disconnected_at) throw new Error("连接已停用或断开，请重新连接");
  return () => {
    const current = withConnectorConnections(home, store => store.require(connectionId));
    if (current.updated_at !== connection.updated_at) throw new Error("连接在刷新期间已变化，请重试");
  };
}

/** An account-level reader's current revision, combined with its existing caller control when it has one. */
export function connectorAccountControl(home: string, connectionId: string,
  caller: { signal?: AbortSignal; beforeEffect?: () => void | Promise<void>; current?: () => void } = {}): ConnectorCallControl {
  const signal = caller.signal ?? AbortSignal.any([]), accountCurrent = oauthRefreshGuard(home, connectionId);
  const current = () => { signal.throwIfAborted(); caller.current?.(); accountCurrent(); signal.throwIfAborted(); };
  return { signal, current, beforeEffect: async () => { current(); await caller.beforeEffect?.(); current(); } };
}
