import { resolve } from "node:path";

const listeners = new Map<string, Set<(id: string) => void>>();
export function subscribeConnectorChanges(home: string, listener: (id: string) => void): () => void {
  const name = resolve(home); const rows = listeners.get(name) ?? new Set(); rows.add(listener); listeners.set(name, rows);
  return () => { rows.delete(listener); if (!rows.size) listeners.delete(name); };
}

const requests = new Map<string, Set<AbortController>>();
const key = (home: string, id: string) => JSON.stringify([resolve(home), id]);

/** Reauthorization and disconnect invalidate work already using that connection. */
export function invalidateConnectorRequests(home: string, id: string): void {
  for (const listener of listeners.get(resolve(home)) ?? []) listener(id);
  for (const controller of requests.get(key(home, id)) ?? []) controller.abort(new Error("连接已改变，请重新执行"));
}

export async function withConnectorRequest<T>(home: string, id: string, signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const connectionKey = key(home, id);
  const pending = requests.get(connectionKey) ?? new Set<AbortController>();
  pending.add(controller);
  requests.set(connectionKey, pending);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try { combined.throwIfAborted(); const result = await run(combined); combined.throwIfAborted(); return result; }
  finally { pending.delete(controller); if (!pending.size) requests.delete(connectionKey); }
}
