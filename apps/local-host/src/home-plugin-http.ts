import { withProjectReachInvocation } from "./plugin-project-reach-subject.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { HomePluginHost, HomePluginPlatform } from "./home-plugins.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { declaredStageContributionId, inWordsOf, renderHomePluginPage, sideOpenedPlugins, stageContributionId, renderStagePage, type RenderedStagePage, type UnavailablePluginStage } from "@molis-ai/molis-work-app-workbench";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLATFORM_PLUGIN_REGISTRATIONS, runsInHome } from "./plugin-registry.js";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";
import type { PluginPlatform } from "./plugin-platform.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { readLocalWebBody, requestHost, sendLocalWebJson } from "./web-http.js";
import type { HomeStageHalves } from "./project-plugin-stages.js";
import { dispatchRuntimePluginRoute, PLUGIN_MANAGEMENT_OPERATIONS } from "./plugin-route-operations.js";
import { projectRouteControl } from "./plugin-actions-client.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { L, htmlLang, clientI18nScript } from "./web-locale.js";
import { randomUUID } from "node:crypto";
import { installedStageSection } from "./installed-stage-section.js";
import { FRAME_QUERY } from "./plugin-builder-surface.js";

/** The project a Home route names: where its library is and whether it reaches a Home plugin (`projectReachablePlugins`); null when there is none. */
export type HomeRouteProjectPlugins = (projectId: string) => Promise<{ readonly database_path: string; readonly display_name?: string; reaches(pluginId: string): boolean } | null>;

/**
 * Called only after the common local transport Host/Origin/token checks. No business dispatch list lives here. A plugin's own route
 * under a project's path (`/projects/<id>/api/plugins/<plugin>/…`) runs in that project once it exists and shows the plugin; the
 * project comes from the path alone. Without the prefix the route runs in no project, as the person's own.
 */
