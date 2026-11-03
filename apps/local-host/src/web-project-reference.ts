import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { IncomingMessage, ServerResponse } from "node:http";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { hostErrors } from "./host-errors.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";

/** The reference as the address carries it; an escape that does not decode is a reference that cannot be opened, not a failure of the Host. */
function decodedReference(encoded: string): string {
  try { return decodeURIComponent(encoded); }
  catch { throw hostErrors.project_reference_invalid("项目内引用编码无效"); }
}

export async function handleLocalProjectReferenceHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  actions: BoundActionClient,
): Promise<boolean> {
  const projectReferenceMatch = url.pathname.match(/^\/api\/project-references\/([^/]+)$/);
  if (request.method === "GET" && projectReferenceMatch) {
    try {
      const reference = decodedReference(projectReferenceMatch[1]);
      const opened = await actions.invoke(artifactsActions.projectReference, { reference });
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": `inline; filename="${opened.filename.replaceAll('"', "")}"`,
        "x-content-type-options": "nosniff",
      });
      response.end(Buffer.from(opened.content_base64, "base64"));
    } catch (error) {
      const failure = actionErrorResponse(error);
      sendJson(response, failure.status, failure.body);
    }
    return true;
  }
  return false;
}
