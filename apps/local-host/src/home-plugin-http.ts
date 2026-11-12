import { withProjectReachInvocation } from "./plugin-project-reach-subject.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { HomePluginHost, HomePluginPlatform } from "./home-plugins.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { declaredStageContributionId, renderHomePluginPage, sideOpenedPlugins, stageContributionId, renderStagePage, type RenderedStagePage, type UnavailablePluginStage, type WorkbenchAppearancePorts } from "@molis-ai/molis-work-app-workbench";
import type { UiContribution, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
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
import { shellPageRead } from "./web-sessions.js";
import { readLocalWebBody, refuseLocalWebRequest, requestHost, sendLocalWebJson } from "./web-http.js";
import { captureRuntimeStageOwner, type HomeStageHalves } from "./project-plugin-stages.js";
import { dispatchRuntimePluginRoute, PLUGIN_MANAGEMENT_OPERATIONS } from "./plugin-route-operations.js";
import { projectRouteControl } from "./plugin-actions-client.js";
import { pluginRouteControl } from "./plugin-route-control.js";
import { readText, htmlLang } from "./web-locale.js";
import { randomUUID } from "node:crypto";
import { installedStageSection } from "./workbench-renderer.js";
import { installedPluginWords } from "./plugin-builder/installed-page.js";
import { assertStageInstallation, installedStageIdentity, installedStagePath, requestedStageInstallation } from "./installed-stage-identity.js";
import { captureWebSessionAuthority } from "./web-sessions.js";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";

/** The project a Home route names: where its library is and whether it reaches a Home plugin (`projectReachablePlugins`); null when there is none. */
export type HomeRouteProjectPlugins = (projectId: string) => Promise<{ readonly database_path: string; readonly display_name?: string; reaches(pluginId: string): boolean } | null>;

/** Management is a Host operation. Queued requests check the original connection before changing an installation. */
async function changeHomePlugin(request: IncomingMessage, response: ServerResponse, home: HomePluginHost, platform: HomePluginPlatform,
  pluginId: string, operation: "enable" | "disable" | "uninstall"): Promise<void> {
  if (request.method !== "POST") { sendLocalWebJson(response, 405, { error: "请通过 POST 更改插件状态" }); return; }
  const assertConnected = () => {
    if (request.aborted || response.destroyed) throw new ActionError("actions.cancelled", "这次设置操作已经结束");
  };
  try {
    if (home.hasPackage(pluginId)) {
      // A package installed in the Home (BL-628): switched and removed by the install lifecycle a project's packages have, not by the supervisor alone.
      if (operation === "uninstall" && pluginPageRequest(request)) throw new ActionError("actions.forbidden", "插件页面不能代本人卸载插件");
      const body = operation === "uninstall" ? await readLocalWebBody(request) as { keep_data?: unknown } | null : null;
      // The installation this request reaches is fixed when it arrives (BL-915): a reinstall or upgrade while it waits is not taken off in its place; what it kept is answered as the settings door answers it (`retained`).
      // Read once the Home has started: before that no installation is known, and the uninstall would fall back to whatever is current then.
      if (operation === "uninstall") await home.ready();
      const row = operation === "uninstall" ? home.installation(pluginId) : undefined;
      const retained = await home.packageAction(pluginId, operation, { keepData: body?.keep_data === true,
        ...row ? { target: { install_id: row.install_id, installation_generation: row.installation_generation, version: row.version, manifest_digest: row.manifest_digest } } : {} },
        { assert_authority_current: assertConnected });
      sendLocalWebJson(response, 200, { [operation === "enable" ? "enabled" : operation === "disable" ? "disabled" : "uninstalled"]: true, ...retained.length ? { retained } : {} });
    } else if (operation === "uninstall") {
      sendLocalWebJson(response, 404, { error: "插件没有这个入口" });
    } else if (operation === "enable") {
      const state = await home.installationScope.run(() => { assertConnected(); return platform.supervisor.enable(pluginId); });
      sendLocalWebJson(response, state.status === "running" ? 200 : 503, { state, ...(state.message ? { error: state.message } : {}) });
    } else {
      assertConnected();
      const refusal = home.leaveRefusal(pluginId, "停用");
      if (refusal) throw refusal;
      const install = home.installation(pluginId);
      platform.supervisor.revoke(pluginId);
      if (install && install.state !== "disabled") await platform.runtime.stop(install.install_id);
      sendLocalWebJson(response, 200, { disabled: true });
    }
  } catch (error) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); }
}