export async function handleHomePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL,
  host: MolisWorkLocalHost, controlToken: string, csp: string, projectPlugins?: HomeRouteProjectPlugins): Promise<boolean> {
  const prefixed = /^\/projects\/([^/]+)(\/(?:api\/plugins\/[^/]+\/.*|side\/[^/]+\/[^/]+|plugins\/[^/]+))$/u.exec(incomingUrl.pathname);
  const url = prefixed ? new URL(prefixed[2]! + incomingUrl.search, incomingUrl) : incomingUrl;
  // A page's key is a shipped plugin's project key or another Home plugin's id (dotted); see HomePluginHost.registered.
  const sidePage = /^\/side\/([a-z0-9][a-z0-9.-]*)\/([a-z0-9-]+)$/u.exec(url.pathname);
  const page = sidePage ?? /^\/plugins\/([a-z0-9][a-z0-9.-]*)$/u.exec(url.pathname);
  const route = /^\/api\/plugins\/([^/]+)\//u.exec(url.pathname);
  if (!page && !route || !host.homePlugins) return false;
  // The Home's own registration names its pages and owns its routes, a plugin the build does not ship included (#679, S-31).
  const entry = page ? await registeredPage(host.homePlugins, page[1]!) : undefined;
  if (page && !entry) return false;
  const pluginId = entry?.manifest.plugin_id ?? route![1]!;
  if (!host.homePlugins.manifest(pluginId)) return false;
  const side = sidePage?.[2] ?? (page ? url.searchParams.get("side") : null);
  const sideView = side ? entry?.manifest.ui?.views?.find(view => view.slot === "side" && view.view_id === side) : undefined;
  if (side !== null && !sideView) { sendLocalWebJson(response, 404, { error: "插件没有这个侧栏入口" }); return true; }
  const operation = route ? url.pathname.slice(`/api/plugins/${pluginId}/`.length) : "";
  // The Host's lifecycle operations are the Home's: under a project's path they are not there, and nothing starts or retries.
  if (prefixed && PLUGIN_MANAGEMENT_OPERATIONS.has(operation)) {
    const missing = actionErrorResponse(new ActionError("actions.missing", "插件没有这个入口"));
    sendLocalWebJson(response, missing.status, missing.body); return true;
  }
  if (operation === "retry" && request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请通过 POST 重试启动" }); return true; }
  // A dual-instance plugin's routes are split between its halves (specs/dual-instance-plugins): the Home answers those its running half
  // binds and leaves every other declared route to the project's instance, next in the request chain. Only the Host's start list marks a plugin so.
  const split = Boolean(route) && !PLUGIN_MANAGEMENT_OPERATIONS.has(operation) && host.homePlugins.dualInstance(pluginId);
  let platform;
  try { platform = await (operation === "retry" ? host.homePlugins.retry() : host.homePlugins.ready()); }
  catch (error) {
    if (split) return false;
    const message = error instanceof Error ? error.message : String(error);
    if (page && entry) {
      response.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
      response.end(renderHomePluginPage(pageEntry(entry), null, message, controlToken, { L, htmlLang, clientI18nScript }, true, Boolean(sideView)));
    } else sendLocalWebJson(response, 503, { error: message });
    return true;
  }
  const install = host.homePlugins.installation(pluginId);
  // A running Home half that does not bind the route leaves it to the project's half, unchanged. A Home half that binds nothing
  // (stopped, revoked or uninstalled) leaves it only to a project half that binds it; one that does not, or whose platform cannot be
  // started, is not this route's to answer: the Home answers it as it answers any stopped Home plugin's (RAC-1300, RAC-1301).
  let earlyProject: (LocalHostProjectReference & { display_name?: string }) | undefined;
  if (split && projectHalfRoute(platform, install, request.method, url.pathname)) {
    if (install?.state === "running" || !prefixed) return false;
    const found = await routeProject(prefixed[1]!, pluginId, projectPlugins, split);
    if (!(found instanceof ActionError)) {
      earlyProject = found;
      const projectPlatform = await projectPluginPlatform(host, found);
      // A project whose plugins cannot run is the project chain's to refuse, as it does for any project plugin route today.
      if (!projectPlatform) return false;
      if (projectHalfBinds(projectPlatform, pluginId, request.method, url.pathname)) return false;
    }
  }
  if (route && !install) {
    const missing = actionErrorResponse(new ActionError("actions.missing", "这个 Home 插件未安装"));
    sendLocalWebJson(response, missing.status, missing.body); return true;
  }
  if (operation === "retry") { sendLocalWebJson(response, 200, { ready: true }); return true; }
  let project = earlyProject;
  if (prefixed && !project) {
    const found = await routeProject(prefixed[1]!, pluginId, projectPlugins, split);
    if (found instanceof ActionError) { const refused = actionErrorResponse(found); sendLocalWebJson(response, refused.status, refused.body); return true; }
    project = found;
  }
  if (page && entry) {
    if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "请通过 GET 打开页面" }); return true; }
    // A signed package installed in the Home draws its stage with a page of its own, framed by the workbench or by the Home's page around it.
    if (host.homePlugins.hasPackage(pluginId)) {
      const surface = host.homePlugins.packageSurface(pluginId);
      try {
        const body = surface && url.searchParams.get("frame") === "workbench" ? host.homePlugins.packageDocument(pluginId, controlToken, project?.project_id ?? null)!
          : renderHomePluginPage(pageEntry(entry), null, host.homePlugins.packageError(pluginId) ?? platform.supervisor.state(pluginId)?.message ?? null, controlToken,
            // A package that did not come back is not switched off, so "enable" would not mend it: its page says why and offers no switch.
            { L, htmlLang, clientI18nScript }, false, false, project, surface ? `${project ? `/projects/${encodeURIComponent(project.project_id)}` : ""}/plugins/${encodeURIComponent(pluginId)}?${FRAME_QUERY}` : undefined, Boolean(surface));
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
        response.end(body);
      } catch (error) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); }
      return true;
    }
    const contribution = install?.state === "running" ? platform.runtime.contribution(install.install_id) : null;
    const slot = sideView ? "workbench.side" : "workbench.main";
    const view = contribution?.kind === "app" ? contribution.views?.find(view => (!sideView || view.descriptor.contribution_id === sideView.contribution_id)
      && view.descriptor.surfaces?.some(surface => surface.target_slot_id === slot)) : undefined;
    const surface = view?.descriptor.surfaces?.find(surface => surface.target_slot_id === slot);
    const html = view && surface ? view.render({ contribution_id: view.descriptor.contribution_id, surface: surface.surface_id, model: { ...homeViewModel(pluginId), project_id: project?.project_id ?? null, route_prefix: project ? `/projects/${encodeURIComponent(project.project_id)}` : "", view_id: side } }) : null;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
    response.end(renderHomePluginPage(pageEntry(entry), html, host.homePlugins.packageError(pluginId) ?? platform.supervisor.state(pluginId)?.message ?? null, controlToken, { L, htmlLang, clientI18nScript }, false, Boolean(sideView), project));
    return true;
  }
  if (["enable", "disable", "uninstall"].includes(operation)) {
    if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请通过 POST 更改插件状态" }); return true; }
    // A package installed in the Home (BL-628) is switched and removed by the install lifecycle a project's packages have, not by the supervisor alone.
    if (host.homePlugins.hasPackage(pluginId)) {
      try {
        const body = operation === "uninstall" ? await readLocalWebBody(request) as { keep_data?: unknown } | null : null;
        await host.homePlugins.packageAction(pluginId, operation as "enable" | "disable" | "uninstall", { keepData: body?.keep_data === true });
        sendLocalWebJson(response, 200, { [operation === "enable" ? "enabled" : operation === "disable" ? "disabled" : "uninstalled"]: true });
      } catch (error) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); }
      return true;
    }
    if (operation === "uninstall") { sendLocalWebJson(response, 404, { error: "插件没有这个入口" }); return true; }
    if (operation === "enable") {
      const state = await platform.supervisor.enable(pluginId);
      sendLocalWebJson(response, state.status === "running" ? 200 : 503, { state, ...(state.message ? { error: state.message } : {}) });
    } else {
      const refusal = host.homePlugins.leaveRefusal(pluginId, "停用");
      if (refusal) { const refused = actionErrorResponse(refusal); sendLocalWebJson(response, refused.status, refused.body); return true; }
      platform.supervisor.revoke(pluginId);
      if (install && install.state !== "disabled") await platform.runtime.stop(install.install_id);
      sendLocalWebJson(response, 200, { disabled: true });
    }
    return true;
  }
  const abort = new AbortController(), pageAuthority = pluginPageRequest(request);
  const stop = () => abort.abort(new ActionError("actions.cancelled", "调用已取消"));
  const disconnected = () => { if (!response.writableEnded) stop(); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  const plain = { ...pluginRouteControl(pageAuthority ? AbortSignal.any([abort.signal, pageAuthority.signal]) : abort.signal, () => { if (host.lifecycle() !== "running" || platform.supervisor.state(pluginId)?.status !== "running") throw new ActionError("actions.plugin_unavailable", "插件或宿主已停止"); }, pageAuthority?.assertCurrent), page_context: homePageContext(request, url, host.homePlugins.registered()), project_title: project?.display_name };
  let routed: ReturnType<typeof projectRouteControl> | undefined;
  try {
    abort.signal.throwIfAborted();
    const caller = await localWebActionContext(host, project, LOCAL_OWNER_PERMISSIONS);
    abort.signal.throwIfAborted();
    routed = projectRouteControl(plain, project?.project_id ?? null, project ? host.actionClient(project) : host.homeActionClient(), async () => {
      if (!project || !prefixed) return;
      const found = await routeProject(prefixed[1]!, pluginId, projectPlugins, split);
      if (found instanceof ActionError) throw found;
    }, caller, { id: randomUUID() });
    const execution = routed?.control ?? plain;
    const dispatch = () => dispatchRuntimePluginRoute(platform, pluginId, operation, request, response, url, LOCAL_PERSON_ACTOR_ID, {}, {
      execution,
      stop,
      readBody: async (request, maxBytes) => {
        // The route's own limit when it declares one; otherwise bounded for image-bearing Home actions. Each plugin also validates its input.
        try { return await readLocalWebBody(request, maxBytes ?? 12 * 1024 * 1024); }
        catch (error) { if (error instanceof ActionError) throw error; throw new ActionError(error instanceof RangeError ? "actions.input_too_large" : "actions.input_invalid",
          error instanceof Error ? error.message : "请求读取失败"); }
      },
    });
    const handled = install && host.homePlugins.hasPackage(pluginId)
      ? await withProjectReachInvocation(execution, project?.project_id ?? null, install, dispatch) : await dispatch();
    if (!handled) sendLocalWebJson(response, 404, { error: "插件没有这个入口" });
  } finally { stop(); routed?.end(); request.off("aborted", disconnected); response.off("close", disconnected); }
  return true;
}

