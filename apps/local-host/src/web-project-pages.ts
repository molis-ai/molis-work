import { readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";
import { installedPluginStages } from "./installed-plugin-http.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { declaredArtifactTypes } from "./artifact-type-registry.js";
import { matchPageRoute } from "./page-routes.js";
import { builtinPluginByManifestId } from "./plugin-registry.js";
import { actionErrorBody, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { ActionError, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalProjectDatabase } from "./project-database.js";
import { renderProjectArtifactContext } from "./artifact-library-http.js";
import type { ReadArtifactDisplay } from "./artifact-display-words.js";
import { lookingForArea, type MolisWorkWebView, type WebViewOptions } from "./web-view.js";
import { PROJECT_SETTINGS_SECTIONS, type LocalWebCatalogRunner } from "./web-project-settings.js";
import { renderWorkbenchRefreshDocument, type createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ensureProjectPlugins, projectPluginPlatforms, type ProjectPluginState } from "./project-plugins.js";
import { renderProjectRuntimeStages, stageErrorsOf, type ProjectPluginSurfacePorts } from "./project-plugin-stages.js";
import { homeStageHalves } from "./home-plugin-http.js";
import { builtinMarketDirectory, mergePluginDirectories, runningPluginDirectory } from "./plugin-directory.js";
import { isInstalledPackage } from "./installed-plugin-common.js";
import { pinnedProjectGuidanceRead } from "./project-guidance-actions.js";

const noInstalledStages = (error: unknown): [] => { hostLog.warn("plugins", "installed_stages_unavailable", error); return []; };

interface StageRouteError {
  readonly status: number;
  readonly error: string;
  readonly code?: string;
}

interface StageRoutePayload {
  readonly artifact_subject_id?: string | null;
  readonly body_attributes?: Readonly<Record<string, string | boolean | null | undefined>>;
  readonly route_error?: StageRouteError;
}

function asStagePayload(value: unknown): StageRoutePayload | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StageRoutePayload : null;
}

function redirectProjectRules(response: ServerResponse, projectId: string, desktop: boolean): true {
  const query = new URLSearchParams({ view: "project-rules", project: projectId });
  if (desktop) query.set("desktop", "1");
  response.writeHead(302, { location: `/settings/authorizations?${query}`, "cache-control": "no-store" });
  response.end();
  return true;
}

async function projectSettingsRequirements(homeDirectory: string | undefined, store: LocalProjectDatabase, projectId: string, withCatalog: LocalWebCatalogRunner) {
  const installed = new Set(readPluginRuntimeRecords(store.db).filter(record => record.state !== "uninstalled").map(record => record.plugin_id));
  return withCatalog({ homeDirectory }, catalog => catalog.projectPluginRequirements(projectId)
    .map(plugin => ({ plugin_id: plugin.plugin_id, installed: plugin.installed || installed.has(plugin.plugin_id) })));
}

function installedPackageOn(platform: NonNullable<ProjectPluginState["platform"]>, pluginId: string): boolean {
  const installId = platform.supervisor.state(pluginId)?.install_id;
  if (!installId) return false;
  try { return isInstalledPackage(platform.runtime.get(installId)); }
  catch { return false; }
}

async function projectPluginStages(ports: ProjectPluginSurfacePorts, view: MolisWorkWebView,
  configuration: { readonly plugins: readonly string[]; readonly hidden: readonly string[] },
  model: (projectPluginId: string, view: MolisWorkWebView) => unknown) {
  const record = await ensureProjectPlugins(ports);
  // The installed packages run on this platform too (47-1 B), but their entries are the installed host's, keyed by their installation
  // (`installedPluginStages`): listed here under the plugin id they would take the id of a Home plugin by another publisher (BL-586).
  // A plugin with a library in each partition runs as its own instance here (batch 107); its entry is that instance's.
  const directory = projectPluginPlatforms(record).flatMap(platform => runningPluginDirectory(platform.supervisor).filter(entry => entry.chosen || !installedPackageOn(platform, entry.plugin_id)));
  const stageView = { ...view, plugin_directory: mergePluginDirectories(directory, view.plugin_directory ?? [], builtinMarketDirectory()) };
  const runtime = renderProjectRuntimeStages(record, ports.store, { shown: view.shown_plugins ?? [...configuration.plugins],
    drawn: view.plugin_stage_surfaces ?? [], views: view.plugin_stage_views, page_owner: view.page_owner, model: projectPluginId => model(projectPluginId, stageView), home: await homeStageHalves(ports.homePlugins),
    ...(ports.homeDirectory ? { homeDirectory: ports.homeDirectory } : {}) });
  return { html: runtime.html, panels: runtime.panels, overlays: runtime.overlays, surfaces: runtime.surfaces, unavailable: runtime.unavailable, page: runtime.page,
    directory };
}

async function withProjectPluginSurfaces(view: MolisWorkWebView, input: {
  store: LocalProjectDatabase; projectId: string; homeDirectory: string | undefined;
  configuration: { readonly plugins: readonly string[]; readonly hidden: readonly string[] };
  pluginServices: Pick<ProjectPluginSurfacePorts, "dependencyCheck" | "actions" | "homeDirectory" | "artifacts" | "processItems" | "homePlugins">;
  stageModel: (projectPluginId: string, view: MolisWorkWebView) => unknown;
}): Promise<MolisWorkWebView> {
  const { store, homeDirectory, pluginServices } = input;
  const surfacePorts = { ...pluginServices, store, projectId: input.projectId, actorId: LOCAL_PERSON_ACTOR_ID, escapeHtml,
    translate: (value: string) => value, routePrefix: view.route_prefix };
  const builtin = await projectPluginStages(surfacePorts, view, input.configuration, input.stageModel);
  view = { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...builtin.html], plugin_stage_surfaces: [...(view.plugin_stage_surfaces ?? []), ...builtin.surfaces],
    plugin_panels: { ...view.plugin_panels, ...builtin.panels }, plugin_overlays: [...(view.plugin_overlays ?? []), ...builtin.overlays],
    ...(builtin.page ? { page_stage: builtin.page } : {}),
    unavailable_plugin_stages: [...(view.unavailable_plugin_stages ?? []), ...builtin.unavailable] };
  const installed = await installedPluginStages({ store, projectId: input.projectId, homeDirectory, routePrefix: view.route_prefix,
    actorId: LOCAL_PERSON_ACTOR_ID, actions: pluginServices.actions,
    ...(pluginServices.dependencyCheck ? { dependencyCheck: pluginServices.dependencyCheck } : {}) }).catch(noInstalledStages);
  return { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...installed.flatMap(item => item.stage ? [item.stage] : [])],
    unavailable_plugin_stages: [...(view.unavailable_plugin_stages ?? []), ...installed.flatMap(item => item.unavailable ? [item.unavailable] : [])],
    plugin_directory: mergePluginDirectories(builtin.directory, view.plugin_directory ?? [], installed.map(item => item.directory), builtinMarketDirectory()) };
}

