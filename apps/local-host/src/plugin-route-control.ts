import { captureWebSessionAuthority } from "./web-sessions.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { activeLocale } from "./web-locale.js";
import { assertPluginRoutePermissions } from "@molis-ai/molis-work-plugin-runtime";
import type { IncomingMessage } from "node:http";
import { requestHost } from "./web-http.js";

/** HTTP binds the local owner, page language and request lifetime; accepted background work retains installation authority. */
export function pluginRouteControl(signal: AbortSignal, assertCurrent: () => void, assertRequestCurrent?: () => void): PluginExecutionControl {
  const sessionCurrent = captureWebSessionAuthority();
  const check = () => { requireSynchronous(assertCurrent(), "最终路由授权检查必须同步完成"); assertPluginRoutePermissions(); };
  const request = () => { sessionCurrent(); signal.throwIfAborted(); check(); requireSynchronous(assertRequestCurrent?.()); };
  return { signal, locale: activeLocale() ?? undefined, beforeEffect: async () => { request(); }, assert_authority_current: request,
    retainBackgroundAuthority: () => {
      request();
      return Object.assign(async () => { check(); }, { assertCurrent: check });
    } };
}

/**
 * The page a route was called from, as the browser's same-origin Referer reports it: a client report that does not prove what was on
 * screen. Home and project routes report it alike (a plugin that moved into partitions in batch 108 still records where an entry came from).
 */
export function clientPageContext(request: IncomingMessage, url: URL, titleOf: (page: URL) => string | null = () => null) {
  if (typeof request.headers.referer !== "string") return undefined;
  try {
    const page = new URL(request.headers.referer);
    if (page.protocol !== url.protocol || page.host !== requestHost(request)) return undefined;
    return { url: page.pathname, title: titleOf(page), provenance: "client_reported" as const };
  } catch { return undefined; /* A Referer that is not a URL names no page. */ }
}
