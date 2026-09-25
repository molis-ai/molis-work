import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { artifactsActions, ArtifactProjectReferenceError } from "@molis-ai/molis-work-plugin-artifacts";
import { ProjectReferenceError } from "@molis-ai/molis-work-module-evidence-verification";
import { sendLocalWebJson as sendJson } from "./web-http.js";

export async function handleLocalProjectReferenceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  actions: BoundActionClient,
): Promise<boolean> {
  const projectReferenceMatch = url.pathname.match(/^\/api\/project-references\/([^/]+)$/);
  if (request.method === "GET" && projectReferenceMatch) {
    try {
      const reference = decodeURIComponent(projectReferenceMatch[1]);
      const evidenceId = url.searchParams.get("evidence_id")?.trim() || null;
      const opened = await actions.invoke(artifactsActions.projectReference, { reference, evidence_id: evidenceId });
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="${opened.filename.replaceAll('"', "")}"`,
        "x-content-type-options": "nosniff",
      });
      response.end(Buffer.from(opened.content_base64, "base64"));
    } catch (error) {
      const status = error instanceof ProjectReferenceError || error instanceof ArtifactProjectReferenceError
        ? error.status : error instanceof ActionError && error.code === "actions.forbidden" ? 403 : 400;
      sendJson(response, status, {
        error: error instanceof Error ? error.message : "项目内引用无法打开",
      });
    }
    return true;
  }
  return false;
}
