import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginManifest, PluginRouteBinding, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_ROUTE_PREFIX, pluginRouteMatcher, type PluginRouteMatch } from "@molis-ai/molis-work-plugin-runtime";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { hostErrors } from "./host-errors.js";
import type { PluginPlatform } from "./plugin-platform.js";
import { offerRoutedOriginalFile, offerRoutedOriginalInput } from "./plugin-actions-client.js";
import { offeredOriginalFile } from "./material-original-entry.js";
import { withPluginInteraction } from "./plugin-interaction-answer.js";
import { answerPluginRouteStream } from "./plugin-route-stream.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/** Host lifecycle entries are never provided by a plugin page, even if its Manifest reuses one of these paths. */
export const PLUGIN_MANAGEMENT_OPERATIONS = new Set(["retry", "enable", "disable", "restart", "release-quarantine", "upgrade"]);

/**
 * What the instance that owns a Runtime plugin's routes adds around the shared operations. The operations know no plugin and no
 * project: whatever belongs to one plugin, or to the project's input graph, is handed in here by the caller. An instance with
 * nothing to add passes nothing.
 */
export interface RuntimePluginRouteHooks {
  /** Runs after the plugin answered, before the answer is sent; may reshape `result.body`. */
  afterDispatch?(result: PluginRouteResponse): Promise<void>;
}

/**
 * Transport authority comes from the caller, never from body/query values. A route's own declared permission is not among them: it is
 * checked against the installation behind the route (`dispatchRuntimePluginRoute`).
 */
interface RuntimePluginRouteControls {
  execution?: PluginExecutionControl;
  /** `maxBytes` is the route's declared `max_body_bytes`, when it declares one. */
  readBody?(request: IncomingMessage, maxBytes: number | undefined): Promise<unknown>;
  /** Ends this call (its `execution.signal`): a streamed route uses it when the plugin stops or its progress overflows. */
  stop?(): void;
}

/** A transport envelope, removed before the plugin's Action input is built. No business parameters decide authorship. */
function takeOriginalInput(body: unknown, installId: string | null | undefined, control: PluginExecutionControl | undefined): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.hasOwn(body, "original_input")) return body;
  const { original_input: offered, ...input } = body as Record<string, unknown>;
  if (!installId || !control || !offered || typeof offered !== "object" || Array.isArray(offered)) throw new ActionError("actions.input_invalid", "原始输入信封无效");
  const value = offered as Record<string, unknown>;
  if (Object.keys(value).some(key => key !== "input_id" && key !== "text" && key !== "use") || typeof value.input_id !== "string"
    || value.use !== undefined && value.use !== "supplement" || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(value.input_id) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 100_000) {
    throw new ActionError("actions.input_invalid", "原始输入信封无效");
  }
  offerRoutedOriginalInput(control, { ...(value.use === "supplement" ? { use: "supplement" as const } : {}), install_id: installId, input_id: value.input_id, text: value.text, written_by: "person", occurred_at: new Date().toISOString() });
  return input;
}

/**
 * The HTTP operations every Runtime plugin shares: restart and release-quarantine, upgrade, "not running", the view revision, then
 * the plugin's own declared route. Runtime registration, not a list of plugin ids, decides whose route this is: returns false
 * (the caller falls through to the next handler) for a plugin the platform never registered and for a path the plugin did not
 * declare, true once it has answered.
 */
