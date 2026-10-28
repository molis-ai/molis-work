import { resolve } from "node:path";
import type { ConnectorBindingKey } from "@molis-ai/molis-work-service-connector-host";

const listeners = new Map<string, Set<(id: string) => void>>();
export function subscribeConnectorChanges(home: string, listener: (id: string) => void): () => void {
  const name = resolve(home); const rows = listeners.get(name) ?? new Set(); rows.add(listener); listeners.set(name, rows);
  return () => { rows.delete(listener); if (!rows.size) listeners.delete(name); };
}

const requests = new Map<string, Map<AbortController, { done: Promise<void>; binding?: string }>>();
const key = (home: string, id: string) => JSON.stringify([resolve(home), id]);
const bindingKey = (binding: ConnectorBindingKey) => JSON.stringify([binding.scope_id, binding.plugin_id, binding.slot_id]);

/** Reauthorization and disconnect invalidate work already using that connection. */
export function invalidateConnectorRequests(home: string, id: string): void {
  for (const listener of listeners.get(resolve(home)) ?? []) listener(id);
  for (const controller of requests.get(key(home, id))?.keys() ?? []) controller.abort(new Error("连接已改变，请重新执行"));
}

/** A binding change permanently cancels only requests using that exact slot, including A→B→A. */
export function invalidateConnectorBindingRequests(home: string, binding: ConnectorBindingKey): void {
  const name = resolve(home), changed = bindingKey(binding);
  for (const [connectionKey, pending] of requests) {
    if ((JSON.parse(connectionKey) as string[])[0] !== name) continue;
    for (const [controller, request] of pending) if (request.binding === changed) controller.abort(new Error("账号连接槽已改变，请重新执行"));
  }
}

export async function withConnectorRequest<T>(home: string, id: string, signal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>, binding?: ConnectorBindingKey): Promise<T> {
  const controller = new AbortController();
  const connectionKey = key(home, id);
  let finish!: () => void;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const pending = requests.get(connectionKey) ?? new Map<AbortController, { done: Promise<void>; binding?: string }>();
  pending.set(controller, { done, ...(binding ? { binding: bindingKey(binding) } : {}) });
  requests.set(connectionKey, pending);
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try { combined.throwIfAborted(); const result = await run(combined); combined.throwIfAborted(); return result; }
  finally { controller.abort(new Error("这次连接调用已结束")); finish(); pending.delete(controller); if (!pending.size) requests.delete(connectionKey); }
}

/** Stop only this Home's active operations and await their owned children before the Host releases its directory. */
export async function closeConnectorResources(home: string | undefined, directory: { close(): void } | undefined): Promise<void> {
  const closing = [...requests.entries()].filter(([name]) => home !== undefined && (JSON.parse(name) as string[])[0] === resolve(home)).flatMap(([, pending]) => [...pending.entries()]);
  for (const [controller] of closing) controller.abort(new Error("Host 已关闭，请重新打开接入请求"));
  await Promise.all(closing.map(([, request]) => request.done));
  directory?.close();
}
