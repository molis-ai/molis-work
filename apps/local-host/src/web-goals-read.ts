import { hostLog } from "./host-log.js";
import { installedPluginStages } from "./plugin-builder/agent-surface.js";
import { configuredModelChoices } from "./configured-models.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { declaredArtifactTypes, renderCharacters, renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsPageRequest, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { shownProjectPlugins } from "./plugin-registry.js";
import { goalsActions, resolveGoalsReadRoute } from "@molis-ai/molis-work-plugin-goals";
import { actionErrorBody, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { artifactsActions } from "@molis-ai/molis-work-plugin-artifacts";
import { ActionError, type BoundActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalProjectDatabase } from "./project-database.js";
import { renderGoalArtifactContext } from "./artifact-native-plugin-http.js";
import { lookingForArea, withSelectedEventDocument, type WebViewOptions } from "./web-view.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { L } from "./web-locale.js";
import { ensureProjectPlugins } from "./project-plugins.js";
import { renderProjectRuntimeStages, type ProjectPluginSurfacePorts } from "./project-plugin-stages.js";


/** The page still opens without the installed plugins' entries; why they are missing is written. */
/** The project settings page each path opens; `/settings` alone opens 常规. */
const SETTINGS_SECTIONS = new Map((["workspaces", "guidance", "memory", "knowledge", "rules", "planning", "general"] as const)
  .map(section => [`/settings/${section}` as string, section] as const)).set("/settings", "general");
const noInstalledStages = (error: unknown): [] => { hostLog.warn("plugins", "installed_stages_unavailable", error); return []; };
/**
 * Opening the project page starts the project's plugin platform; the stages read what it runs: every declared stage of a plugin
 * the Runtime runs, drawn by its running instance (W5-06), the Coding page's companions included (they fill the slots its view
 * opens). The 角色 page is the Host's own (CHR-1): the settings cover shows it inside the project, and its client mounts when it
 * is first shown.
 */
async function projectPluginStages(ports: ProjectPluginSurfacePorts, view: MolisWorkWebView,
  configuration: { readonly plugins: readonly string[]; readonly hidden: readonly string[] },
  model: (projectPluginId: string, view: MolisWorkWebView) => unknown) {
  const record = await ensureProjectPlugins(ports);
  const runtime = renderProjectRuntimeStages(record, ports.store, { shown: shownProjectPlugins(configuration.plugins, configuration.hidden),
    drawn: view.plugin_stage_ids ?? [], model: projectPluginId => model(projectPluginId, view) });
  const characters = renderCharacters({ route_prefix: ports.routePrefix ?? "", primitives: { escape: value => escapeHtml(String(value)) } });
  return { html: [characters, ...runtime.html], ids: runtime.ids, unavailable: runtime.unavailable };
}
export function createLocalGoalsReadHttp(ports: {
  withCatalog: LocalWebCatalogRunner;
  renderer: Pick<ReturnType<typeof createLocalHostWorkbenchRenderer>, "renderMolisWorkProjectSettingsHub" | "renderMolisWorkMomentumFragment" | "renderMolisWorkRefreshFragment" | "renderMolisWorkWeb" | "renderGoalDocumentFragment" | "declaredStageModel">;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
}) {
  const { withCatalog: withMolisWorkProjectCatalog, isDesktopShellRequest, pageCsp: PAGE_CSP } = ports;
  const { renderMolisWorkProjectSettingsHub, renderMolisWorkMomentumFragment, renderMolisWorkRefreshFragment, renderMolisWorkWeb, renderGoalDocumentFragment, declaredStageModel } = ports.renderer;
  async function settings(request: IncomingMessage, response: ServerResponse, url: URL,
    readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, controlToken: string, actions: BoundActionClient,
  ): Promise<boolean> {
    const open = SETTINGS_SECTIONS.get(url.pathname) ?? null;
    if (request.method === "GET" && open) {
      const view = await readWebView();
      if (!view.project) {
        sendJson(response, 404, { error: "找不到这个 Molis Work 项目" });
        return true;
      }
      const embed = url.searchParams.get("embed") === "1";
      let methods, guidance, policy;
      try {
        [methods, guidance, policy] = await Promise.all([actions.invoke(goalsActions.planningRead, {}).then(value => value.methods),
          actions.invoke(goalsActions.guidanceRead, {}), actions.invoke(goalsActions.policyHistory, {})]);
      }
      catch (error) { sendJson(response, actionHttpStatus(error), actionErrorBody(error)); return true; }
      const html = renderMolisWorkProjectSettingsHub(
        { ...view, policy_bindings: policy.bindings },
        guidance,
        methods,
        controlToken,
        isDesktopShellRequest(request, url),
        open,
        embed ? open : null,
      );
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": PAGE_CSP,
        "x-content-type-options": "nosniff",
      });
      response.end(html);
      return true;
    }
    return false;
  }
  async function fragments(request: IncomingMessage, response: ServerResponse, url: URL,
    readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, goalActions: BoundActionClient, actions: BoundActionClient,
  ): Promise<boolean> {
    if (request.method !== "GET") return false;
    const resolved = resolveGoalsReadRoute(url.pathname, url.searchParams);
    if (!resolved) return false;
    if ("error" in resolved) { sendJson(response, resolved.status, { error: resolved.error }); return true; }
    const route = resolved.route;
    const view = await readWebView();
    const selected = route.kind === "momentum" ? view : await withSelectedGoalDocument(view, route.goal_id, goalActions, actions, route.collection);
    const renderedGoalsRead = renderWorkbenchGoalsReadRoute(route, {
      refresh: (goalId, collection) => renderMolisWorkRefreshFragment(selected, goalId, collection === "archive", collection === "trash"),
      momentum: (goalId, collection) => renderMolisWorkMomentumFragment(view, goalId, collection),
      document: (goalId, collection) => renderGoalDocumentFragment(selected, goalId, collection),
    });
    if (renderedGoalsRead) {
      if ("error" in renderedGoalsRead) {
        sendJson(response, renderedGoalsRead.status, { error: renderedGoalsRead.error });
        return true;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(renderedGoalsRead.html);
      return true;
    }
    return false;
  }
  async function page(request: IncomingMessage, response: ServerResponse, url: URL, options: WebViewOptions,
    homeDirectory: string | undefined, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, controlToken: string, goalActions: BoundActionClient, artifactActions: BoundActionClient,
    store?: LocalProjectDatabase,
    pluginServices?: Pick<ProjectPluginSurfacePorts, "capabilities" | "actions" | "homeDirectory" | "artifacts" | "processItems">,
  ): Promise<boolean> {
    const renderedGoalsPage = await renderWorkbenchGoalsPageRequest(
      request.method, url.pathname, readWebView,
      async (view, { goalId: requestedGoalId, archiveView, trashView }) => {
        const desktopShell = isDesktopShellRequest(request, url);
        const projectConfiguration = options.project ? await withMolisWorkProjectCatalog({ homeDirectory }, catalog => ({
          plugins: catalog.listProjectPlugins(options.project!.project_id),
          hidden: catalog.listHiddenPlugins(options.project!.project_id),
          workspaces: catalog.listWorkspaceDirectory(options.project!.project_id),
        })) : null;
        if (projectConfiguration) view = { ...view, enabled_plugins: projectConfiguration.plugins, hidden_plugins: projectConfiguration.hidden };
        // The project's Runtime draws its plugins' panels and stages; one that is not running gets the unavailable shell (W5-06).
        // Only the fixture server (one database, no project catalog: `fixtureWebBoardOptions`) has no project here; no Runtime
        // runs there, so the shell draws the declared stages from the catalog.
        if (store && projectConfiguration !== null) {
          if (!pluginServices) throw new Error("项目插件缺少统一动作服务装配");
          const surfacePorts = {
            ...pluginServices,
            store,
            projectId: options.projectId,
            actorId: LOCAL_PERSON_ACTOR_ID,
            escapeHtml,
            translate: (value: string) => value,
            workspaces: projectConfiguration.workspaces,
            routePrefix: view.route_prefix,
          };
          const builtinStages = await projectPluginStages(surfacePorts, view, projectConfiguration, declaredStageModel);
          view = { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...builtinStages.html], plugin_stage_ids: [...(view.plugin_stage_ids ?? []), ...builtinStages.ids], unavailable_plugin_stages: [...(view.unavailable_plugin_stages ?? []), ...builtinStages.unavailable] };
          // Installed execution supplies rail entries and stages independently of opening the authoring studio.
          const installed = await installedPluginStages({ store, projectId: options.projectId, homeDirectory, routePrefix: view.route_prefix,
            models: async () => homeDirectory ? configuredModelChoices(homeDirectory) : [], actorId: LOCAL_PERSON_ACTOR_ID, actions: pluginServices.actions,
            ...(pluginServices.capabilities ? { capabilities: pluginServices.capabilities } : {}) }).catch(noInstalledStages);
          if (installed.length) view = { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...installed.map(item => item.stage)], plugin_rail: installed.map(({ surface, label }) => ({ surface, label })) };
        }
        if (url.searchParams.has("workbenchPane")) view = { ...view, pane_plugin: url.searchParams.get("panePlugin") || "home" };
        return renderMolisWorkWeb(
          store
            ? await withSelectedGoalDocument(
                view,
                requestedGoalId ?? view.active_goal_id ?? undefined,
                goalActions,
                artifactActions,
                trashView ? "trash" : archiveView ? "archive" : "current",
              )
            : view,
          requestedGoalId,
          archiveView,
          trashView,
          controlToken,
          desktopShell,
          {},
        );
    });
    if (renderedGoalsPage) {
      if ("error" in renderedGoalsPage) {
        sendJson(response, renderedGoalsPage.status, { error: renderedGoalsPage.error });
        return true;
      }
      const headers: Record<string, string> = {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": PAGE_CSP,
      };
      response.writeHead(200, headers);
      response.end(renderedGoalsPage.html);
      return true;
    }
    return false;
  }
  return { settings, fragments, page };
}

