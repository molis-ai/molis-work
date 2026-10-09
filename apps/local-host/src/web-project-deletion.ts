import type { IncomingMessage, ServerResponse } from "node:http";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { ProjectDeletionService, type ProjectDeletionPorts } from "./project-deletion-service.js";
import { MolisWorkProjectCatalogError } from "./project-catalog-contract.js";

/**
 * The project deletion routes: what the confirmation dialog lists, and the deletion itself with the receipt it returns
 * (the owners of project data clear their part after the catalog commits, and a receipt that is not complete is retried
 * by sending the same deletion again).
 */
export function createProjectDeletionHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner) {
  return async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, deletionPorts: ProjectDeletionPorts): Promise<boolean> {
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
        const result = await new ProjectDeletionService(withMolisWorkProjectCatalog, deletionPorts).deleteProject(homeDirectory, {
          project_id: decodeURIComponent(projectDeleteMatch[1]),
          actor_id: LOCAL_PERSON_ACTOR_ID,
          delete_confirmed: true,
          idempotency_key: deletionKey,
        });
        sendJson(response, 200, result);
      } catch (error) {
        const live = error instanceof MolisWorkProjectCatalogError && error.code === "catalog.project_terminal_live";
        sendJson(response, live ? 409 : 400, { error: error instanceof Error ? error.message : String(error), ...(live ? { code: error.code } : {}) });
      }
      return true;
    }
    return false;
  };
}
