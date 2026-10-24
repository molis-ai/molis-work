import { pluginPageRequest } from "./plugin-page-authority.js";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { projectRouteControl } from "./plugin-actions-client.js";
import { handlePluginEventHttp, isPluginEventManagementPath } from "./plugin-event-http.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { dispatchRuntimePluginRoute } from "./plugin-route-operations.js";
import { ensureProjectPlugins, type ProjectPluginPorts } from "./project-plugins.js";
import { sendLocalWebJson } from "./web-http.js";

/**
 * The project's plugin HTTP entry, the project-level counterpart of `home-plugin-http.ts`. Called only after the common local
 * transport Host/Origin/token checks. It serves every project plugin the same way and names none of them: the upgrade candidates,
 * the delivery-recovery paths and `/api/plugins/<plugin>/…`, whose shared operations live in `plugin-route-operations.ts`.
 */
export interface ProjectPluginHttpPorts extends ProjectPluginPorts {
  /** Who is calling through the page, for routes that forward to actions; without it a route runs under its plain controls. */
  routeCaller?(): Promise<ActionCallContext>;
}

/** How many plugin deliveries wait on the person in this project; the market resolves them (the page's attention read). */
export async function pluginEventsPending(ports: ProjectPluginHttpPorts): Promise<number> {
  const record = await ensureProjectPlugins(ports);
  if (!record.platform) throw new Error(record.error ?? "插件运行平台未能启动");
  return record.platform.events.recoveries(ports.projectId).length;
}

export async function handleProjectPluginHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: ProjectPluginHttpPorts): Promise<boolean> {
  const runtimeUpdates = url.pathname === "/api/plugins/runtime/updates" && request.method === "GET";
  const runtimeEvents = isPluginEventManagementPath(url.pathname);
  const pluginRoute = url.pathname.match(/^\/api\/plugins\/(io\.molis\.work\.[a-z0-9][a-z0-9.-]*)\/(.+)$/u);
  if (!runtimeUpdates && !runtimeEvents && !pluginRoute) return false;
  const record = await ensureProjectPlugins(ports);
  if (!record.platform) { sendLocalWebJson(response, 503, { error: record.error ?? "插件运行平台未能启动" }); return true; }
  if (runtimeEvents) {
    await handlePluginEventHttp(request, response, url, { events: record.platform.events, projectId: ports.projectId, actorId: ports.actorId });
    return true;
  }
  if (runtimeUpdates) {
    const updates = record.platform.upgradeCandidates().map(candidate => ({
      ...candidate,
      project_plugin_id: BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === candidate.plugin_id)?.project_plugin_id ?? null,
    }));
    sendLocalWebJson(response, 200, { updates });
    return true;
  }
  const pluginId = pluginRoute![1]!, platform = record.platform;
  const abort = new AbortController(), pageAuthority = pluginPageRequest(request);
  const stop = () => abort.abort(new ActionError("actions.cancelled", "这次调用已结束"));
  request.once("aborted", stop); response.once("close", stop);
  let routed: ReturnType<typeof projectRouteControl> | undefined;
  try {
    const current = () => { if (platform.supervisor.state(pluginId)?.status !== "running") throw new ActionError("actions.plugin_unavailable", "插件已停止"); };
    const plain = pluginRouteControl(pageAuthority ? AbortSignal.any([abort.signal, pageAuthority.signal]) : abort.signal, current, pageAuthority?.assertCurrent);
    abort.signal.throwIfAborted();
    const caller = await ports.routeCaller?.();
    abort.signal.throwIfAborted();
    if (caller) routed = projectRouteControl(plain, ports.projectId, ports.actions.client, async () => { current(); }, caller);
    return await dispatchRuntimePluginRoute(platform, pluginId, pluginRoute![2]!, request, response, url, ports.actorId, {
      async afterDispatch() { await platform.wiring.drain(); },
    }, { execution: routed?.control ?? plain, stop });
  } finally {
    stop(); routed?.end(); request.off("aborted", stop); response.off("close", stop);
  }
}
