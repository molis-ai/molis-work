import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";

/** Explicit control for a standalone provider/credential fixture; Runtime authorization is exercised by the real-platform cases. */
export function connectorControl(input: { signal?: AbortSignal; current?: () => void; beforeEffect?: () => void | Promise<void> } = {}): ConnectorCallControl {
  const signal = input.signal ?? AbortSignal.any([]);
  const current = () => { signal.throwIfAborted(); input.current?.(); signal.throwIfAborted(); };
  return { signal, current, beforeEffect: async () => { current(); await input.beforeEffect?.(); current(); } };
}