async function withSelectedGoalDocument(
  view: MolisWorkWebView,
  goalId: string | undefined,
  goalActions: BoundActionClient,
  actions: BoundActionClient,
  collection: "current" | "archive" | "trash" = "current",
): Promise<MolisWorkWebView> {
  const eventView = await withSelectedEventDocument(view, goalId, goalActions);
  if (!goalId) return eventView;
  const visible = collection === "trash" ? eventView.trashed_goals : collection === "archive" ? eventView.archived_goals : eventView.goals;
  if (!visible.some((item) => item.goal.goal_id === goalId)) return eventView;
  const [relations, history, resolved] = await Promise.all([
    goalActions.invoke(goalsActions.relations, { goal_id: goalId }),
    goalActions.invoke(goalsActions.policyHistory, {}),
    goalActions.invoke(goalsActions.policyResolve, { goal_id: goalId }),
  ]);
  const policyBindings = history.bindings.filter(binding => binding.goal_id === null || binding.goal_id === goalId);
  let html: string | undefined, outputs = 0;
  let inputs: Array<{ artifact_id: string; version: number; title: string; state: "available" | "unavailable" | "archived" | "missing"; reason: string | null }> = [];
  if (collection !== "trash") try {
    // Every declared 成果 type has an owner that reads it (artifact-positioning A4): none of them is "no compatible plugin".
    const { embeds } = await lookingForArea(() => actions.invoke(artifactsActions.goalEmbeds, { goal_id: goalId, supported_types: declaredArtifactTypes() }));
    // The card under 「完成要求」 is what the Goal hands in; its fixed inputs are listed with the rest of its inputs (五.1).
    const delivered = embeds.filter(embed => embed.relationship === "output");
    html = renderGoalArtifactContext(delivered);
    // What the Goal hands in shows on its overview too (F6), not only under 「完成要求」.
    outputs = delivered.length;
    inputs = embeds.filter(embed => embed.relationship === "input" && embed.view.requested).map(embed => {
      const selected = embed.view.selected;
      return { artifact_id: embed.view.requested!.artifact_id, version: embed.view.requested!.version, title: selected?.title ?? embed.view.requested!.artifact_id,
        state: !selected ? "missing" : selected.availability !== "available" ? "unavailable" : selected.lifecycle_state === "archived" ? "archived" : "available",
        reason: selected?.unavailable_reason ?? null };
    });
  } catch (error) {
    if (!(error instanceof ActionError) || !["actions.plugin_disabled", "actions.forbidden", "actions.missing"].includes(error.code)) throw error;
    // An unavailable optional reader must not prevent opening the Goal itself.
    // Keep the relation data untouched and show why its contents cannot be read.
    html = `<p class="empty-state" data-artifact-unavailable>${escapeHtml(L(error.message))}</p>`;
  }
  const decorate = (item: MolisWorkWebView["goals"][number]) =>
    item.goal.goal_id === goalId ? { ...item, relations: relations.relations, policy_bindings: policyBindings, resolved_policy: resolved.policy,
      ...(html === undefined ? {} : { artifact_embed_html: html, artifact_outputs: outputs, artifact_inputs: inputs }) } : item;
  return {
    ...eventView,
    goals: eventView.goals.map(decorate),
    archived_goals: eventView.archived_goals.map(decorate),
    trashed_goals: eventView.trashed_goals.map(decorate),
  };
}
