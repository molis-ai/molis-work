import type {
  PluginManifest,
  PluginRouteMethod,
  PluginRouteRequest,
  PluginRouteResponse,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginHostLifecycle } from "./lifecycle.js";

/** Every Plugin route lives under this prefix. A Plugin never owns a bare path. */
export const PLUGIN_ROUTE_PREFIX = "/api/plugins";

export interface PluginRouteMatch {
  plugin_id: string;
  route_id: string;
  method: PluginRouteMethod;
  params: Record<string, string>;
  permission: string | null;
}

interface CompiledRoute {
  plugin_id: string;
  route_id: string;
  method: PluginRouteMethod;
  segments: string[];
  permission: string | null;
}

function compile(manifest: PluginManifest): CompiledRoute[] {
  return (manifest.routes ?? []).map((route) => ({
    plugin_id: manifest.plugin_id,
    route_id: route.route_id,
    method: route.method,
    segments: route.path.split("/").filter((segment) => segment !== ""),
    permission: route.permission ?? null,
  }));
}

function splitPath(pathname: string): string[] | null {
  if (!pathname.startsWith(`${PLUGIN_ROUTE_PREFIX}/`)) return null;
  return pathname.slice(PLUGIN_ROUTE_PREFIX.length + 1)
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));
}

export interface PluginRouteDispatchInput {
  method: string;
  pathname: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  actor_id: string;
  /** Permissions the caller's session holds. A declared route permission must be in here. */
  granted?: readonly string[];
}

/**
 * Mounts declared Plugin routes under one Host-owned prefix.
 *
 * The Host owns matching, the prefix and the permission check; the Plugin owns
 * only the handler. An undeclared path never reaches a Plugin, and a declared
 * route with no handler is a Plugin fault rather than a silent 404.
 */
export class PluginRouteRouter {
  readonly #routes: CompiledRoute[];
  readonly #lifecycle: PluginHostLifecycle;

  constructor(lifecycle: PluginHostLifecycle, manifests: readonly PluginManifest[]) {
    this.#lifecycle = lifecycle;
    this.#routes = manifests.flatMap(compile);
  }

  match(method: string, pathname: string): PluginRouteMatch | null {
    const parts = splitPath(pathname);
    if (parts === null || parts.length === 0) return null;
    const [pluginId, ...rest] = parts;
    for (const route of this.#routes) {
      if (route.plugin_id !== pluginId || route.method !== method) continue;
      if (route.segments.length !== rest.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let index = 0; index < route.segments.length; index += 1) {
        const segment = route.segments[index]!;
        const value = rest[index]!;
        if (segment.startsWith(":")) {
          params[segment.slice(1)] = value;
          continue;
        }
        if (segment !== value) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      return {
        plugin_id: route.plugin_id,
        route_id: route.route_id,
        method: route.method,
        params,
        permission: route.permission,
      };
    }
    return null;
  }

  /** Returns null when no Plugin declares this path, so the Host can fall through. */
  async dispatch(input: PluginRouteDispatchInput): Promise<PluginRouteResponse | null> {
    const match = this.match(input.method, input.pathname);
    if (!match) return null;
    if (match.permission !== null && !(input.granted ?? []).includes(match.permission)) {
      return { status: 403, body: { error: "plugin_route_permission_denied" } };
    }
    if (this.#lifecycle.generation(match.plugin_id) === undefined) {
      return { status: 404, body: { error: "plugin_not_enabled" } };
    }

    const instance = await this.#lifecycle.ensureStarted(match.plugin_id);
    if (!instance || !instance.active()) {
      return { status: 503, body: { error: "plugin_unavailable" } };
    }
    const binding = (instance.contribution.routes ?? [])
      .find((candidate) => candidate.route_id === match.route_id);
    if (!binding) {
      // The redemption check refuses this shape at start; reaching here means the
      // Plugin is running in a state it should not be, which is not the caller's fault.
      return { status: 500, body: { error: "plugin_route_unbound" } };
    }

    const request: PluginRouteRequest = {
      method: match.method,
      pathname: input.pathname,
      params: match.params,
      query: input.query ?? {},
      body: input.body ?? null,
      actor_id: input.actor_id,
    };
    return await binding.handle(request);
  }
}
