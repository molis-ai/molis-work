import type { IncomingMessage, ServerResponse } from "node:http";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ImagesError, handleImagesRoute } from "@molis-ai/molis-work-plugin-images";
import { withRewrittenPluginApi } from "./native-plugin-api.js";

export async function handleImagesNativePluginHttp(
  request: IncomingMessage, response: ServerResponse, originalUrl: URL,
  ports: (input: { query: URLSearchParams; body: Record<string, unknown> }) => { projectId: string; actions: BoundActionClient } | Promise<{ projectId: string; actions: BoundActionClient }>,
): Promise<boolean> {
  const url = withRewrittenPluginApi(originalUrl);
  if (url.pathname !== "/api/images" && !url.pathname.startsWith("/api/images/")) return false;
  const json = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  try {
    const body = request.method === "POST" ? await readBody(request) : {};
    const {projectId, actions} = await ports({query:url.searchParams,body});
    for (const value of url.searchParams.getAll("project_id")) if (value !== projectId) throw new ImagesError("actions.scope_mismatch", "图片项目与当前项目不一致", 403);
    const result = await handleImagesRoute(actions, { method: request.method ?? "GET", pathname: url.pathname, body, projectId });
    if (result.image) {
      response.writeHead(result.status, {
        "content-type": result.image.mime,
        "content-length": String(result.image.bytes.byteLength),
        "content-disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${result.image.filename}"`,
        "cache-control": "no-store", "x-content-type-options": "nosniff",
      });
      response.end(result.image.bytes);
    } else json(result.status, result.body);
  } catch (error) {
    if (error instanceof ImagesError) json(error.status, { error: error.message, code: error.code });
    else if (error instanceof Error && "code" in error && String(error.code).startsWith("actions.")) json(["actions.forbidden", "actions.scope_mismatch"].includes(String(error.code)) ? 403 : 400, { error: error.message, code: error.code });
    else json(500, { error: "图片操作失败，请稍后重试", code: "images.internal" });
  }
  return true;
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 160_000) throw new ImagesError("images.invalid", "请求内容过大", 413);
    chunks.push(bytes);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new ImagesError("images.invalid", "请求必须是 JSON 对象", 400); }
}
