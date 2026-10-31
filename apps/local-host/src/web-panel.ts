import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { type MolisWorkProjectCatalog } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import { handlePanelHttp, type PanelHttpContext } from "./web-panel-routes.js";

interface PanelHttpPorts extends Pick<PanelHttpContext, "isRuntimeKind" | "launchSpec"> {
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
        return { ...entry.goal, event_work: entry.event_work };
      },
      isRuntimeKind: ports.isRuntimeKind,
      launchSpec: ports.launchSpec,
      kill: (panelId) => ptyHost.kill(panelId),
    });
  }

}
