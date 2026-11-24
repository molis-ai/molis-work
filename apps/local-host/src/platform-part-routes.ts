import { PLATFORM_ID_PREFIX } from "@molis-ai/molis-work-contracts/platform/plugin";
import { HOSTED_SURFACES } from "./host-surface-list.js";

const HOSTED_NAMES = new Set(HOSTED_SURFACES.map(surface => surface.manifest.plugin_id.slice(PLATFORM_ID_PREFIX.length)));

/**
 * A platform part the runtime hosts (Shelf, 第 44B 批) is addressed as `/api/platform/<name>/…`, under a project's path too; inside, the
 * runtime routes it as its own id (`/api/plugins/system.<name>/…`). The inner spelling is not an address: from outside it is refused
 * (`null`), so a part is reached one way only. Every other path is returned unchanged.
 */
export function platformPartUrl(url: URL): URL | null {
  const inner = /^(\/projects\/[^/]+)?\/api\/plugins\/([^/]+)(?:\/|$)/u.exec(url.pathname);
  if (inner && decoded(inner[2]!).startsWith(PLATFORM_ID_PREFIX)) return null;
  const outer = /^(\/projects\/[^/]+)?\/api\/platform\/([a-z0-9-]+)(\/.*)$/u.exec(url.pathname);
  if (!outer || !HOSTED_NAMES.has(outer[2]!)) return url;
  const rewritten = new URL(url);
  rewritten.pathname = `${outer[1] ?? ""}/api/plugins/${PLATFORM_ID_PREFIX}${outer[2]}${outer[3]}`;
  return rewritten;
}

function decoded(segment: string): string {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

/** A platform part is in every project: no project adds, hides or removes it, so each project's route reaches it (S-34). */
export function isHostedPlatformPart(pluginId: string): boolean {
  return pluginId.startsWith(PLATFORM_ID_PREFIX) && HOSTED_NAMES.has(pluginId.slice(PLATFORM_ID_PREFIX.length));
}
