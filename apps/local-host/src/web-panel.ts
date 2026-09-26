import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkPanelHttp, type WorkPanelHttpContext } from "@molis-ai/molis-work-plugin-work";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { FeedStoreError, feedItemContext, readLinkedFeedContext } from "@molis-ai/molis-work-plugin-feed";
import { createContextLedger, createContextMaterializer } from "@molis-ai/molis-work-module-context-ledger";
import { type MolisWorkProjectCatalog, MolisWorkProjectCatalogError } from "./project-catalog.js";
import { MolisWorkV1Error, type GoalProjectApplication } from "./goal-project-application.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { hydrateFeedItemContent } from "./feed-content.js";
import { desktopPanelSessionIds } from "./web-session.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";

interface PanelHttpPorts extends Pick<WorkPanelHttpContext, "isRuntimeKind" | "launchSpec" | "advancePrompt"> {
  withCatalog: LocalWebCatalogRunner;
  panelEnv(input: {
    homeDirectory: string; runtimeId: string; sessionId?: string | null;
    panelId: string; workContextId: string; goalId: string; webUrl?: string;
  }): Record<string, string>;
}

export function createLocalPanelHttp(ports: PanelHttpPorts) {
  function desktopPanelSpawn(
    catalog: MolisWorkProjectCatalog,
    panel: { panel_id: string; runtime_kind: string; launch_command: string; launch_args: string[]; cwd: string | null; work_context_id: string; goal_id: string },
    webUrl: string,
    sessionId: string | null,
  ): {
    command: string;
    args: string[];
    cwd: string | null;
    env: Record<string, string>;
    sessionId: string | null;
  } {
    return {
      command: panel.launch_command,
      args: panel.launch_args,
      cwd: panel.cwd,
      sessionId,
      env: ports.panelEnv({
        homeDirectory: catalog.homeDirectory,
        runtimeId: panel.runtime_kind,
        sessionId,
        panelId: panel.panel_id,
        workContextId: panel.work_context_id,
        goalId: panel.goal_id,
        webUrl,
      }),
    };
  }

  return async function handleDesktopPanelApi(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    serverOptions: { homeDirectory?: string },
    projectId: string,
    coordinator: GoalProjectApplication,
    boardId: string,
    ptyHost: MolisWorkPtyHost,
    webUrl: string,
    actions: BoundActionClient,
  ): Promise<boolean> {
    return handleWorkPanelHttp({
      method: request.method, url, projectId, text: L,
      readBody: () => readBody(request),
      respond: (status, value) => sendJson(response, status, value),
      withHost: (operation) => ports.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => operation({
        panels: catalog.desktopPanels,
        preferredWorkspacePath: (id) => catalog.preferredWorkspacePath(id),
        sessionIds: (ids) => desktopPanelSessionIds(catalog, ids),
        spawn: (panel, sessionId) => desktopPanelSpawn(catalog, panel, webUrl, sessionId),
      })),
      readGoal: (goalId) => {
        const goal = coordinator.goalQueries.getGoal(boardId, goalId);
        const event_work = coordinator.goalEvents.isEventStateOwner(boardId, goalId);
        const state = event_work ? coordinator.goalEvents.readState(boardId, goalId) : null;
        const event_facts = state
          ? [
              `工作状态：${state.work_status}`,
              state.agreement.outcome ? `当前约定：${state.agreement.outcome}` : "",
              state.progress_summary?.next_step ? `下一步：${state.progress_summary.next_step}` : "",
              state.pending_decisions.length ? `待决定：${state.pending_decisions.map((item) => item.question).join("；")}` : "",
              state.current_decisions.length ? `已决定：${state.current_decisions.map((item) => item.conclusion).join("；")}` : "",
              state.gaps.length ? `未满足：${state.gaps.map((item) => item.statement).join("；")}` : "",
            ].filter(Boolean).join("\n")
          : undefined;
        return { ...goal, event_work, event_facts };
      },
      readLinkedFeedContext: (goalId, itemId) => {
        const feed = createLocalFeedApplication(coordinator.store.db);
        return readLinkedFeedContext({
          project_id: boardId, goal_id: goalId, item_id: itemId,
          materializer: createContextMaterializer(createContextLedger(coordinator.store.db, {
            authorize: (access) => access.scope.kind === "personal" && access.scope.id === boardId,
          })),
          readGoal: () => coordinator.goalQueries.getGoal(boardId, goalId),
          readItem: (id) => {
            try { return feed.getItem(boardId, id); }
            catch (error) {
              if (error instanceof FeedStoreError && error.code === "feed_item_not_found") return null;
              throw error;
            }
          },
          renderItem: (item) => feedItemContext(hydrateFeedItemContent(item)),
        });
      },
      projectGuidance: async () => (await actions.invoke(goalsActions.guidanceRead, {})).runtime_prompt_prefix,
      isRuntimeKind: ports.isRuntimeKind,
      launchSpec: ports.launchSpec,
      advancePrompt: ports.advancePrompt,
      kill: (panelId) => ptyHost.kill(panelId),
      classifyError: (error) => error instanceof MolisWorkV1Error ? 404
        : error instanceof MolisWorkProjectCatalogError ? error.code === "catalog.panel_not_found" ? 404 : 400
        : null,
    });
  }

}
