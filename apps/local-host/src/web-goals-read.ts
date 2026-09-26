import { builderWorkbenchPanel } from "./plugin-builder-surface.js";
import { installedPluginStages } from "./plugin-builder/agent-surface.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { availableProjectPluginIds, renderWorkbenchGoalsReadRoute, renderWorkbenchGoalsPageRequest, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { goalsActions, resolveGoalsReadRoute } from "@molis-ai/molis-work-plugin-goals";
import { artifactsActions } from "@molis-ai/molis-work-plugin-artifacts";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { renderGoalArtifactContext } from "./artifact-native-plugin-http.js";
import { withSelectedEventDocument, type WebViewOptions } from "./web-view.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import type { createSessionProjectOperations } from "./web-session.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import { L } from "./web-locale.js";
import {
  codingCompanionStages,
  codingWorkbenchPanel,
  charactersWorkbenchPanel,
  type CodingSurfacePorts,
} from "./coding-surface.js";

export function createLocalGoalsReadHttp(ports: {
  withCatalog: LocalWebCatalogRunner;
  renderer: Pick<ReturnType<typeof createLocalHostWorkbenchRenderer>, "renderMolisWorkProjectSettingsHub" | "renderMolisWorkMomentumFragment" | "renderMolisWorkRefreshFragment" | "renderMolisWorkWeb" | "renderGoalDocumentFragment">;
  isDesktopShellRequest(request: IncomingMessage, url: URL): boolean;
  pageCsp: string;
  sessionProjectOperationsData: ReturnType<typeof createSessionProjectOperations>;
}) {
  const { withCatalog: withMolisWorkProjectCatalog, isDesktopShellRequest, pageCsp: PAGE_CSP, sessionProjectOperationsData } = ports;
  const { renderMolisWorkProjectSettingsHub, renderMolisWorkMomentumFragment, renderMolisWorkRefreshFragment, renderMolisWorkWeb, renderGoalDocumentFragment } = ports.renderer;
  async function settings(request: IncomingMessage, response: ServerResponse, url: URL,
    readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, controlToken: string, actions: BoundActionClient,
  ): Promise<boolean> {
    const open = url.pathname === "/settings/workspaces" ? "workspaces"
      : url.pathname === "/settings/guidance" ? "guidance"
      : url.pathname === "/settings/rules" ? "rules"
      : url.pathname === "/settings/planning" ? "planning"
      : url.pathname === "/settings/general" || url.pathname === "/settings" ? "general"
      : null;
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
      catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) }); return true; }
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
    homeDirectory: string | undefined, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>, workActions: BoundActionClient, controlToken: string, goalActions: BoundActionClient, artifactActions: BoundActionClient,
    coordinator?: GoalProjectApplication, store?: LocalProjectDatabase,
    codingServices?: Pick<CodingSurfacePorts, "capabilities" | "actions" | "execution" | "homeDirectory" | "characterWorkspaces" | "characterSpawn">,
  ): Promise<boolean> {
    const renderedGoalsPage = await renderWorkbenchGoalsPageRequest(
      request.method, url.pathname, readWebView,
      async (view, { goalId: requestedGoalId, archiveView, trashView, decisionView }) => {
        const desktopShell = isDesktopShellRequest(request, url);
        const projectConfiguration = options.project ? await withMolisWorkProjectCatalog({ homeDirectory }, catalog => ({
          plugins: catalog.listProjectPlugins(options.project!.project_id),
          hidden: catalog.listHiddenPlugins(options.project!.project_id),
          workspaces: catalog.listWorkspaceDirectory(options.project!.project_id),
        })) : null;
        if (projectConfiguration) view = { ...view, enabled_plugins: projectConfiguration.plugins, hidden_plugins: projectConfiguration.hidden };
        // Ask the running Coding Plugin for its own directory panel. A Plugin
        // that is not running, or that fails, simply contributes nothing and the
        // shell renders exactly as before.
        if (store && projectConfiguration !== null) {
          if (!codingServices) throw new Error("项目插件缺少统一动作服务装配");
          const surfacePorts = {
            ...codingServices,
            store,
            boardId: options.boardId,
            actorId: "web-user",
            goalTitle: (goalId: string) => coordinator?.goalQueries.getGoal(options.boardId, goalId)?.title,
            escapeHtml,
            translate: (value: string) => value,
            workspaces: projectConfiguration.workspaces,
            routePrefix: view.route_prefix,
          };
          const characterStage = await charactersWorkbenchPanel(surfacePorts);
          view = { ...view, plugin_stages: [characterStage.panel, await builderWorkbenchPanel(surfacePorts), ...await codingCompanionStages(surfacePorts, projectConfiguration.plugins)] };
          // Plugins this project installed from the studio: a rail entry and a stage each. A studio that cannot open
          // (no local data directory) contributes nothing.
          const installed = await installedPluginStages({ store, boardId: options.boardId, homeDirectory, routePrefix: view.route_prefix,
            models: async () => await codingServices.execution?.models() ?? [], actorId: "web-user", actions: codingServices.actions,
            ...(codingServices.capabilities ? { capabilities: codingServices.capabilities } : {}) }).catch(() => []);
          if (installed.length) view = { ...view, plugin_stages: [...(view.plugin_stages ?? []), ...installed.map(item => item.stage)], plugin_rail: installed.map(({ surface, label }) => ({ surface, label })) };
          if (projectConfiguration.plugins.includes("coding")) {
            const stage = await codingWorkbenchPanel(surfacePorts);
            if (stage) view = { ...view, plugin_stages: [...(view.plugin_stages ?? []), stage.panel] };
          }
        }
        const operations = options.project && availableProjectPluginIds(projectConfiguration!.plugins).has("sessions")
          ? await sessionProjectOperationsData(
              workActions,
              options.project.project_id,
              view,
              options.projects,
              projectConfiguration!.workspaces,
            )
          : { sessions: [], workspaces: [] };
        return renderMolisWorkWeb(
          coordinator && store
            ? await withSelectedGoalDocument(
                view,
                requestedGoalId ?? view.active_goal_id ?? undefined,
                goalActions,
                artifactActions,
                trashView ? "trash" : archiveView ? "archive" : "current",
              )
            : coordinator
              ? await withSelectedEventDocument(view, requestedGoalId ?? view.active_goal_id ?? undefined, goalActions)
            : view,
          requestedGoalId,
          archiveView,
          decisionView,
          trashView,
          controlToken,
          desktopShell,
          {},
          operations,
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
  let html: string | undefined;
  if (collection !== "trash") try {
    const { embeds } = await actions.invoke(artifactsActions.goalEmbeds, { goal_id: goalId });
    html = renderGoalArtifactContext(embeds);
  } catch (error) {
    if (!(error instanceof ActionError) || !["actions.plugin_disabled", "actions.forbidden", "actions.missing"].includes(error.code)) throw error;
    // An unavailable optional reader must not prevent opening the Goal itself.
    // Keep the relation data untouched and show why its contents cannot be read.
    html = `<p class="empty-state" data-artifact-unavailable>${escapeHtml(L(error.message))}</p>`;
  }
  const decorate = (item: MolisWorkWebView["goals"][number]) =>
    item.goal.goal_id === goalId ? { ...item, relations: relations.relations, policy_bindings: policyBindings, resolved_policy: resolved.policy,
      ...(html === undefined ? {} : { artifact_embed_html: html }) } : item;
  return {
    ...eventView,
    goals: eventView.goals.map(decorate),
    archived_goals: eventView.archived_goals.map(decorate),
    trashed_goals: eventView.trashed_goals.map(decorate),
  };
}