/**
 * The registered page for `key`. An installed package's page is registered once the Home has started, so the first request after a start
 * may be that page: a key nothing registers yet waits for the Home and looks again (BL-713). A Home that did not start registers no
 * package, so a key nothing registers is not this module's to answer: the page recovery that renders the unavailable Home does (S-34).
 */
async function registeredPage(homePlugins: HomePluginHost, key: string): Promise<ReturnType<HomePluginHost["registered"]>[number] | undefined> {
  const find = () => homePlugins.registered().find(item => item.key === key);
  const known = find();
  if (known) return known;
  try { await homePlugins.ready(); }
  catch { return undefined; }
  return find();
}

/**
 * The project the path names, while it exists and reaches this plugin (the shared judgement: a shipped plugin while the project shows it,
 * a personal Home plugin outside the build unless the project hid it); otherwise why not. Asked when the route starts and before each
 * write. A dual-instance plugin the build does not ship (a Host's fixture) has no key in the project's list: like its project half,
 * which every project reaches, it is shown wherever the project exists.
 */
async function routeProject(segment: string, pluginId: string, projectPlugins: HomeRouteProjectPlugins | undefined, dualInstance: boolean)
  : Promise<(LocalHostProjectReference & { display_name?: string }) | ActionError> {
  let projectId: string;
  try { projectId = decodeURIComponent(segment); } catch { return new ActionError("actions.missing", "找不到这个项目"); }
  const found = projectPlugins ? await projectPlugins(projectId) : null;
  if (!found) return new ActionError("actions.missing", "找不到这个项目");
  const shipped = PLATFORM_PLUGIN_REGISTRATIONS.some(item => runsInHome(item) && item.manifest.plugin_id === pluginId);
  if (!found.reaches(pluginId) && (shipped || !dualInstance)) return new ActionError("actions.plugin_disabled", "此项目未启用该插件");
  return { ...molisWorkHostProjectReference({ databasePath: found.database_path, projectId }), display_name: found.display_name };
}

