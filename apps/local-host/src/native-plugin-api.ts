import { PLUGIN_ROUTE_PREFIX } from "@molis-ai/molis-work-plugin-runtime";

// W6-01/PG-058: functions is the only adapter left; the per-plugin short names went with the personal route bridge.
const PLUGIN_HTTP_ALIASES: Readonly<Record<string, string>> = { functions: "functions", "io.molis.work.functions": "functions" };

/** `/api/plugins/<id>/…` → `/api/<short-id>/…`. Unknown prefixes stay unchanged. */
export function rewriteNativePluginApiPath(pathname: string): string {
  const prefix = `${PLUGIN_ROUTE_PREFIX}/`;
  if (!pathname.startsWith(prefix)) return pathname;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const rawId = slash < 0 ? rest : rest.slice(0, slash);
  const tail = slash < 0 ? "" : rest.slice(slash);
  let id = rawId;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return pathname;
  }
  const alias = PLUGIN_HTTP_ALIASES[id];
  if (!alias) return pathname;
  return `/api/${alias}${tail}`;
}

export function withRewrittenPluginApi(url: URL): URL {
  const pathname = rewriteNativePluginApiPath(url.pathname);
  if (pathname === url.pathname) return url;
  const next = new URL(url.href);
  next.pathname = pathname;
  return next;
}
