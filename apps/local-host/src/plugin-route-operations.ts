import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginExecutionControl, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginPlatform } from "./plugin-platform.js";
import { offerRoutedOriginalFile, offerRoutedOriginalInput } from "./plugin-actions-client.js";
import { offeredOriginalFile } from "./material-original-entry.js";
import { withPluginInteraction } from "./plugin-interaction-answer.js";
import { answerPluginRouteStream } from "./plugin-route-stream.js";
import { hostErrors } from "./host-errors.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/** Host lifecycle entries are never provided by a plugin page, even if its Manifest reuses one of these paths. */
export const PLUGIN_MANAGEMENT_OPERATIONS = new Set(["retry", "enable", "disable", "uninstall", "restart", "release-quarantine", "upgrade"]);

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
 * The Runtime matcher decodes every path segment before it decides, so a path with bad percent-encoding throws a URIError before it can
 * say whether it is one of the plugin's routes. This asks the same matcher and answers that case as the retired Host dispatcher did:
 * the segments are re-encoded literally and, when the path is then one of this plugin's declared routes, it is the caller's invalid
 * path (`host.request_path_invalid`, 400); any other shape is not this plugin's route and answers null. Only the matcher's own
 * URIError is taken; every other failure still propagates.
 */
export function matchPluginRoute<Match extends { readonly plugin_id: string }>(
  match: (method: string, pathname: string) => Match | null, pluginId: string, method: string, pathname: string,
): Match | null {
  try {
    return match(method, pathname);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
    const literal = pathname.split("/").map((part) => {
      try { return encodeURIComponent(decodeURIComponent(part)); } catch { return encodeURIComponent(part); }
    }).join("/");
    const declared = match(method, literal);
    if (declared && declared.plugin_id === pluginId) throw hostErrors.request_path_invalid("请求路径里有无效的编码");
    return null;
  }
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
  // An installation the supervisor was started without (switched off) has no install_id in its state: its record says why.
  const records = active.install_id ? [platform.runtime.get(active.install_id)] : platform.runtime.list().filter(record => record.plugin_id === pluginId);
  if (records.length > 0 && records.every(record => record.state === "uninstalled")) {
    // Its own routes answer that it is not installed, as a Home plugin's do (BL-755); a lifecycle operation is another handler's.
    if (PLUGIN_MANAGEMENT_OPERATIONS.has(operation)) return false;
    const missing = actionErrorResponse(new ActionError("actions.missing", "这个插件未安装"));
    sendLocalWebJson(response, missing.status, missing.body);
    return true;
  }
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
  // Bad percent-encoding in the path is answered by `matchPluginRoute`: 400 for this plugin's declared shape, otherwise not its route.
  const match = matchPluginRoute((method, pathname) => router.match(method, pathname), pluginId, request.method ?? "GET", url.pathname);
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

