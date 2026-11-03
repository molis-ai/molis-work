import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentLocale } from "./web-locale.js";

/** HTTP binds the local owner, page language and request lifetime; accepted background work retains installation authority. */
export function pluginRouteControl(signal: AbortSignal, assertCurrent: () => void, assertRequestCurrent?: () => void): PluginExecutionControl {
  const check = () => { requireSynchronous(assertCurrent(), "最终路由授权检查必须同步完成"); };
  const request = () => { signal.throwIfAborted(); check(); requireSynchronous(assertRequestCurrent?.()); };
  return { signal, locale: currentLocale(), beforeEffect: async () => { request(); }, assert_authority_current: request,
    retainBackgroundAuthority: () => {
      request();
      return Object.assign(async () => { check(); }, { assertCurrent: check });
    } };
}
