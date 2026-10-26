import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { shelfAdmit } from "./shelf-admit.js";
import { ACTION_ERROR_CODE, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { imagesActions } from "./actions.js";
import { imagesErrors } from "./error.js";

export function imagesRoutes(context: PluginStartContext): PluginRouteBinding[] {
  context = routeContext(context);
  const body = (request: PluginRouteRequest): Record<string, unknown> => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw imagesErrors.invalid("请求必须是 JSON 对象");
    return request.body as Record<string, unknown>;
  };
  const route = (action: ActionDefinition, input: (request: PluginRouteRequest) => unknown, routeId = action.capability_id) =>
    bindPluginActionRoute(context, action, input as never, routeId);
  const id = (request: PluginRouteRequest) => ({ id: request.params.id });
  const imageInput = (request: PluginRouteRequest) => ({ id: request.params.id!, image_id: request.params.image_id! });
  const image = bindPluginActionRoute(context, imagesActions.image, imageInput);
  const start = route(imagesActions.start, body);
  return [route(imagesActions.connections, () => ({})), route(imagesActions.saveConnection, body), route(imagesActions.deleteConnection, id),
    route(imagesActions.list, () => ({})), route(imagesActions.get, id), route(imagesActions.cancel, id), route(imagesActions.delete, id),
    { ...start, async handle(request) { const result = await start.handle(request); return result.status === 200 ? { ...result, status: 202 } : result; } },
    { ...image, async handle(request) {
      const result = await image.handle(request);
      if (result.status !== 200) return result;
      const file = result.body as { base64: string; mime_type: string; filename: string };
      return { status: 200, bytes: Buffer.from(file.base64, "base64"), mime: file.mime_type, filename: downloadName(request, file.filename),
        disposition: request.query.download === "1" ? "attachment" as const : "inline" as const };
    } },
    { route_id: "images.images.shelf", async handle(request) {
      const result = await image.handle(request);
      if (result.status !== 200) return result;
      const file = result.body as { base64: string; mime_type: string; filename: string }, input = body(request);
      const filename = typeof input.filename === "string" && input.filename.trim() ? input.filename.trim() : file.filename;
      return bindPluginActionRoute(context, shelfAdmit, () => ({ filename, mime: file.mime_type, bytes_base64: file.base64 }), "images.images.shelf").handle(request);
    } },
  ];
}

function downloadName(request: PluginRouteRequest, stored: string): string {
  if (request.query.download !== "1") return stored;
  const name = (request.query.name ?? "").replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/gu, " ").trim().slice(0, 80);
  const extension = /\.[a-z0-9]{2,5}$/iu.exec(stored)?.[0] ?? "";
  return name ? name.toLowerCase().endsWith(extension.toLowerCase()) ? name : name + extension : stored;
}

/** Keep the Images HTTP edge's existing generic message for unexpected driver/runtime failures. */
function routeContext(context: PluginStartContext): PluginStartContext {
  const actions = context.services?.actions;
  if (!actions) return context;
  return { ...context, services: { ...context.services, actions: { ...actions, async invoke(definition, input, control, transport) {
    try { return await actions.invoke(definition, input, control, transport); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && typeof error.code === "string" && ACTION_ERROR_CODE.test(error.code)) throw error;
      throw imagesErrors.internal("图片操作失败，请稍后重试");
    }
  } } } };
}