async function readSubjectArtifactContext(subjectId: string, actions: BoundActionClient, readArtifactDisplay: ReadArtifactDisplay) {
  let html: string | undefined, outputs = 0;
  let inputs: Array<{ artifact_id: string; version: number; title: string; state: "available" | "unavailable" | "archived" | "missing"; reason: string | null }> = [];
  try {
    const { embeds } = await lookingForArea(() => actions.invoke(artifactsActions.subjectEmbeds, { subject_id: subjectId, supported_types: declaredArtifactTypes() }));
    const delivered = embeds.filter(embed => embed.relationship === "output");
    html = await renderProjectArtifactContext(delivered, readArtifactDisplay);
    outputs = delivered.length;
    inputs = embeds.filter(embed => embed.relationship === "input" && embed.view.requested).map(embed => {
      const selected = embed.view.selected;
      return { artifact_id: embed.view.requested!.artifact_id, version: embed.view.requested!.version, title: selected?.title ?? embed.view.requested!.artifact_id,
        state: !selected ? "missing" : selected.availability !== "available" ? "unavailable" : selected.lifecycle_state === "archived" ? "archived" : "available",
        reason: selected?.unavailable_reason ?? null };
    });
  } catch (error) {
    if (!(error instanceof ActionError) || !["actions.plugin_disabled", "actions.forbidden", "actions.missing"].includes(error.code)) throw error;
    html = `<p class="empty-state" data-artifact-unavailable>${escapeHtml(error.message)}</p>`;
  }
  return { subject_id: subjectId, ...(html === undefined ? {} : { html, outputs, inputs }) };
}

