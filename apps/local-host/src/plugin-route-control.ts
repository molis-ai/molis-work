import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";

/** HTTP authenticates the local owner. Only a command accepted while this request lives may retain its Host authority. */
export function pluginRouteControl(signal: AbortSignal, assertCurrent: () => void, assertRequestCurrent?: () => void): PluginExecutionControl {
  const check = () => { requireSynchronous(assertCurrent(), "最终路由授权检查必须同步完成"); };
  const request = () => { signal.throwIfAborted(); check(); requireSynchronous(assertRequestCurrent?.()); };
  return { signal, beforeEffect: async () => { request(); }, assert_authority_current: request,
    retainBackgroundAuthority: () => {
      request();
      return Object.assign(async () => { check(); }, { assertCurrent: check });
    } };
}
