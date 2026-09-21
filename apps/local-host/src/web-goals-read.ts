import type { IncomingMessage, ServerResponse } from "node:http";
import { renderWorkbenchGoalsReadRequest, renderWorkbenchGoalsPageRequest, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import type { GoalProjectApplication } from "./goal-project-application.js";
import type { LocalProjectDatabase } from "./project-database.js";
import { renderGoalArtifactContext } from "./artifact-native-plugin-http.js";
import { withSelectedEventDocument, type WebViewOptions } from "./web-view.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { createLocalHostWorkbenchRenderer } from "./workbench-renderer.js";
import type { SessionRuntimeResources, createSessionProjectOperations } from "./web-session.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { escapeHtml } from "@molis-ai/molis-work-design-system";
import {
  codingDirectoryPanel,
  codingWorkbenchPanel,
  type CodingSurfacePorts,
  diffStagePanel,
  filesDirectoryPanel,
  gitDirectoryPanel,
  workspaceDirectoryPanel,
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
  function settings(request: IncomingMessage, response: ServerResponse, url: URL, boardId: string,
    readWebView: () => MolisWorkWebView, coordinator: GoalProjectApplication, controlToken: string,
  ): boolean {
    const open = url.pathname === "/settings/guidance" ? "guidance"
      : url.pathname === "/settings/rules" ? "rules"
      : url.pathname === "/settings/planning" ? "planning"
      : url.pathname === "/settings/general" || url.pathname === "/settings" ? "general"
      : null;
    if (request.method === "GET" && open) {
      const view = readWebView();
      if (!view.project) {
        sendJson(response, 404, { error: "找不到这个 Molis Work 项目" });
        return true;
      }
      const embed = url.searchParams.get("embed") === "1";
      const html = renderMolisWorkProjectSettingsHub(
        view,
        coordinator.goalQueries.readProjectGuidance(boardId),
        coordinator.goals.planning.effectiveMethods(boardId),
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
  function fragments(request: IncomingMessage, response: ServerResponse, url: URL, boardId: string,
    store: LocalProjectDatabase, coordinator: GoalProjectApplication, readWebView: () => MolisWorkWebView,
  ): boolean {
    const renderedGoalsRead = renderWorkbenchGoalsReadRequest(request.method, url.pathname, url.searchParams, () => {
      const view = readWebView();
      const eventView = (goalId?: string, collection: "current" | "archive" | "trash" = "current") => withSelectedGoalDocument(
        view, boardId, goalId, coordinator, store, collection,
      );
      return {
        refresh: (goalId, collection) => renderMolisWorkRefreshFragment(
          eventView(goalId, collection),
          goalId,
          collection === "archive",
          collection === "trash",
        ),
        momentum: (goalId, collection) => renderMolisWorkMomentumFragment(view, goalId, collection),
        document: (goalId, collection) => renderGoalDocumentFragment(eventView(goalId, collection), goalId, collection),
      };
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
    homeDirectory: string | undefined, readWebView: () => MolisWorkWebView, sessionResources: Promise<SessionRuntimeResources>, controlToken: string,
    coordinator?: GoalProjectApplication, store?: LocalProjectDatabase,
    codingServices?: Pick<CodingSurfacePorts, "capabilities" | "execution" | "homeDirectory">,
  ): Promise<boolean> {
    const renderedGoalsPage = await renderWorkbenchGoalsPageRequest(
      request.method, url.pathname, readWebView,
      async (view, { goalId: requestedGoalId, archiveView, trashView, decisionView }) => {
        const desktopShell = isDesktopShellRequest(request, url);
        const projectConfiguration = options.project ? await withMolisWorkProjectCatalog({ homeDirectory }, catalog => ({
          plugins: catalog.listProjectPlugins(options.project!.project_id),
          workspaces: catalog.listWorkspaceDirectory(options.project!.project_id),
        })) : null;
        if (projectConfiguration) view = { ...view, enabled_plugins: projectConfiguration.plugins };
        // Ask the running Coding Plugin for its own directory panel. A Plugin
        // that is not running, or that fails, simply contributes nothing and the
        // shell renders exactly as before.
        if (store && projectConfiguration !== null) {
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
          // Each Plugin contributes its own panel, and only the ones this
          // project enabled. A Plugin that is not running, or that fails,
          // contributes nothing and the shell renders exactly as before.
          const panels: Record<string, string> = {};
          for (const [pluginId, surface] of [
            ["coding", projectConfiguration.plugins.includes("coding")
              ? await codingDirectoryPanel(surfacePorts) : null],
            ["workspace", projectConfiguration.plugins.includes("workspace")
              ? await workspaceDirectoryPanel(surfacePorts) : null],
            ["files", projectConfiguration.plugins.includes("files")
              ? await filesDirectoryPanel(surfacePorts) : null],
            ["git", projectConfiguration.plugins.includes("git")
              ? await gitDirectoryPanel(surfacePorts) : null],
            ["diff", projectConfiguration.plugins.includes("diff")
              ? await diffStagePanel(surfacePorts) : null],
          ] as const) {
            void pluginId;
            if (surface) panels[surface.plugin_id] = surface.panel;
          }
          if (Object.keys(panels).length > 0) view = { ...view, plugin_panels: panels };
          if (projectConfiguration.plugins.includes("coding")) {
            const stage = await codingWorkbenchPanel(surfacePorts);
            if (stage) view = { ...view, plugin_stages: [stage.panel] };
          }
        }
        const operations = options.project
          ? sessionProjectOperationsData(
              await sessionResources,
              options.project.project_id,
              view,
              options.projects,
              projectConfiguration!.workspaces,
            )
          : { sessions: [], workspaces: [] };
        return renderMolisWorkWeb(
          coordinator && store
            ? withSelectedGoalDocument(
                view,
                options.boardId,
                requestedGoalId ?? view.active_goal_id ?? undefined,
                coordinator,
                store,
                trashView ? "trash" : archiveView ? "archive" : "current",
              )
            : coordinator
              ? withSelectedEventDocument(view, options.boardId, requestedGoalId ?? view.active_goal_id ?? undefined, coordinator.goalEvents, coordinator.goals.planning.effectiveMethods(options.boardId))
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

function withSelectedGoalDocument(
  view: MolisWorkWebView,
  boardId: string,
  goalId: string | undefined,
  coordinator: GoalProjectApplication,
  store: LocalProjectDatabase,
  collection: "current" | "archive" | "trash" = "current",
): MolisWorkWebView {
  const eventView = withSelectedEventDocument(
    view,
    boardId,
    goalId,
    coordinator.goalEvents,
    coordinator.goals.planning.effectiveMethods(boardId),
  );
  if (!goalId || collection === "trash") return eventView;
  const visible = collection === "archive" ? eventView.archived_goals : eventView.goals;
  if (!visible.some((item) => item.goal.goal_id === goalId)) return eventView;
  const html = renderGoalArtifactContext({
    boardId,
    goalId,
    artifacts: coordinator.artifacts.query,
    ledger: createContextLedger(store.db, {
      authorize: (access, operation) => operation === "read" && access.scope.kind === "personal" && access.scope.id === boardId,
    }).query,
  });
  const decorate = (item: MolisWorkWebView["goals"][number]) =>
    item.goal.goal_id === goalId ? { ...item, artifact_embed_html: html } : item;
  return {
    ...eventView,
    goals: eventView.goals.map(decorate),
    archived_goals: eventView.archived_goals.map(decorate),
    trashed_goals: eventView.trashed_goals.map(decorate),
  };
}
