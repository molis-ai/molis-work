import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginManifest,
  PluginRouteMethod,
  PluginRouteRequest,
  PluginRouteResponse,
  PluginExecutionControl,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";

import { watchInstance, type InstanceWatchTimers } from "./instance-watch.js";
import type { PluginHostLifecycle } from "./lifecycle.js";

/** Every Plugin route lives under this prefix. A Plugin never owns a bare path. */
export const PLUGIN_ROUTE_PREFIX = "/api/plugins";

export interface PluginRouteMatch {
  plugin_id: string;
  route_id: string;
  method: PluginRouteMethod;
  params: Record<string, string>;
  permission: string | null;
  /** The body limit the route declares; null leaves it to the Host. */
  max_body_bytes: number | null;
  /** The route answers with a stream of lines (`PluginRouteStreamLine`). */
  stream: boolean;
}

interface CompiledRoute {
  plugin_id: string;
  route_id: string;
  method: PluginRouteMethod;
  segments: string[];
  permission: string | null;
  max_body_bytes: number | null;
  stream: boolean;
}

function compile(manifest: PluginManifest): CompiledRoute[] {
  return (manifest.routes ?? []).map((route) => ({
    plugin_id: manifest.plugin_id,
    route_id: route.route_id,
    method: route.method,
    segments: route.path.split("/").filter((segment) => segment !== ""),
    permission: route.permission ?? null,
    max_body_bytes: route.max_body_bytes ?? null,
    stream: route.stream === "ndjson",
  }));
}

function splitPath(pathname: string): string[] | null {
  if (!pathname.startsWith(`${PLUGIN_ROUTE_PREFIX}/`)) return null;
  return pathname.slice(PLUGIN_ROUTE_PREFIX.length + 1)
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => decodeURIComponent(segment));
}

/** Progress from an instance that is no longer active is refused there and then, not left to the watch that ends the stream. */
function liveEmit(instance: { active(): boolean }, emit: NonNullable<PluginRouteRequest["emit"]>): NonNullable<PluginRouteRequest["emit"]> {
  return (event) => {
    if (!instance.active()) throw new ActionError("actions.cancelled", "插件已停止，这次调用已结束");
    emit(event);
  };
}

export interface PluginRouteDispatchInput {
  method: string;
  pathname: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
  actor_id: string;
  /** Permissions the caller's session holds. A declared route permission must be in here. */
  granted?: readonly string[];
  /** Internal callers may preserve their invocation guard. HTTP adapters must not read this from request data. */
  execution?: PluginExecutionControl;
  /** Where a streamed route's progress goes; handed to the handler only when the route declares `stream`. */
  emit?: PluginRouteRequest["emit"];
  /** Told once if the instance stops while a streamed route runs, so the caller can end the call and the stream at once. */
  stopped?: () => void;
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
  readonly #timers: InstanceWatchTimers | undefined;

  /** `timers` is the clock a streamed route's instance watch runs on; omitted, the real one. */
  constructor(lifecycle: PluginHostLifecycle, manifests: readonly PluginManifest[], options: { timers?: InstanceWatchTimers } = {}) {
    this.#lifecycle = lifecycle;
    this.#routes = manifests.flatMap(compile);
    this.#timers = options.timers;
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
        max_body_bytes: route.max_body_bytes,
        stream: route.stream,
      };
    }
    return null;
  }

  /** Returns null when no Plugin declares this path, so the Host can fall through. */
  async dispatch(input: PluginRouteDispatchInput): Promise<PluginRouteResponse | null> {
    const match = this.match(input.method, input.pathname);
    if (!match) return null;
    // The router's own refusals are the platform's: the same facts the action layer already names, with the same sentences.
    if (match.permission !== null && !(input.granted ?? []).includes(match.permission)) {
      return actionErrorResponse(new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态"));
    }
    if (this.#lifecycle.generation(match.plugin_id) === undefined) {
      return actionErrorResponse(new ActionError("actions.plugin_disabled", "此项目未启用该插件"));
    }

    const instance = await this.#lifecycle.ensureStarted(match.plugin_id);
    if (!instance || !instance.active()) {
      return actionErrorResponse(new ActionError("actions.plugin_unavailable", "插件未运行或已停用"));
    }
    const binding = (instance.contribution.routes ?? [])
      .find((candidate) => candidate.route_id === match.route_id);
    if (!binding) {
      // The redemption check refuses this shape at start; reaching here means the
      // Plugin is running in a state it should not be, which is not the caller's fault.
      return actionErrorResponse(new ActionError("actions.execution_failed", "能力执行失败"));
    }

    const lifetime = match.stream ? createExecutionLifetime({ signal: input.execution?.signal }) : undefined;
    const request: PluginRouteRequest = {
      method: match.method,
      pathname: input.pathname,
      params: match.params,
      query: input.query ?? {},
      body: input.body ?? null,
      actor_id: input.actor_id,
      ...(input.execution ? { execution: input.execution } : {}),
      ...(match.stream && input.emit ? { emit: liveEmit(instance, event => { lifetime?.assertActive(); input.emit!(event); }) } : {}),
    };
    const unwatch = match.stream && input.stopped ? watchInstance(instance, input.stopped, this.#timers) : undefined;
    try {
      lifetime?.assertActive();
      const result = binding.handle(request);
      return await (lifetime ? lifetime.wait(Promise.resolve(result)) : result);
    } finally {
      unwatch?.();
      lifetime?.dispose();
    }
  }
}
