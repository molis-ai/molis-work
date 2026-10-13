import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkSessionHttp, type ProjectWorkspaceRecord } from "@molis-ai/molis-work-plugin-work";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import { normalizeRuntimeWorkContext } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { SessionRuntimeResources, createSessionProjectOperations } from "./web-session.js";
import { pickLocalDirectory } from "./directory-picker.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";

export function createLocalWorkSessionHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner, sessionProjectOperationsData: ReturnType<typeof createSessionProjectOperations>) {
  return async function handleSessions(
    request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined,
    options: { projectId: string; project: WebProjectNavigation | null; projects: WebProjectNavigation[] },
    sessionResources: Promise<SessionRuntimeResources>, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>,
    actions: BoundActionClient,
  ): Promise<boolean> {
    const readProjectWorkspaceRecord = async (workspaceId: string): Promise<ProjectWorkspaceRecord | null> => {
      if (!options.project) return null;
      const catalogWorkspaces = await withMolisWorkProjectCatalog(
        { homeDirectory: homeDirectory },
        (catalog) => catalog.listWorkspaceDirectory(options.project!.project_id),
      );
      return (await sessionProjectOperationsData(
        actions,
        options.project.project_id,
        await readWebView(),
        options.projects,
        catalogWorkspaces,
      )).workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
    };
    return await handleWorkSessionHttp({
      method: request.method,
      actions,
      pathname: url.pathname,
      readBody: () => readBody(request),
      respond: (status, value) => sendJson(response, status, value),
      resourcesPromise: sessionResources,
      projectOptions: options,
      hasCurrentGoal: async (goalId) => (await readWebView()).goals.some((item) => item.goal.goal_id === goalId),
      workspace: {
        read: readProjectWorkspaceRecord,
        normalize: (workspacePath) => normalizeRuntimeWorkContext({
          runtime_id: "molis-work-web",
          stable_work_context_id: null,
          host_declares_stable: false,
          workspace: { canonical_path: workspacePath, realpath_verified: false },
        }).workspace,
        exists: (workspacePath) => fs.existsSync(workspacePath),
        isDirectory: (workspacePath) => fs.statSync(workspacePath).isDirectory(),
      },
      pickDirectory: () => pickLocalDirectory(),
    });
  };
}