async function withStageArtifactContexts(view: MolisWorkWebView, artifactActions: BoundActionClient, readArtifactDisplay: ReadArtifactDisplay): Promise<MolisWorkWebView> {
  if (!view.stage_data) return view;
  const next: Record<string, unknown> = { ...view.stage_data };
  let changed = false;
  for (const [key, value] of Object.entries(view.stage_data)) {
    const payload = asStagePayload(value);
    if (!payload?.artifact_subject_id) continue;
    const artifact_context = await readSubjectArtifactContext(payload.artifact_subject_id, artifactActions, readArtifactDisplay);
    next[key] = { ...payload, artifact_context };
    changed = true;
  }
  return changed ? { ...view, stage_data: next } : view;
}

/** Platform project page, declared fragment, and project settings HTTP dispatcher; imports no plugin package (PEQ-03). */
export function createLocalProjectPagesHttp(ports: {
  withCatalog: LocalWebCatalogRunner;
  renderer: Pick<ReturnType<typeof createLocalHostWorkbenchRenderer>, "renderMolisWorkProjectSettingsHub" | "declaredPageSurface" | "renderMolisWorkWeb" | "declaredStageModel">;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}) {
  const { withCatalog: withMolisWorkProjectCatalog, isDesktopShellRequest, pageCsp: PAGE_CSP } = ports;
  const { renderMolisWorkProjectSettingsHub, declaredPageSurface, renderMolisWorkWeb, declaredStageModel } = ports.renderer;

  async function settings(request: IncomingMessage, response: ServerResponse, url: URL,
    readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, controlToken: string, actions: BoundActionClient,
    store: LocalProjectDatabase, homeDirectory?: string,
  ): Promise<boolean> {
    const open = PROJECT_SETTINGS_SECTIONS.get(url.pathname) ?? null;
    if (request.method === "GET" && open) {
      const view = await readWebView();
      if (!view.project) {
        sendJson(response, 404, { error: "找不到这个 Molis Work 项目" });
        return true;
      }
      const embed = url.searchParams.get("embed") === "1";
      if (open === "rules") return redirectProjectRules(response, view.project.project_id, isDesktopShellRequest(request, url));
      let guidance;
      if (open === "guidance") {
        try { guidance = await actions.invoke(pinnedProjectGuidanceRead, {}); }
        catch (error) { sendJson(response, actionHttpStatus(error), actionErrorBody(error)); return true; }
      }
      const html = renderMolisWorkProjectSettingsHub(
        { ...view, project: { ...view.project, plugin_requirements: await projectSettingsRequirements(homeDirectory, store, view.project.project_id, withMolisWorkProjectCatalog) } },
        guidance, controlToken, isDesktopShellRequest(request, url), open, embed ? open : null,
      );
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP, "x-content-type-options": "nosniff" });
      response.end(html);
      return true;
    }
    return false;
  }

  async function fragments(request: IncomingMessage, response: ServerResponse, url: URL,
    readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, artifactActions: BoundActionClient,
    readArtifactDisplay: ReadArtifactDisplay,
  ): Promise<boolean> {
    if (request.method !== "GET") return false;
    const match = matchPageRoute(url);
    if (!match || (match.kind !== "fragment" && match.kind !== "refresh_document")) return false;
    if (match.rejected) {
      const status = match.kind === "fragment" && !url.searchParams.has(match.rejected.param) ? 404 : 400;
      sendJson(response, status, { error: status === 404 ? "页面内容不存在" : "页面请求参数无效" });
      return true;
    }
    const owner = builtinPluginByManifestId(match.plugin_id);
    const view = await readWebView();
    if (!owner || !view.shown_plugins?.includes(owner.project_plugin_id)) {
      sendJson(response, 404, { error: "页面内容不存在" });
      return true;
    }
    const stageError = stageErrorsOf(view)?.[owner.project_plugin_id];
    if (stageError) {
      sendJson(response, actionHttpStatus(stageError), actionErrorBody(stageError));
      return true;
    }
    const rawStage = view.stage_data?.[owner.project_plugin_id];
    const payload = asStagePayload(rawStage);
    if (payload?.route_error) {
      const { status, error, code } = payload.route_error;
      sendJson(response, status, { error, ...(code ? { code } : {}) });
      return true;
    }
    const stageData = payload?.artifact_subject_id
      ? { ...payload, artifact_context: await readSubjectArtifactContext(payload.artifact_subject_id, artifactActions, readArtifactDisplay) }
      : rawStage;
    const rendered = declaredPageSurface(match.plugin_id, match.route_id, view, stageData, match.params);
    if (!rendered && match.kind === "fragment") {
      sendJson(response, 404, { error: "页面内容不存在" });
      return true;
    }
    const html = match.kind === "refresh_document"
      ? renderWorkbenchRefreshDocument({ body_html: rendered, body_attributes: payload?.body_attributes ?? {} })
      : rendered;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    response.end(html);
    return true;
  }

  async function page(request: IncomingMessage, response: ServerResponse, url: URL, options: WebViewOptions,
    homeDirectory: string | undefined, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, controlToken: string, artifactActions: BoundActionClient,
    readArtifactDisplay: ReadArtifactDisplay, store?: LocalProjectDatabase,
    pluginServices?: Pick<ProjectPluginSurfacePorts, "dependencyCheck" | "actions" | "homeDirectory" | "artifacts" | "processItems" | "homePlugins">,
  ): Promise<boolean> {
    if (request.method !== "GET") return false;
    const match = matchPageRoute(url);
    const isRoot = url.pathname === "/";
    if (!isRoot && (!match || match.kind !== "page")) return false;
    if (match?.rejected) { sendJson(response, 404, { error: "页面不存在" }); return true; }
    let view = await readWebView();
    if (!isRoot && match) {
      const owner = builtinPluginByManifestId(match.plugin_id);
      if (!owner || !view.shown_plugins?.includes(owner.project_plugin_id)) {
        sendJson(response, 404, { error: "页面不存在" });
        return true;
      }
      const stageError = stageErrorsOf(view)?.[owner.project_plugin_id];
      if (stageError) {
        sendJson(response, actionHttpStatus(stageError), actionErrorBody(stageError));
        return true;
      }
      const routeError = asStagePayload(view.stage_data?.[owner.project_plugin_id])?.route_error;
      if (routeError) {
        sendJson(response, routeError.status, { error: routeError.error });
        return true;
      }
    }
    const desktopShell = isDesktopShellRequest(request, url);
    const projectConfiguration = options.project
      ? await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.projectPluginMembership(options.project!.project_id))
      : null;
    if (projectConfiguration) {
      view = { ...view, enabled_plugins: projectConfiguration.plugins, hidden_plugins: projectConfiguration.hidden,
        project: view.project && store ? { ...view.project, plugin_requirements: await projectSettingsRequirements(homeDirectory, store, view.project.project_id, withMolisWorkProjectCatalog) } : view.project };
    }
    if (store) view = await withStageArtifactContexts(view, artifactActions, readArtifactDisplay);
    if (store && projectConfiguration !== null) {
      if (!pluginServices) throw new Error("项目插件缺少统一动作服务装配");
      view = await withProjectPluginSurfaces(view, { store, projectId: options.projectId, homeDirectory, configuration: projectConfiguration, pluginServices, stageModel: declaredStageModel });
    }
    if (url.searchParams.has("workbenchPane")) view = { ...view, pane_plugin: url.searchParams.get("panePlugin") || "home" };
    else if (url.searchParams.has("openPlugin")) view = { ...view, initial_plugin: url.searchParams.get("openPlugin") || undefined };
    const html = renderMolisWorkWeb(view, controlToken, desktopShell);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP });
    response.end(html);
    return true;
  }

  return { settings, fragments, page };
}