/**
 * Whether this request is the project half's: it matches a route the Manifest declares and the Home half does not bind now (a half that
 * is not running binds none). A path the Manifest does not declare stays the Home's, which answers it as for any Home plugin.
 */
function projectHalfRoute(platform: HomePluginPlatform, install: PluginInstanceRecord | null, method: string | undefined, pathname: string): boolean {
  let match;
  try { match = platform.router().match(method ?? "GET", pathname); }
  catch (error) {
    // Bad percent-encoding throws before the matcher can say whose route this is. The request is handed to the project chain (true means
    // it is the project half's, as for a declared route this half does not bind): the project and its enablement are judged first, then
    // the Runtime's own declared-shape answer. The Home half neither answers it nor refuses it on its own. Other failures propagate.
    if (error instanceof URIError) return true;
    throw error;
  }
  return match ? !binds(platform, install, match.route_id) : false;
}

/** Whether a running installation's app contribution binds this route: each half binds only the routes of its own installation. */
function binds(platform: Pick<PluginPlatform, "runtime">, install: PluginInstanceRecord | null, routeId: string): boolean {
  const contribution = install?.state === "running" ? platform.runtime.contribution(install.install_id) : null;
  return Boolean(contribution?.kind === "app" && (contribution.routes ?? []).some(binding => binding.route_id === routeId));
}

/**
 * The project's plugin platform, started through the Host's own preparation path when nothing has started it yet. Null when it still
 * does not run: the route is then the project chain's to answer, as it answers any project plugin route whose platform cannot start.
 */