/** A tagged lazy frame must not fall through to a different scope or an unbound page. */
function unavailableStage(response: ServerResponse, expected?: SurfaceInstallationRef): boolean {
  if (!expected) return false;
  const refused = actionErrorResponse(new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开"));
  sendLocalWebJson(response, refused.status, refused.body);
  return true;
}

/**
 * Called only after the common local transport Host/Origin/token checks. No business dispatch list lives here. A plugin's own route
 * under a project's path (`/projects/<id>/api/plugins/<plugin>/…`) runs in that project once it exists and shows the plugin; the
 * project comes from the path alone. Without the prefix the route runs in no project, as the person's own.
 */
export async function handleHomePluginHttp(request: IncomingMessage, response: ServerResponse, incomingUrl: URL,
  host: MolisWorkLocalHost, controlToken: string, csp: string, projectPlugins?: HomeRouteProjectPlugins, accountRegistration=false, appearance?: WorkbenchAppearancePorts): Promise<boolean> {
  const prefixed = /^\/projects\/([^/]+)(\/(?:api\/plugins\/[^/]+\/.*|side\/[^/]+\/[^/]+|plugins\/[^/]+))$/u.exec(incomingUrl.pathname);
  const url = prefixed ? new URL(prefixed[2]! + incomingUrl.search, incomingUrl) : incomingUrl;
  // A page's key is a shipped plugin's project key or another Home plugin's id (dotted); see HomePluginHost.registered.
  const sidePage = /^\/side\/([a-z0-9][a-z0-9.-]*)\/([a-z0-9-]+)$/u.exec(url.pathname);
  const page = sidePage ?? /^\/plugins\/([a-z0-9][a-z0-9.-]*)$/u.exec(url.pathname);
  const route = /^\/api\/plugins\/([^/]+)\//u.exec(url.pathname);
  if (!page && !route) return false;
  let expected: SurfaceInstallationRef | undefined;
  try { expected = page ? requestedStageInstallation(url) : undefined; }
  catch (error) { const refused = actionErrorResponse(error); sendLocalWebJson(response, refused.status, refused.body); return true; }
  if (expected?.scope === "project") return false;
  const home = host.homePlugins, currentSession = captureWebSessionAuthority();
  if (!home) return unavailableStage(response, expected);
  const pageLocale = () => ({ readText, htmlLang, accountRegistration, appearance: appearance?.current() });
  // The Home's own registration names its pages and owns its routes, a plugin the build does not ship included (#679, S-31).
  const entry = page ? await registeredPage(home, page[1]!) : undefined;
  if (page && !entry) return unavailableStage(response, expected);
  const pluginId = entry?.manifest.plugin_id ?? route![1]!;
  if (!home.manifest(pluginId) || expected && (sidePage || page?.[1] !== pluginId)) return unavailableStage(response, expected);
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
  // A dual-instance plugin's routes are split between its halves (specs/archive/dual-instance-plugins): the Home answers those its running half
  // binds and leaves every other declared route to the project's instance, next in the request chain. Only the Host's start list marks a plugin so.
  const split = Boolean(route) && !PLUGIN_MANAGEMENT_OPERATIONS.has(operation) && home.dualInstance(pluginId);
  let platform;
  try { platform = await (operation === "retry" ? home.retry() : home.ready()); }
  catch (error) {
    if (split) return false;
    const message = error instanceof Error ? error.message : String(error);
    if (page && entry) {
      response.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp });
      response.end(renderHomePluginPage(pageEntry(entry), null, message, controlToken, pageLocale(), true, Boolean(sideView)));
    } else sendLocalWebJson(response, 503, { error: message });
    return true;
  }
  const install = home.installation(pluginId);
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
    if (expected || home.hasPackage(pluginId)) {
      const framed = url.searchParams.get("frame") === "workbench", projection = framed && request.headers.accept === "application/json";
      if (projection && !shellPageRead(request, "http://" + requestHost(request))) { refuseLocalWebRequest(response); return true; }
      try {
        currentSession();
        const current = home.installation(pluginId), release = home.packageStage(pluginId);
        if (expected) {
          assertStageInstallation("home", current, expected);
          if (!release) throw new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开");
        }
        // A stage with declared object slots opens in the workbench, where its slots are drawn (it has no page of its own to open).
        if (release && project && !framed && captureRuntimeStageOwner(platform, "home", pageEntry(entry))?.view.descriptor.slots.length) {
          response.writeHead(302, { location: `/projects/${encodeURIComponent(project.project_id)}/?openSurface=${encodeURIComponent(release.pluginId)}`, "cache-control": "no-store" });
          response.end(); return true;
        }
        const frame = release && current ? installedStagePath(project ? `/projects/${encodeURIComponent(project.project_id)}` : "", pluginId, installedStageIdentity("home", current)) : undefined;
        const body = release && framed ? home.packageDocument(pluginId, controlToken, project?.project_id ?? null, accountRegistration, projection, expected)
          : renderHomePluginPage(pageEntry(entry), null, home.packageError(pluginId) ?? platform.supervisor.state(pluginId)?.message ?? null, controlToken,
            // A package that did not come back is not switched off, so "enable" would not mend it: its page says why and offers no switch.
            pageLocale(), false, false, project, frame, Boolean(release));
        if (body === undefined) throw new ActionError("actions.provider_changed", "原舞台安装已变化，请重新打开");
        if (typeof body !== "string") sendLocalWebJson(response, 200, body);
        else { response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": csp }); response.end(body); }
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
    response.end(renderHomePluginPage(pageEntry(entry), html, home.packageError(pluginId) ?? platform.supervisor.state(pluginId)?.message ?? null, controlToken, pageLocale(), false, Boolean(sideView), project));
    return true;
  }
  if (operation === "enable" || operation === "disable" || operation === "uninstall") {
    await changeHomePlugin(request, response, home, platform, pluginId, operation);
    return true;
  }
  const abort = new AbortController(), pageAuthority = pluginPageRequest(request);
  const stop = () => abort.abort(new ActionError("actions.cancelled", "调用已取消"));
  const disconnected = () => { if (!response.writableEnded) stop(); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  const plain = { ...pluginRouteControl(pageAuthority ? AbortSignal.any([abort.signal, pageAuthority.signal]) : abort.signal, () => { if (host.lifecycle() !== "running" || platform.supervisor.state(pluginId)?.status !== "running") throw new ActionError("actions.plugin_unavailable", "插件或宿主已停止"); }, pageAuthority?.assertCurrent), page_context: homePageContext(request, url, home.registered()), project_title: project?.display_name };
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
    const handled = install && home.hasPackage(pluginId)
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
function homeViewModel(_pluginId: string) {
  return { primitives: { escape: (value: unknown) => escapeHtml(String(value)), text: readText } };
}

/**
 * A fresh Runtime view for every page render; the catalog does not grant activation or render a stopped instance. Each stage
 * drawn here, the unavailable shell included, is reported by the contribution that would draw it, so the shell's declared
 * stages do not draw it again.
 */
export async function renderHomePluginStages(host?: HomePluginHost, options?: { project_id?: string; page_owner?: string; model(projectPluginId: string): unknown;
  shown?: readonly string[]; views?: Readonly<Record<string, UiContribution & { readonly producer?: string } | null>> }) {
  const html: string[] = [], overlays: string[] = [], panels: Record<string, string> = {};
  const surfaces: Array<Pick<UiRenderRequest, "contribution_id" | "surface">> = [], unavailable: UnavailablePluginStage[] = [];
  let page: RenderedStagePage | undefined;
  if (!host) return { html, panels, overlays, surfaces, unavailable };
  let platform: HomePluginPlatform | undefined, failure: { code: string; message: string } | undefined;
  try { platform = await host.ready(); }
  catch (error) { failure = { code: error instanceof ActionError ? error.code : "actions.plugin_unavailable", message: uiText.text("workbench.home-plugin-http.start-failed") }; }
  const registered = host.registered().flatMap(entry => {
    if (options?.shown && !options.shown.includes(entry.key)) return [];
    const registration = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.project_plugin_id === entry.key && item.manifest.plugin_id === entry.manifest.plugin_id);
    if (registration && !declaredStageContributionId(registration)) return [];
    return [{ project_plugin_id: entry.key, manifest: entry.manifest, workbench: registration?.workbench }];
  });
  const sideOnly = sideOpenedPlugins(registered);
  const draw = (entry: (typeof registered)[number], view: UiContribution & { readonly producer?: string }) => {
    const result = renderStagePage(view, options?.model(entry.project_plugin_id) ?? homeViewModel(entry.manifest.plugin_id), entry.project_plugin_id,
      options?.page_owner === entry.manifest.plugin_id, request => view.render(request), { manifest: platform?.supervisor.manifest(entry.manifest.plugin_id) ?? entry.manifest, client: entry.workbench,
        producer: view.producer ?? captureRuntimeStageOwner(platform, "home", entry)?.producer });
    if (result.page) page = result.page;
    if (result.html) html.push(result.html);
    if (result.panels) panels[entry.project_plugin_id] = result.panels;
    if (result.overlays) overlays.push(result.overlays);
    surfaces.push(...result.surfaces);
  };
  for (const entry of registered.filter(entry => !Object.hasOwn(sideOnly, entry.project_plugin_id)
    || options?.views && Object.hasOwn(options.views, `home:${entry.project_plugin_id}`))) {
    const pluginId = entry.manifest.plugin_id, stage = stageContributionId(entry.manifest), key = `home:${entry.project_plugin_id}`;
    if (options?.views && !Object.hasOwn(options.views, key)) continue;
    if (host.hasPackage(pluginId)) {
      const release = host.packageStage(pluginId), record = host.installation(pluginId);
      const actual = captureRuntimeStageOwner(platform, "home", entry);
      if (release && record && actual) {
        html.push(installedStageSection({ pluginId, surface: release.pluginId, installation: installedStageIdentity("home", record), label: installedPluginWords(release).name, icon: entry.manifest.ui?.views?.find(view => view.slot === "stage")?.icon, prefix: options?.project_id ? `/projects/${encodeURIComponent(options.project_id)}` : "" }));
        surfaces.push({ contribution_id: actual.view.descriptor.contribution_id, surface: "workbench" });
      }
      else unavailable.push(homeUnavailableStage(host, platform, failure, entry));
      continue;
    }
    const view = options?.views ? options.views[key] : stage ? homeStageView(host, platform, pluginId, stage) : undefined;
    if (!options?.views && host.dualInstance(pluginId) && !view) continue;
    if (view) {
      try { draw(entry, view); }
      catch (error) { unavailable.push(homeUnavailableStage(host, platform, { code: error instanceof ActionError ? error.code : "actions.plugin_unavailable", message: uiText.text("workbench.home-plugin-http.start-failed") }, entry)); }
    } else unavailable.push(homeUnavailableStage(host, platform, failure, entry));
  }
  return { html, panels, overlays, surfaces, unavailable, ...(page ? { page } : {}) };
}

/**
 * The Home's placeholder for a plugin's stage: the start failure, else why an installed package did not come back, else the
 * supervisor's message, else what the instance's state says.
 */
function homeUnavailableStage(host: HomePluginHost, platform: HomePluginPlatform | undefined, failure: { code: string; message: string } | undefined,
  entry: { project_plugin_id: string; manifest: PluginManifest }): UnavailablePluginStage {
  const install = platform ? host.installation(entry.manifest.plugin_id) : null;
  const state = platform?.supervisor.state(entry.manifest.plugin_id);
  return { ...(state ? { status: state.status === "running" ? undefined : state.status, code: state.code } : { code: failure?.code }), surface: entry.project_plugin_id, label: entry.manifest.name, scope: "home",
    reason: failure?.message ?? (state?.status === "starting" ? uiText.text("workbench.home-plugin-http.starting") : null) ?? host.packageError(entry.manifest.plugin_id) ?? state?.message
      ?? uiText.text(install?.state === "running" ? "workbench.home-plugin-http.plugin-page-not-registered" : "workbench.home-plugin-http.plugin-disabled") };
}

/** The running Home instance's view of this stage: the contribution the Manifest names, with its `workbench` surface. */
function homeStageView(host: HomePluginHost, platform: HomePluginPlatform | undefined, pluginId: string, contributionId: string) {
  const install = platform ? host.installation(pluginId) : null;
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
  let platform: HomePluginPlatform | undefined, failure: { code: string; message: string } | undefined;
  try { platform = await host.ready(); }
  catch (error) { failure = { code: error instanceof ActionError ? error.code : "actions.plugin_unavailable", message: uiText.text("workbench.home-plugin-http.start-failed") }; }
  return currentHomeStageHalves(host, platform, failure);
}

/** The same projection from the live Home, without opening it or waiting for startup. */
export function currentHomeStageHalves(host?: HomePluginHost, platform = host?.surfacePlatform(), failure?: { code: string; message: string }): HomeStageHalves | undefined {
  if (!host) return undefined;
  const entries = host.registered().map(entry => ({ project_plugin_id: entry.key, manifest: entry.manifest }));
  const outsideCatalog = entries.filter(entry => host.dualInstance(entry.manifest.plugin_id)
    && !PLATFORM_PLUGIN_REGISTRATIONS.some(item => item.project_plugin_id === entry.project_plugin_id && item.manifest.plugin_id === entry.manifest.plugin_id));
  return { outsideCatalog, entries,
    owner: entry => captureRuntimeStageOwner(platform, "home", entry),
    hasPackage: pluginId => host.hasPackage(pluginId),
    dualInstance: pluginId => host.dualInstance(pluginId),
    half: (pluginId, contributionId) => ({ running: platform ? host.installation(pluginId)?.state === "running" : false, view: homeStageView(host, platform, pluginId, contributionId) !== undefined }),
    unavailable: entry => homeUnavailableStage(host, platform, failure, entry) };
}
