import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { readLocalWebBody as readBody, respondLocalWebRefusal, sendLocalWebJson as sendJson } from "./web-http.js";
import { L } from "./web-locale.js";
import { withPluginWords } from "@molis-ai/molis-work-app-workbench";
import { projectDeletedHooksFor, type ProjectDeletedOwner } from "./project-deleted-hooks.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { ProjectDeletionService, type ProjectDeletionPorts } from "./project-deletion-service.js";

/** What an owner says goes with the project, in the person's language; a plugin owner's text is translated with that plugin's own words. */
export function ownerLabel(owner: Pick<ProjectDeletedOwner, "label" | "label_values" | "words_of">): string {
  const draw = () => L(owner.label ?? "", owner.label_values && Object.fromEntries(Object.entries(owner.label_values).map(([name, value]) => [name, L(value)])));
  return owner.words_of ? withPluginWords(owner.words_of, draw) : draw();
}

/** How the settings page hears a refused or failed deletion: the answer every Host exit gives a failure, chosen by its kind (SDK `actionErrorResponse`), so a missing project is the not-found 404 and a live terminal the 409. */
export function sendDeletionFailure(response: ServerResponse, error: unknown): void {
  respondLocalWebRefusal({ respond: (status, body) => sendJson(response, status, body) }, error);
}

/**
 * The settings page's "delete the demo": the same Host deletion service as deleting any project (terminal check, the
 * runtime let go of, then the catalog's receipt), for the one project marked as regenerable demo data. Null when there is no demo.
 */
export async function removeDemoThroughService(withCatalog: LocalWebCatalogRunner, homeDirectory: string | undefined, ports: ProjectDeletionPorts): Promise<ProjectDeletionResult | null> {
  const demo = await withCatalog({ homeDirectory }, catalog => catalog.listProjects().find(project => project.data_class === "regenerable_demo"));
  if (!demo) return null;
  return new ProjectDeletionService(withCatalog, ports).deleteProject(homeDirectory, {
    project_id: demo.project_id,
    actor_id: LOCAL_PERSON_ACTOR_ID,
    delete_confirmed: true,
    idempotency_key: `web-demo-remove-${randomBytes(16).toString("hex")}`,
  });
}

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
      const owners = projectDeletedHooksFor(homeDirectory ?? resolveConfiguredHome()).owners().flatMap(owner => owner.label ? [{ owner_id: owner.id, label: ownerLabel(owner) }] : []);
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
        sendDeletionFailure(response, error);
      }
      return true;
    }
    return false;
  };
}
