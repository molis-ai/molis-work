import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ShelfRecipeId } from "@molis-ai/molis-work-contracts/modules/shelf";
import { shelfActions, shelfProjectActions, type ShelfAdmitActionInput } from "./actions.js";
import { shelfRouteErrorResponse } from "./route-error.js";
import type { ShelfPluginRouteHandler, ShelfPluginRouteResponse } from "./routes.js";

export interface ShelfRouteHandlerPorts {
  /** Home-scoped personal Shelf actions. */
  readonly actions: BoundActionClient;
  /** Present only when the panel is opened inside a project. */
  readonly project?: { readonly title: string; readonly actions: BoundActionClient };
}

/** HTTP adapts legacy parameters and response shapes; validation and business work belong to actions. */
export function createShelfRouteHandlers(options: ShelfRouteHandlerPorts): Record<string, ShelfPluginRouteHandler> {
  const call = <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input) => options.actions.invoke(definition, input);
  const snapshot = () => call(shelfActions.snapshot, {});
  // The panel repaints from the shelf it gets back, so every write answers with it.
  const withShelf = async (body: object): Promise<ShelfPluginRouteResponse> => ({ status: 200, body: { ...body, snapshot: await snapshot() } });
  const project = () => {
    if (!options.project) throw new Error("请在项目中打开 Shelf，再保存项目材料");
    return options.project;
  };
  return {
    "shelf.material.preview": async ({ params }) => {
      const scoped = project();
      const preview = await scoped.actions.invoke(shelfProjectActions.previewMaterial, { item_id: params.item_id! });
      return { status: 200, body: { ...preview, project_title: scoped.title } };
    },
    "shelf.material.save": async ({ params, request }) => ({ status: 200, body: await project().actions.invoke(shelfProjectActions.saveMaterial,
      { item_id: params.item_id!, expected_fingerprint: typeof request.body.expected_fingerprint === "string" ? request.body.expected_fingerprint : "" }) }),
    "shelf.snapshot": async () => ({ status: 200, body: await snapshot() }),
    "shelf.settings.read": async () => ({ status: 200, body: await call(shelfActions.settings, {}) }),
    "shelf.settings.write": async ({ request }) => ({ status: 200, body: await call(shelfActions.saveSettings, request.body as Record<string, unknown>) }),
    "shelf.sample": async () => withShelf(await call(shelfActions.sample, {})),
    "shelf.admit": async ({ request }) => {
      const body = request.body;
      const input: ShelfAdmitActionInput = {};
      for (const key of ["text", "title", "filename", "bytes_base64", "mime", "origin_realpath"] as const) {
        const value = stringValue(body[key]);
        if (value) input[key] = value;
      }
      if (body.capture_pages === false) input.capture_pages = false;
      return withShelf(await call(shelfActions.admit, input));
    },
    "shelf.folder": async ({ request }) => {
      const name = stringValue(request.body.name);
      const raw = Array.isArray(request.body.entries) ? request.body.entries : [];
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
      const origin = stringValue(request.body.origin_realpath);
      return withShelf(await call(shelfActions.admitFolder, { name, entries, ...(origin ? { origin_realpath: origin } : {}) }));
    },
    "shelf.hide": async ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      await call(shelfActions.hide, { item_id: params.item_id });
      return withShelf({});
    },
    "shelf.delete": async ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      await call(shelfActions.delete, { item_id: params.item_id });
      return withShelf({});
    },
    "shelf.useMaterial": async ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      return withShelf(await call(shelfActions.useAsMaterial, { item_id: params.item_id }));
    },
    "shelf.edit": async ({ params, request }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      if (typeof request.body.text !== "string") return { status: 400, body: { error: "请输入要保存的文字" } };
      return withShelf(await call(shelfActions.edit, { item_id: params.item_id, text: request.body.text }));
    },
    "shelf.job": async ({ request }) => {
      const recipe = stringValue(request.body.recipe) as ShelfRecipeId;
      const itemIds = Array.isArray(request.body.item_ids)
        ? request.body.item_ids.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const itemId = stringValue(request.body.item_id);
      if (!recipe || (!itemIds.length && !itemId)) return { status: 400, body: { error: "请选择动作和材料" } };
      try {
        return await withShelf(await call(shelfActions.runJob, {
          recipe,
          ...(itemId ? { item_id: itemId } : {}),
          ...(itemIds.length ? { item_ids: itemIds } : {}),
          option_id: stringValue(request.body.option_id) || null,
          shortcut_id: stringValue(request.body.shortcut_id) || null,
        }));
      } catch (error) {
        // A failed run leaves a row saying why, so the caller gets the shelf back too.
        const failure = shelfRouteErrorResponse(error);
        return { ...failure, body: { ...(failure.body as object), snapshot: await snapshot() } };
      }
    },
    "shelf.job.cancel": async ({ params }) => {
      if (!params.job_id) return { status: 404, body: { error: "这个任务不存在" } };
      return withShelf(await call(shelfActions.cancelJob, { job_id: params.job_id }));
    },
    "shelf.clipboard": async ({ request }) => {
      const text = stringValue(request.body.text);
      if (!text) return { status: 400, body: { error: "剪贴板是空的" } };
      const types = Array.isArray(request.body.types) ? request.body.types.map(String) : [];
      return withShelf(await call(shelfActions.clip, { text, concealed: request.body.concealed === true, types }));
    },
    "shelf.clipboard.delete": async ({ params }) => {
      if (!params.clip_id) return { status: 404, body: { error: "这条剪贴板不存在" } };
      await call(shelfActions.deleteClip, { clip_id: params.clip_id });
      return withShelf({});
    },
    "shelf.clipboard.join": async ({ params }) => {
      if (!params.clip_id) return { status: 404, body: { error: "这条剪贴板不存在" } };
      return withShelf(await call(shelfActions.clipToMaterial, { clip_id: params.clip_id }));
    },
    "shelf.file": async ({ params, request }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      const child = request.query.get("child")?.trim();
      const file = await call(shelfActions.file, { item_id: params.item_id, ...(child ? { child } : {}) });
      return { status: 200, bytes: Buffer.from(file.bytes_base64, "base64"), filename: file.name, mime: file.mime };
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