async function projectPluginPlatform(host: MolisWorkLocalHost, project: LocalHostProjectReference): Promise<PluginPlatform | null> {
  const running = () => host.withProject(project, runtime => runningProjectPlatform(runtime.store, project.project_id));
  const started = await running();
  if (started) return started;
  await host.actionClient(project).discover(await localWebActionContext(host, project, LOCAL_OWNER_PERMISSIONS));
  return running();
}

/** Whether the project's half answers this declared route now: its installation runs and its contribution binds the route. */
function projectHalfBinds(platform: PluginPlatform, pluginId: string, method: string | undefined, pathname: string): boolean {
  let match;
  try { match = platform.router().match(method ?? "GET", pathname); }
  catch (error) {
    // Same malformed path: the project chain decides (it judges the project, enablement and then the Runtime's declared-shape answer).
    if (error instanceof URIError) return true;
    throw error;
  }
  if (!match) return false;
  const state = platform.supervisor.state(pluginId);
  return binds(platform, state?.install_id ? platform.runtime.get(state.install_id) : null, match.route_id);
}

/** The browser's same-origin page locator is a client report; it does not prove what was on screen. */
function homePageContext(request: IncomingMessage, url: URL, registered: ReturnType<HomePluginHost["registered"]>) {
  if (typeof request.headers.referer !== "string") return undefined;
  try {
    const page = new URL(request.headers.referer);
    if (page.protocol !== url.protocol || page.host !== requestHost(request)) return undefined;
    const plugin = registered.find(entry => page.pathname === `/plugins/${entry.key}` || page.searchParams.get("openPlugin") === entry.key);
    return { url: page.pathname, title: plugin?.manifest.name ?? null, provenance: "client_reported" as const };
  } catch { return undefined; /* A Referer that is not a URL names no page. */ }
}

/** What the Home page draws of a registered plugin: its key, name and id. */
const pageEntry = (entry: ReturnType<HomePluginHost["registered"]>[number]) => ({ project_plugin_id: entry.key, manifest: entry.manifest });

/** What a Home view is drawn with: the page's own escaping and language, as the workbench gives its built-in stages. */
function homeViewModel(pluginId: string) {
  return { primitives: { escape: (value: unknown) => escapeHtml(String(value)), text: inWordsOf(pluginId, L) } };
}

/**
 * A fresh Runtime view for every page render; the catalog does not grant activation or render a stopped instance. Each stage
 * drawn here, the unavailable shell included, is reported by the contribution that would draw it, so the shell's declared
 * stages do not draw it again.
 */
export async function renderHomePluginStages(host?: HomePluginHost, options?: { project_id?: string; page_owner?: string; model(projectPluginId: string): unknown }): Promise<{ html: string[]; ids: string[]; unavailable: UnavailablePluginStage[]; page?: RenderedStagePage }> {
  if (!host) return { html: [], ids: [], unavailable: [] };
  let platform: HomePluginPlatform | undefined, failure: string | undefined;
  try { platform = await host.ready(); }
  catch (error) { failure = error instanceof Error ? error.message : String(error); }
  // Each plugin the Home registers, with a shipped plugin's workbench surfaces (they decide whether it opens in the side panel only).
  const registered = host.registered().flatMap(entry => {
    const registration = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.project_plugin_id === entry.key && item.manifest.plugin_id === entry.manifest.plugin_id);
    if (registration && !declaredStageContributionId(registration)) return [];
    return [{ project_plugin_id: entry.key, manifest: entry.manifest, workbench: registration?.workbench }];
  });
  const ids: string[] = [], sideOnly = sideOpenedPlugins(registered);
  const unavailable: UnavailablePluginStage[] = [];
  let page: RenderedStagePage | undefined;
  const draw = (entry: (typeof registered)[number], view: UiContribution): string[] => {
    const rendered = renderStagePage(view, options?.model(entry.project_plugin_id) ?? homeViewModel(entry.manifest.plugin_id), entry.project_plugin_id,
      options?.page_owner === entry.manifest.plugin_id);
    if (rendered.page) { page = rendered.page; return []; }
    return [rendered.html];
  };
  const html = registered.filter(entry => !Object.hasOwn(sideOnly, entry.project_plugin_id)).flatMap(entry => {
    const pluginId = entry.manifest.plugin_id, stage = stageContributionId(entry.manifest);
    // A dual-instance plugin's stage is the half's that offers its view (`dualStageOwner`), shipped or not: here only when that is
    // the Home half. Otherwise the project page draws it, and the Home's placeholder too when the Home half is the one to answer.
    if (host.dualInstance(pluginId)) {
      const view = stage ? homeStageView(host, platform, pluginId, stage) : undefined;
      if (!view) return [];
      ids.push(stage!);
      return draw(entry, view);
    }
    if (stage) ids.push(stage);
    // A signed package installed in the Home is drawn as every installed plugin's stage is, a frame of its own page; one that did not come back says why.
    if (host.hasPackage(pluginId)) {
      const surface = host.packageSurface(pluginId);
      if (surface) return [installedStageSection({ pluginId, surface, label: entry.manifest.name, prefix: options?.project_id ? `/projects/${encodeURIComponent(options.project_id)}` : "" })];
      unavailable.push(homeUnavailableStage(host, platform, failure, entry));
      return [];
    }
    const install = host.installation(pluginId);
    const contribution = install?.state === "running" ? platform?.runtime.contribution(install.install_id) : null;
    const view = contribution?.kind === "app" ? contribution.views?.find(view => view.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
    if (view) return draw(entry, view);
    unavailable.push(homeUnavailableStage(host, platform, failure, entry));
    return [];
  });
  return { html, ids, unavailable, ...(page ? { page } : {}) };
}

