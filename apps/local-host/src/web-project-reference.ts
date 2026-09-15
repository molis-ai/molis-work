import type { IncomingMessage, ServerResponse } from "node:http";
import { openArtifactProjectReference, ArtifactProjectReferenceError } from "@molis-ai/molis-work-plugin-artifacts";
import { ProjectReferenceError, readProjectReference } from "@molis-ai/molis-work-module-evidence-verification";
import { sendLocalWebJson as sendJson } from "./web-http.js";

export function handleLocalProjectReferenceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  options: { boardId: string; projectRoot?: string }, evidence: Parameters<typeof openArtifactProjectReference>[0]["evidence"],
): boolean {
  const projectReferenceMatch = url.pathname.match(/^\/api\/project-references\/([^/]+)$/);
  if (request.method === "GET" && projectReferenceMatch) {
    try {
      const reference = decodeURIComponent(projectReferenceMatch[1]);
      const evidenceId = url.searchParams.get("evidence_id")?.trim() || null;
      const opened = openArtifactProjectReference({
        evidence: evidence,
        readProjectReference,
      }, { boardId: options.boardId, reference, evidenceId, projectRoot: options.projectRoot });
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="${opened.fileName.replaceAll('"', "")}"`,
        "x-content-type-options": "nosniff",
      });
      response.end(opened.content);
    } catch (error) {
      const status = error instanceof ProjectReferenceError || error instanceof ArtifactProjectReferenceError
        ? error.status : 400;
      sendJson(response, status, {
        error: error instanceof Error ? error.message : "项目内引用无法打开",
      });
    }
    return true;
  }
  return false;
}
