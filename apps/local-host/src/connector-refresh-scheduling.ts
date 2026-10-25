import { resolve } from "node:path";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";

interface RefreshedAccess { token: string }
interface RefreshState {
  revision: string;
  pending?: Promise<RefreshedAccess | null>;
  settledAt?: number;
}
// Only 401-driven maintenance: no completed credentials are cached. Ordinary expiry checks remain with each provider.
const refreshes = new Map<string, RefreshState>();
const COOLDOWN_MS = 60_000;

/** Share maintenance without borrowing a consumer's cancellation; reconnecting never consumes an older revision's result. */
export async function refreshConnectionAfter401(home: string, connection: Pick<ConnectorConnectionRecord, "connection_id" | "updated_at">,
  beforeStart: () => Promise<void>, run: () => Promise<RefreshedAccess | null>, signal: AbortSignal): Promise<RefreshedAccess | null> {
  // Recheck after every wait, including when a reconnected account was waiting for its earlier refresh to finish.
  await beforeStart();
  // The callback's completion is another async boundary: cancellation must win before any shared state is joined or created.
  signal.throwIfAborted();
  const key = JSON.stringify([resolve(home), connection.connection_id]);
  const current = refreshes.get(key);
  if (current?.pending) {
    if (current.revision === connection.updated_at) return current.pending;
    // The previous revision's caller owns its error. A new revision must finish its predecessor, then check its own authority again.
    await current.pending.catch(() => undefined);
    return refreshConnectionAfter401(home, connection, beforeStart, run, signal);
  }
  if (current?.revision === connection.updated_at && current.settledAt !== undefined && Date.now() - current.settledAt < COOLDOWN_MS) return null;
  const state: RefreshState = { revision: connection.updated_at };
  state.pending = (async () => {
    try {
      const access = await run();
      // No refresh material: this was not a refresh attempt, so leave no cooldown.
      if (access === null) refreshes.delete(key);
      return access;
    } finally {
      state.pending = undefined;
      state.settledAt = Date.now();
    }
  })();
  refreshes.set(key, state);
  return state.pending;
}
