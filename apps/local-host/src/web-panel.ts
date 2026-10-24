import { optionalPluginQuery } from "./web-view.js";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { feedQueryActions } from "@molis-ai/molis-work-plugin-feed";
import { type MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import { handlePanelHttp, type PanelHttpContext } from "./web-panel-routes.js";

interface PanelHttpPorts extends Pick<PanelHttpContext, "isRuntimeKind" | "launchSpec" | "advancePrompt"> {
  withCatalog: LocalWebCatalogRunner;
  panelEnv(input: {
    homeDirectory: string; runtimeId: string;
    panelId: string; workContextId: string; goalId: string; webUrl?: string;
  }): Record<string, string>;
}

export function createLocalPanelHttp(ports: PanelHttpPorts) {
  function desktopPanelSpawn(
    catalog: MolisWorkProjectCatalog,
    panel: { panel_id: string; runtime_kind: string; launch_command: string; launch_args: string[]; cwd: string | null; work_context_id: string; goal_id: string },
    webUrl: string,
  ): {
    command: string;
    args: string[];
    cwd: string | null;
    env: Record<string, string>;
  } {
    return {
      command: panel.launch_command,
      args: panel.launch_args,
      cwd: panel.cwd,
      env: ports.panelEnv({
        homeDirectory: catalog.homeDirectory,
        runtimeId: panel.runtime_kind,
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
    ptyHost: MolisWorkPtyHost,
    webUrl: string,
    actions: BoundActionClient,
  ): Promise<boolean> {
    return handlePanelHttp({
      method: request.method, url, projectId, text: L,
      readBody: () => readBody(request),
      respond: (status, value) => sendJson(response, status, value),
      withHost: (operation) => ports.withCatalog({ homeDirectory: serverOptions.homeDirectory }, (catalog) => operation({
        panels: catalog.desktopPanels,
        preferredWorkspacePath: (id) => catalog.preferredWorkspacePath(id),
        spawn: (panel) => desktopPanelSpawn(catalog, panel, webUrl),
      })),
      readGoal: async (goalId) => {
        const collection = await actions.invoke(goalsActions.collection, {});
        const entry = [...collection.goals, ...collection.archived_goals, ...collection.trashed_goals].find(row => row.goal.goal_id === goalId);
        if (!entry) throw new ActionError("actions.missing", "找不到这个 Goal");
        const { goal, event_work } = entry;
        const state = event_work ? await actions.invoke(goalsActions.state, { goal_id: goalId }) : null;
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
      readLinkedFeedContext: async (goalId, itemId) => {
        const input = { goal_id: goalId, ...(itemId ? { item_id: itemId } : {}) };
        return itemId ? actions.invoke(feedQueryActions.linkedContext, input)
          : await optionalPluginQuery(actions, feedQueryActions.linkedContext, input) ?? null;
      },
      projectGuidance: async () => (await actions.invoke(goalsActions.guidanceRead, {})).runtime_prompt_prefix,
      isRuntimeKind: ports.isRuntimeKind,
      launchSpec: ports.launchSpec,
      advancePrompt: ports.advancePrompt,
      kill: (panelId) => ptyHost.kill(panelId),
    });
  }

}
