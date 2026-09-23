import type { ImageConnectionInput, ImageGenerateInput } from "@molis-ai/molis-work-contracts/modules/images";
import { ImagesError } from "./error.js";
import type { ImagesService } from "./service.js";

export interface ImagesRouteResult {
  status: number;
  body?: unknown;
  image?: { bytes: Uint8Array; mime: string; filename: string };
}
/** Host supplies projectId from its resolved project, never from request payload. */
export function handleImagesRoute(service: ImagesService, input: {
  method: string; pathname: string; body: Record<string, unknown>; projectId: string;
}): ImagesRouteResult {
  const path = input.pathname.slice("/api/images".length).split("/").filter(Boolean).map(decodeURIComponent);
  const { method, body, projectId } = input;
  if (path.length === 1 && path[0] === "connections") {
    if (method === "GET") return { status: 200, body: { connections: service.listConnections() } };
    if (method === "POST") return { status: 200, body: { connection: service.saveConnection(connectionInput(body)) } };
  }
  if (path[0] === "jobs") {
    if (path.length === 1 && method === "GET") return { status: 200, body: { jobs: projectId ? service.listJobs(projectId) : [] } };
    if (!projectId) throw new ImagesError("images.project_required", "请先选择项目，再生成或查看图片", 400);
    if (path.length === 1 && method === "POST") return { status: 202, body: { job: service.start(projectId, generateInput(body)) } };
    if (path.length === 2 && method === "GET") return { status: 200, body: { job: service.getJob(projectId, path[1]!) } };
    if (path.length === 3 && path[2] === "cancel" && method === "POST") return { status: 200, body: { job: service.cancel(projectId, path[1]!) } };
    if (path.length === 4 && path[2] === "images" && method === "GET") return { status: 200, image: service.readImage(projectId, path[1]!, path[3]!) };
  }
  return { status: method === "GET" || method === "POST" ? 404 : 405, body: { error: "找不到图片操作或请求方法不支持" } };
}

function connectionInput(body: Record<string, unknown>): ImageConnectionInput {
  const api_format = body.api_format;
  if (api_format !== "openai-images" && api_format !== "gemini") {
    throw new ImagesError("images.invalid", "请选择受支持的图片 API 协议。");
  }
  return {
    ...(typeof body.id === "string" ? { id: body.id } : {}),
    name: typeof body.name === "string" ? body.name : "",
    api_format,
    base_url: typeof body.base_url === "string" ? body.base_url : "",
    model: typeof body.model === "string" ? body.model : "",
    ...(typeof body.api_key === "string" ? { api_key: body.api_key } : {}),
  };
}

function generateInput(body: Record<string, unknown>): ImageGenerateInput {
  return {
    request_id: typeof body.request_id === "string" ? body.request_id : "",
    connection_id: typeof body.connection_id === "string" ? body.connection_id : "",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    ...(typeof body.size === "string" ? { size: body.size } : {}),
    ...(typeof body.aspect_ratio === "string" ? { aspect_ratio: body.aspect_ratio } : {}),
  };
}
