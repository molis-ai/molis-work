import { PLUGIN_ROUTE_PREFIX } from "@molis-ai/molis-work-plugin-runtime";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

function nativePluginHttpAliases(): Readonly<Record<string, string>> {
  const aliases: Record<string, string> = { functions: "functions", "io.molis.work.functions": "functions" };
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    if (entry.personal !== true) continue;
    aliases[entry.project_plugin_id] = entry.project_plugin_id;
    aliases[entry.manifest.plugin_id] = entry.project_plugin_id;
  }
  return aliases;
}

const PLUGIN_HTTP_ALIASES = nativePluginHttpAliases();

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
