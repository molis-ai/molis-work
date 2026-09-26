import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleWorkSessionHttp, MolisWorkWorkspaceActionError, repairProjectWorkspace, unlinkProjectWorkspace, type ProjectWorkspaceRecord, type WorkSessionHttpContext } from "@molis-ai/molis-work-plugin-work";
import type { MolisWorkWebView, WebProjectNavigation } from "@molis-ai/molis-work-app-workbench";
import { normalizeRuntimeWorkContext } from "./project-catalog.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { SessionRuntimeResources, createSessionProjectOperations } from "./web-session.js";
import { pickLocalDirectory } from "./directory-picker.js";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";

export function createLocalWorkSessionHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner, sessionProjectOperationsData: ReturnType<typeof createSessionProjectOperations>) {
  return async function handleSessions(
    request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined,
    options: { boardId: string; project: WebProjectNavigation | null; projects: WebProjectNavigation[] },
    sessionResources: Promise<SessionRuntimeResources>, readWebView: () => MolisWorkWebView | Promise<MolisWorkWebView>,
    readGoalContract: WorkSessionHttpContext["readGoalContract"], actions: BoundActionClient,
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
      readGoalContract: (goalId) => readGoalContract(goalId),
      workspace: {
        add: (canonicalPath, projectId) => withMolisWorkProjectCatalog(
          { homeDirectory: homeDirectory },
          (catalog) => catalog.addWorkspaceProject({ canonical_path: canonicalPath, project_id: projectId, actor_id: "web-user", user_confirmed: true }),
        ),
        repair: async (current, canonicalPath, projectId) => {
          const registry = (await sessionResources).registry;
          const result = await withMolisWorkProjectCatalog({ homeDirectory: homeDirectory },
            (catalog) => repairProjectWorkspace({ catalog, registry, current, canonicalPath, projectId, actorId: "web-user" }));
          return { workspace: result.workspace, updated_session_count: result.sessions.length };
        },
        unlink: async (current, projectId) => {
          const registry = (await sessionResources).registry;
          const result = await withMolisWorkProjectCatalog({ homeDirectory: homeDirectory },
            (catalog) => unlinkProjectWorkspace({ catalog, registry, current, projectId, actorId: "web-user" }));
          return { changed: result.changed, updated_session_count: result.sessions.length };
        },
        isActionError: (error) => error instanceof MolisWorkWorkspaceActionError,
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
