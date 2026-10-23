import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfRecipeId } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { PluginRouteBinding, PluginRouteRequest, PluginRouteResponse, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isHttpUrl } from "@molis-ai/molis-work-module-shelf";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { shelfActions, type ShelfAdmitActionInput } from "./actions.js";

type Call = <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => Promise<Output>;
type Handler = (request: PluginRouteRequest, body: Readonly<Record<string, unknown>>, call: Call) => Promise<PluginRouteResponse>;

/**
 * The Home half's routes: each adapts path and body parameters and answers writes with the shelf; validation and business work belong
 * to the same actions MCP and Agents call, invoked with the route's own control (the project a page called from, the file the Host's
 * entry was handed).
 */
export function shelfHomeRoutes(context: PluginStartContext): PluginRouteBinding[] {
  const bind = (route_id: string, handle: Handler): PluginRouteBinding => ({ route_id, async handle(request) {
    try {
      if (!context.actor_id || request.actor_id !== context.actor_id) throw new ActionError("actions.forbidden", "调用者与当前插件入口不一致");
      const actions = context.services?.actions;
      if (!actions) throw new ActionError("actions.unredeemed", "宿主未提供系统动作调用入口");
      const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
      return await handle(request, body, (definition, input) => actions.invoke(definition, input, request.execution));
    } catch (error) {
      return actionErrorResponse(error);
    }
  } });
  // The panel repaints from the shelf it gets back, so every write answers with it.
  const withShelf = async (call: Call, body: object): Promise<PluginRouteResponse> => ({ status: 200, body: { ...body, snapshot: await call(shelfActions.snapshot, {}) } });
  const missingItem = { status: 404, body: { error: "这份材料不在架子上" } };
  const missingClip = { status: 404, body: { error: "这条剪贴板不存在" } };
  return [
    bind("shelf.snapshot", async (_request, _body, call) => ({ status: 200, body: await call(shelfActions.snapshot, {}) })),
    bind("shelf.settings.read", async (_request, _body, call) => ({ status: 200, body: await call(shelfActions.settings, {}) })),
    bind("shelf.settings.write", async (_request, body, call) => ({ status: 200, body: await call(shelfActions.saveSettings, body) })),
    bind("shelf.sample", async (_request, _body, call) => withShelf(call, await call(shelfActions.sample, {}))),
    bind("shelf.admit", async (_request, body, call) => {
      const text = stringValue(body.text);
      // A pasted link is fetched as a page unless the panel asks for the link itself (发给终端 sends `capture_pages: false`).
      if (text && isHttpUrl(text) && body.capture_pages !== false) return withShelf(call, await call(shelfActions.capture, { url: text }));
      const input: ShelfAdmitActionInput = {};
      for (const key of ["text", "title", "filename", "bytes_base64", "mime"] as const) {
        const value = stringValue(body[key]);
        if (value) input[key] = value;
      }
      const admitted = await call(shelfActions.admit, input);
      // The desktop shell hands the original's path to the Host beside the copy; the copy stays on the shelf if registering it fails.
      if (body.original !== true || !input.filename) return withShelf(call, admitted);
      const registered = await call(shelfActions.original, { item_id: admitted.item.item_id }).then(() => true, () => false);
      return withShelf(call, { ...admitted, original_registered: registered });
    }),
    bind("shelf.folder", async (_request, body, call) => {
      const name = stringValue(body.name);
      const raw = Array.isArray(body.entries) ? body.entries : [];
      if (!name || !raw.length) return { status: 400, body: { error: "请选择要加入的文件夹" } };
      const entries = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const relative = stringValue(record.relative);
        const encoded = stringValue(record.bytes_base64);
        if (!relative || !encoded) return [];
        const mime = stringValue(record.mime);
        return [{ relative, bytes_base64: encoded, ...(mime ? { mime } : {}) }];
      });
      if (!entries.length) return { status: 400, body: { error: "这个文件夹里没有可以加入的文件" } };
      return withShelf(call, await call(shelfActions.admitFolder, { name, entries }));
    }),
    bind("shelf.hide", async (request, _body, call) => {
      if (!request.params.item_id) return missingItem;
      await call(shelfActions.hide, { item_id: request.params.item_id });
      return withShelf(call, {});
    }),
    bind("shelf.delete", async (request, _body, call) => {
      if (!request.params.item_id) return missingItem;
      await call(shelfActions.delete, { item_id: request.params.item_id });
      return withShelf(call, {});
    }),
    bind("shelf.useMaterial", async (request, _body, call) => {
      if (!request.params.item_id) return missingItem;
      return withShelf(call, await call(shelfActions.useAsMaterial, { item_id: request.params.item_id }));
    }),
    bind("shelf.edit", async (request, body, call) => {
      if (!request.params.item_id) return missingItem;
      if (typeof body.text !== "string") return { status: 400, body: { error: "请输入要保存的文字" } };
      return withShelf(call, await call(shelfActions.edit, { item_id: request.params.item_id, text: body.text }));
    }),
    bind("shelf.job", async (_request, body, call) => {
      const recipe = stringValue(body.recipe) as ShelfRecipeId;
      const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map((value) => String(value).trim()).filter(Boolean) : [];
      const itemId = stringValue(body.item_id);
      if (!recipe || (!itemIds.length && !itemId)) return { status: 400, body: { error: "请选择动作和材料" } };
      try {
        return await withShelf(call, await call(recipe === "extract_text" ? shelfActions.extract : shelfActions.generate, {
          recipe,
          ...(itemId ? { item_id: itemId } : {}),
          ...(itemIds.length ? { item_ids: itemIds } : {}),
          option_id: stringValue(body.option_id) || null,
          shortcut_id: stringValue(body.shortcut_id) || null,
        }));
      } catch (error) {
        // A failed run leaves a row saying why, so the caller gets the shelf back too, beside the error the SDK answers with.
        const failure = actionErrorResponse(error);
        return { ...failure, body: { ...failure.body, snapshot: await call(shelfActions.snapshot, {}) } };
      }
    }),
    bind("shelf.job.cancel", async (request, _body, call) => {
      if (!request.params.job_id) return { status: 404, body: { error: "这个任务不存在" } };
      return withShelf(call, await call(shelfActions.cancelJob, { job_id: request.params.job_id }));
    }),
    bind("shelf.clipboard", async (_request, body, call) => {
      const text = stringValue(body.text);
      if (!text) return { status: 400, body: { error: "剪贴板是空的" } };
      const types = Array.isArray(body.types) ? body.types.map(String) : [];
      return withShelf(call, await call(shelfActions.clip, { text, concealed: body.concealed === true, types }));
    }),
    bind("shelf.clipboard.delete", async (request, _body, call) => {
      if (!request.params.clip_id) return missingClip;
      await call(shelfActions.deleteClip, { clip_id: request.params.clip_id });
      return withShelf(call, {});
    }),
    bind("shelf.clipboard.join", async (request, _body, call) => {
      if (!request.params.clip_id) return missingClip;
      return withShelf(call, await call(shelfActions.clipToMaterial, { clip_id: request.params.clip_id }));
    }),
    bind("shelf.file", async (request, _body, call) => {
      if (!request.params.item_id) return missingItem;
      const child = request.query.child?.trim();
      const file = await call(shelfActions.file, { item_id: request.params.item_id, ...(child ? { child } : {}) });
      // The Host shows only PNG, JPEG and WebP in the page; any other file downloads.
      return { status: 200, bytes: Buffer.from(file.bytes_base64, "base64"), filename: file.name, mime: file.mime, disposition: "inline" };
    }),
  ];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
