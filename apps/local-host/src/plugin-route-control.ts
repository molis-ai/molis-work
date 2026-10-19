import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";

/** HTTP authenticates the local owner. Only a command accepted while this request lives may retain its Host authority. */
export function pluginRouteControl(signal: AbortSignal, assertCurrent: () => void): PluginExecutionControl {
  const check = () => { requireSynchronous(assertCurrent(), "最终路由授权检查必须同步完成"); };
  return { signal, beforeEffect: async () => { signal.throwIfAborted(); check(); }, assert_authority_current: () => { signal.throwIfAborted(); check(); },
    retainBackgroundAuthority: () => {
      signal.throwIfAborted(); check();
      return Object.assign(async () => { check(); }, { assertCurrent: check });
    } };
}
