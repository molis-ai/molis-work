import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import {handleProjectRecycleHttp} from './web-project-recycle.js';
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProjectDeletionResult } from "@molis-ai/molis-work-contracts/modules/projects";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { decodeLocalWebPathPart, readLocalWebBody as readBody, respondLocalWebRefusal, sendLocalWebJson as sendJson } from "./web-http.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { ownerLabel } from "./project-deletion-words.js";
export { ownerLabel };
import { resolveConfiguredHome } from "./product-home.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { ProjectDeletionService, type ProjectDeletionPorts } from "./project-deletion-service.js";

/** Both the Settings HTML and the existing output-folder read use this Home's current, ordered owners. */
export function projectDeletionLabels(home: string) {
  return projectDeletedHooksFor(home).owners().flatMap(owner => owner.label ? [{ owner_id: owner.id, label: ownerLabel(owner) }] : []);
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
    output_files: "keep",
  });
}

/**
 * The project deletion routes: what the confirmation dialog lists, and the deletion itself with the receipt it returns
 * (the owners of project data clear their part after the catalog commits, and a receipt that is not complete is retried
 * by sending the same deletion again).
 */
export function createProjectDeletionHttp(withMolisWorkProjectCatalog: LocalWebCatalogRunner) {
  return async function handle(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined, deletionPorts: ProjectDeletionPorts): Promise<boolean> {
    if(await handleProjectRecycleHttp(request,response,url,homeDirectory??resolveConfiguredHome(),withMolisWorkProjectCatalog,deletionPorts))return true;
    const scopeMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/delete-scope$/);
    if (request.method === "GET" && scopeMatch) {
      // Every owner of project data in this Home that names itself, in the person's language.
      const owners = projectDeletionLabels(homeDirectory ?? resolveConfiguredHome());
      const projectId = decodeLocalWebPathPart(scopeMatch[1]);
      try {
        // Whether the dialog asks about the files in the default output directory: only when it has some (§3 「永久删除怎么做」).
        const defaultOutput = await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.projectDeletion.outputContents(projectId));
        sendJson(response, 200, { project_id: projectId, owners, default_output: defaultOutput });
      } catch (error) {
        sendDeletionFailure(response, error);
      }
      return true;
    }
    const projectDeleteMatch = url.pathname.match(/^\/api\/settings\/projects\/([^/]+)\/delete$/);
    if (request.method === "POST" && projectDeleteMatch) {
      const body = await readBody(request);
      const deletionKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
      if (body.delete_confirmed !== true || deletionKey.length < 8 || deletionKey.length > 200) {
        sendJson(response, 400, { error: uiText.text("workbench.project-deletion.confirm-project-deletion-provide-valid-deletion-request-key") });
        return true;
      }
      // Only this page asks the person what happens to the files in the default output directory; nothing else is taken (SSC-23).
      if (body.output_files !== undefined && body.output_files !== "keep" && body.output_files !== "delete") {
        sendJson(response, 400, { error: uiText.text("workbench.project-deletion.files-default-output-folder-can-only-be-kept") });
        return true;
      }
      try {
        const result = await new ProjectDeletionService(withMolisWorkProjectCatalog, deletionPorts).deleteProject(homeDirectory, {
          project_id: decodeLocalWebPathPart(projectDeleteMatch[1]),
          actor_id: LOCAL_PERSON_ACTOR_ID,
          delete_confirmed: true,
          idempotency_key: deletionKey,
          output_files: body.output_files === "delete" ? "delete" : "keep",
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