export async function dispatchRuntimePluginRoute(
  platform: Pick<PluginPlatform, "runtime" | "supervisor" | "router" | "upgrade" | "viewRevision">,
  pluginId: string, operation: string, request: IncomingMessage, response: ServerResponse,
  url: URL, actorId: string, hooks: RuntimePluginRouteHooks = {}, controls: RuntimePluginRouteControls = {},
): Promise<boolean> {
  const active = platform.supervisor.state(pluginId);
  // Native adapters and unrelated routes retain their own ownership. Runtime
  // registration, rather than a second list of built-in IDs, decides this boundary.
  if (!active) return false;
  if (active.install_id && platform.runtime.get(active.install_id).state === "uninstalled") return false;
  if (operation === "restart" || operation === "release-quarantine") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "重试必须通过 POST 确认" }); return true; }
    const state = await platform.supervisor.restart(pluginId, { release_quarantine: operation === "release-quarantine" });
    sendLocalWebJson(response, state.status === "running" ? 200 : 409, { state });
    return true;
  }
  if (operation === "upgrade") {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "升级必须通过 POST 确认" }); return true; }
    const state = await platform.upgrade(pluginId);
    if (!state || state.status !== "running") {
      sendLocalWebJson(response, 409, { error: state?.message ?? "插件升级失败", code: state?.code ?? "plugin_upgrade_failed" });
      return true;
    }
    sendLocalWebJson(response, 200, {
      state,
      version: state.install_id ? platform.runtime.get(state.install_id).version : null,
    });
    return true;
  }
  const router = platform.router();
  if (active.status !== "running") { sendLocalWebJson(response, 503, { error: active.message ?? "插件未能启动" }); return true; }
  if (operation === "view-revision" && request.method === "GET") {
    response.setHeader("cache-control", "no-store");
    sendLocalWebJson(response, 200, { revision: platform.viewRevision(pluginId) });
    return true;
  }
  const match = router.match(request.method ?? "GET", url.pathname);
  if (!match) return false;
  // The Host's own entry may have put the person's chosen file on this request (material-original-entry.ts); only this request's
  // Host-made control carries it, and only to this installation's actions.
  if (active.install_id && controls.execution) offerRoutedOriginalFile(controls.execution, offeredOriginalFile(request, active.install_id));
  let body: unknown;
  if (!["GET", "HEAD"].includes(request.method ?? "GET")) {
    try {
      body = await (controls.readBody ?? ((request, maxBytes) => readLocalWebBody(request, maxBytes)))(request, match.max_body_bytes ?? undefined);
      body = takeOriginalInput(body, active.install_id, controls.execution);
    }
    catch (error) {
      if (!(error instanceof ActionError)) throw error;
      const refusal = actionErrorResponse(error);
      sendLocalWebJson(response, refusal.status, refusal.body);
      return true;
    }
  }
  // A route's own permission is the installation's, read now, whoever calls and whatever else they hold: built in or not, a grant
  // revoked from this installation closes its routes. What the caller may do through the route is the action layer's to check.
  const granted = active.install_id ? platform.runtime.get(active.install_id).grants : [];
  const input = { method: request.method ?? "GET", pathname: url.pathname, actor_id: actorId,
    query: Object.fromEntries(url.searchParams), body, granted, execution: controls.execution };
  const stop = () => controls.stop?.();
  if (match.stream) return answerPluginRouteStream(response, async emit => {
    const result = await router.dispatch({ ...input, emit, stopped: stop });
    controls.execution?.assert_authority_current?.();
    if (result) await hooks.afterDispatch?.(result);
    controls.execution?.assert_authority_current?.();
    return result;
  }, stop);
  const result = await router.dispatch(input);
  if (!result) return false;
  controls.execution?.assert_authority_current?.();
  await hooks.afterDispatch?.(result);
  controls.execution?.assert_authority_current?.();
  if (result.bytes !== undefined) {
    const raster = ["image/png", "image/jpeg", "image/webp"].includes(result.mime ?? "");
    const disposition = raster && result.disposition === "inline" ? "inline" : "attachment";
    response.writeHead(result.status, { "content-type": raster ? result.mime! : "application/octet-stream",
      "content-disposition": disposition + "; filename*=UTF-8''" + encodeURIComponent(result.filename ?? "material"),
      "x-content-type-options": "nosniff", "content-security-policy": "sandbox", "cache-control": "no-store" });
    response.end(result.bytes);
  } else sendLocalWebJson(response, result.status, withPluginInteraction(result.body));
  return true;
}

/**
 * Declared routes the Host serves from route handlers it holds itself, for a plugin not yet on the Plugin Runtime supervisor (until
 * that plugin's move, BL-386). Knows no plugin: whose routes these are comes from the caller.
 */
export interface DeclaredPluginRoutes {
  manifest: PluginManifest;
  bindings: readonly PluginRouteBinding[];
  /** The route's path inside the plugin, matched by the Runtime's own matcher as if it were under `/api/plugins/<plugin_id>/`. */
  path: string;
  /** From the request's context, never from its body or query. */
  actor_id: string;
  /**
   * The grants of the installation behind the routes, read as the Host dispatches (S-15): a route that declares a permission not in
   * here is refused, whoever calls. A plugin with no installation to read passes none, so its routes that declare one stay closed.
   */
  granted: readonly string[];
}

/**
 * Answers a declared route the way a Runtime route is answered: the handler gets the `PluginRouteRequest` a Runtime route would get,
 * with no execution control (S9 takes it from the platform), and answers JSON only. Returns false when no declared route matches,
 * true once it has answered; a refusal answers by its kind, any other failure goes on to the Host's unhandled answer.
 */
export async function dispatchDeclaredPluginRoutes(
  routes: DeclaredPluginRoutes, request: IncomingMessage, response: ServerResponse, url: URL,
): Promise<boolean> {
  const { manifest, bindings, path, actor_id, granted } = routes;
  try {
    const match = declaredRoute(manifest, request.method ?? "GET", `${PLUGIN_ROUTE_PREFIX}/${manifest.plugin_id}${path}`);
    if (!match) return false;
    if (match.permission !== null && !granted.includes(match.permission)) {
      throw new ActionError("actions.forbidden", "此能力的本地用户授权已失效，请检查插件权限和运行状态");
    }
    const binding = bindings.find(candidate => candidate.route_id === match.route_id);
    if (!binding) throw new Error(`插件 ${manifest.plugin_id} 声明了路由 ${match.route_id}，却没有处理它`);
    const body = ["GET", "HEAD"].includes(match.method) ? null : await readLocalWebBody(request, match.max_body_bytes ?? undefined);
    const result = await binding.handle({ method: match.method, pathname: url.pathname, params: match.params,
      query: Object.fromEntries(url.searchParams), body, actor_id });
    sendLocalWebJson(response, result.status, result.body);
    return true;
  } catch (error) {
    if (!(error instanceof ActionError)) throw error;
    const refusal = actionErrorResponse(error);
    sendLocalWebJson(response, refusal.status, refusal.body);
    return true;
  }
}

/**
 * The declared route for this path, or none. A path with a part that is not valid percent-encoding is refused only when it has the
 * shape of a declared route (that part read as the literal text it is); any other such path is not this plugin's.
 */
function declaredRoute(manifest: PluginManifest, method: string, pathname: string): PluginRouteMatch | null {
  const match = pluginRouteMatcher(manifest);
  try { return match(method, pathname); }
  catch (error) {
    if (!(error instanceof URIError)) throw error;
    const literal = pathname.split("/").map(part => { try { return encodeURIComponent(decodeURIComponent(part)); } catch { return encodeURIComponent(part); } }).join("/");
    if (match(method, literal)) throw hostErrors.request_path_invalid("请求路径里有无效的编码");
    return null;
  }
}
