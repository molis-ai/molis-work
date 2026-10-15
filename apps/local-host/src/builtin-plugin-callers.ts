import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";

// Process-local membership comes only from a Host start-list definition, never a plugin id or a serialized caller.
const callers = new WeakSet<HostPluginCaller>();
export function qualifyBuiltinPluginCaller(caller: HostPluginCaller): () => void {
  callers.add(caller);
  return () => { callers.delete(caller); };
}
export function isBuiltinPluginCaller(caller: HostPluginCaller | undefined): boolean {
  if (!caller || !callers.has(caller)) return false;
  caller.assertActive();
  return true;
}
