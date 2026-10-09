import type { IncomingMessage, ServerResponse } from "node:http";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { LocalWebCatalogRunner, ProjectDeletionWebPorts } from "./web-project-settings.js";

/**
 * The project deletion routes: what the confirmation dialog lists, and the deletion itself with the receipt it returns
 * (the owners of project data clear their part after the catalog commits, and a receipt that is not complete is retried
 * by sending the same deletion again).
 */
export function createProjectDeletionHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner) {
  return async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, deletionPorts: ProjectDeletionWebPorts): Promise<boolean> {
    const scopeMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/delete-scope$/);
    if (request.method === "GET" && scopeMatch) {
      // Every owner of project data in this Home that names itself, in the person's language.
      const owners = projectDeletedHooksFor(homeDirectory ?? resolveConfiguredHome()).owners().flatMap(owner => owner.label ? [{ owner_id: owner.id, label: L(owner.label) }] : []);
      sendJson(response, 200, { project_id: decodeURIComponent(scopeMatch[1]), owners });
      return true;
    }
    const projectDeleteMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/delete$/);
    if (request.method === "POST" && projectDeleteMatch) {
      const body = await readBody(request);
      const deletionKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
      if (body.delete_confirmed !== true || deletionKey.length < 8 || deletionKey.length > 200) {
        sendJson(response, 400, { error: L("请明确确认删除项目，并提供有效的删除请求键。") });
        return true;
      }
      try {
        await withMolisWorkProjectCatalog({ homeDirectory }, async (catalog) => {
          const projectId = decodeURIComponent(projectDeleteMatch[1]);
          // An already deleted project can still replay its persisted cleanup receipt.
          const project = catalog.listProjects().find((item) => item.project_id === projectId);
          if (project) {
            if (catalog.listDesktopPanels(projectId).some((panel) => deletionPorts.isPanelAlive(panel.panel_id))) {
              sendJson(response, 409, { error: L("请先关闭这个项目中正在运行的终端，再删除项目。") });
              return;
            }
            await deletionPorts.releaseProject(project.database_path);
          }
          const result = await catalog.deleteProject({
            project_id: projectId,
            actor_id: LOCAL_PERSON_ACTOR_ID,
            delete_confirmed: true,
            idempotency_key: deletionKey,
          });
          sendJson(response, 200, result);
        });
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
      }
      return true;
    }
    return false;
  };
}
