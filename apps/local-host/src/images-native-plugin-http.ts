import type { IncomingMessage, ServerResponse } from "node:http";
import { ACTION_ERROR_CODE, ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { handleImagesRoute, imagesErrors } from "@molis-ai/molis-work-plugin-images";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";
import { sendLocalWebJson } from "./web-http.js";

export async function handleImagesNativePluginHttp(
  request: IncomingMessage, response: ServerResponse, originalUrl: URL,
  ports: (input: { query: URLSearchParams; body: Record<string, unknown> }) => { projectId: string; actions: BoundActionClient } | Promise<{ projectId: string; actions: BoundActionClient }>,
): Promise<boolean> {
  const url = withRewrittenPluginApi(originalUrl);
  if (url.pathname !== "/api/images" && !url.pathname.startsWith("/api/images/")) return false;
  const json = (status: number, body: unknown) => sendLocalWebJson(response, status, body);
  try {
    const body = request.method === "POST" ? await readImagesBody(request) : {};
    const {projectId, actions} = await ports({query:url.searchParams,body});
    for (const value of url.searchParams.getAll("project_id")) if (value !== projectId) throw new ActionError("actions.scope_mismatch", "图片项目与当前项目不一致");
    const result = await handleImagesRoute(actions, { method: request.method ?? "GET", pathname: url.pathname, body, projectId });
    if (result.image) {
      response.writeHead(result.status, {
        "content-type": result.image.mime,
        "content-length": String(result.image.bytes.byteLength),
        "content-disposition": imageDisposition(url.searchParams.get("download") === "1", result.image.filename, url.searchParams.get("name")),
        "cache-control": "no-store", "x-content-type-options": "nosniff",
      });
      response.end(result.image.bytes);
    } else json(result.status, result.body);
  } catch (error) {
    // A failure without a code of ours may carry paths or driver text, so it is answered with a plain sentence, as it always was.
    const ours = typeof error === "object" && error !== null && ACTION_ERROR_CODE.test(String((error as { code?: unknown }).code));
    const answer = actionErrorResponse(ours ? error : imagesErrors.internal("图片操作失败，请稍后重试"));
    json(answer.status, answer.body);
  }
  return true;
}

/** The shared reader answers a body that is too large (413) or not JSON (400); a JSON that is not an object is Images' own refusal. */
async function readImagesBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const value: unknown = await readNativePluginJsonBody(request, 160_000);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw imagesErrors.invalid("请求必须是 JSON 对象");
  return value as Record<string, unknown>;
}

/** A download may carry the name people read (the prompt); the stored file name stays the fallback for older clients. */
function imageDisposition(download: boolean, stored: string, requested: string | null): string {
  const extension = /\.[a-z0-9]{2,5}$/i.exec(stored)?.[0] ?? "";
  const name = (requested ?? "").replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/gu, " ").trim().slice(0, 80);
  const readable = name ? (name.toLowerCase().endsWith(extension.toLowerCase()) ? name : name + extension) : "";
  const disposition = `${download ? "attachment" : "inline"}; filename="${stored}"`;
  return readable ? `${disposition}; filename*=UTF-8''${encodeURIComponent(readable).replace(/['()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase())}` : disposition;
}