/**
 * The Home's placeholder for a plugin's stage: the start failure, else why an installed package did not come back, else the
 * supervisor's message, else what the instance's state says.
 */
function homeUnavailableStage(host: HomePluginHost, platform: HomePluginPlatform | undefined, failure: string | undefined,
  entry: { project_plugin_id: string; manifest: PluginManifest }): UnavailablePluginStage {
  const install = host.installation(entry.manifest.plugin_id);
  return { surface: entry.project_plugin_id, label: entry.manifest.name, scope: "home",
    reason: L(failure ?? host.packageError(entry.manifest.plugin_id) ?? platform?.supervisor.state(entry.manifest.plugin_id)?.message
      ?? (install?.state === "running" ? "插件页面未注册" : "插件已停用")) };
}

/** The running Home instance's view of this stage: the contribution the Manifest names, with its `workbench` surface. */
function homeStageView(host: HomePluginHost, platform: HomePluginPlatform | undefined, pluginId: string, contributionId: string) {
  const install = host.installation(pluginId);
  const contribution = install?.state === "running" ? platform?.runtime.contribution(install.install_id) : null;
  return contribution?.kind === "app" ? contribution.views?.find(view => view.descriptor.contribution_id === contributionId
    && view.descriptor.surfaces?.some(surface => surface.surface_id === "workbench")) : undefined;
}

/**
 * The Home halves of the dual-instance plugins, read for one project page, which draws every such stage the Home half does not
 * (`renderProjectRuntimeStages`). The Home dual-instance plugins outside the build are listed for it: the build's are its own catalog.
 */
export async function homeStageHalves(host?: HomePluginHost): Promise<HomeStageHalves | undefined> {
  if (!host) return undefined;
  let platform: HomePluginPlatform | undefined, failure: string | undefined;
  try { platform = await host.ready(); }
  catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const outsideCatalog = host.registered().filter(entry => host.dualInstance(entry.manifest.plugin_id)
    && !PLATFORM_PLUGIN_REGISTRATIONS.some(item => item.project_plugin_id === entry.key && item.manifest.plugin_id === entry.manifest.plugin_id))
    .map(entry => ({ project_plugin_id: entry.key, manifest: entry.manifest }));
  return { outsideCatalog,
    dualInstance: pluginId => host.dualInstance(pluginId),
    half: (pluginId, contributionId) => ({ running: host.installation(pluginId)?.state === "running", view: homeStageView(host, platform, pluginId, contributionId) !== undefined }),
    unavailable: entry => homeUnavailableStage(host, platform, failure, entry) };
}
