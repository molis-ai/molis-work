import type { ShelfAdmitInput, ShelfRecipeId, ShelfSnapshot } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ShelfItemRecord, ShelfJobRecord, ShelfClipboardRecord } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { ShelfPluginRouteHandler } from "./routes.js";

export interface ShelfRouteHandlerPorts {
  snapshot(): ShelfSnapshot;
  admit(input: ShelfAdmitInput): ShelfItemRecord;
  admitText(body: string, title?: string): ShelfItemRecord;
  seedSample(): ShelfItemRecord;
  hide(itemId: string): void;
  deleteCopy(itemId: string): void;
  runJob(recipe: ShelfRecipeId, itemId: string): { job: ShelfJobRecord; result: ShelfItemRecord | null; origin_hash: string };
  useAsMaterial(itemId: string): ShelfItemRecord;
  addClipboard(body: string, extra?: { concealed?: boolean; types?: readonly string[] }): ShelfClipboardRecord | null;
  clipboardToMaterial(clipId: string): ShelfItemRecord;
  deleteClipboard(clipId: string): void;
  writeCopy(itemId: string, text: string): ShelfItemRecord;
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer };
}

export function createShelfRouteHandlers(options: ShelfRouteHandlerPorts): Record<string, ShelfPluginRouteHandler> {
  return {
    "shelf.snapshot": () => ({ status: 200, body: options.snapshot() }),
    "shelf.sample": () => ({ status: 200, body: { item: options.seedSample(), snapshot: options.snapshot() } }),
    "shelf.admit": ({ request }) => {
      const text = stringValue(request.body.text);
      if (text) return { status: 200, body: { item: options.admitText(text, stringValue(request.body.title) || undefined), snapshot: options.snapshot() } };
      const filename = stringValue(request.body.filename);
      const encoded = stringValue(request.body.bytes_base64);
      if (!filename || !encoded) return { status: 400, body: { error: "请选择要加入的文件" } };
      let bytes: Buffer;
      try {
        bytes = Buffer.from(encoded, "base64");
      } catch {
        return { status: 400, body: { error: "文件内容无效" } };
      }
      const item = options.admit({
        filename,
        bytes,
        mime: stringValue(request.body.mime) || undefined,
        origin_realpath: stringValue(request.body.origin_realpath) || null,
      });
      return { status: 200, body: { item, snapshot: options.snapshot() } };
    },
    "shelf.hide": ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      options.hide(params.item_id);
      return { status: 200, body: { snapshot: options.snapshot() } };
    },
    "shelf.delete": ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      options.deleteCopy(params.item_id);
      return { status: 200, body: { snapshot: options.snapshot() } };
    },
    "shelf.useMaterial": ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      const item = options.useAsMaterial(params.item_id);
      return { status: 200, body: { item, snapshot: options.snapshot() } };
    },
    "shelf.edit": ({ params, request }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      if (typeof request.body.text !== "string") return { status: 400, body: { error: "请输入要保存的文字" } };
      const item = options.writeCopy(params.item_id, request.body.text);
      return { status: 200, body: { item, snapshot: options.snapshot() } };
    },
    "shelf.job": ({ request }) => {
      const recipe = stringValue(request.body.recipe) as ShelfRecipeId;
      const itemId = stringValue(request.body.item_id);
      if (!recipe || !itemId) return { status: 400, body: { error: "请选择动作和材料" } };
      const result = options.runJob(recipe, itemId);
      return { status: 200, body: { ...result, snapshot: options.snapshot() } };
    },
    "shelf.clipboard": ({ request }) => {
      const text = stringValue(request.body.text);
      if (!text) return { status: 400, body: { error: "剪贴板是空的" } };
      const types = Array.isArray(request.body.types) ? request.body.types.map(String) : [];
      return {
        status: 200,
        body: {
          clip: options.addClipboard(text, { concealed: request.body.concealed === true, types }),
          snapshot: options.snapshot(),
        },
      };
    },
    "shelf.clipboard.delete": ({ params }) => {
      if (!params.clip_id) return { status: 404, body: { error: "这条剪贴板不存在" } };
      options.deleteClipboard(params.clip_id);
      return { status: 200, body: { snapshot: options.snapshot() } };
    },
    "shelf.clipboard.join": ({ params }) => {
      if (!params.clip_id) return { status: 404, body: { error: "这条剪贴板不存在" } };
      const item = options.clipboardToMaterial(params.clip_id);
      return { status: 200, body: { item, snapshot: options.snapshot() } };
    },
    "shelf.file": ({ params }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      const file = options.readFile(params.item_id);
      return {
        status: 200,
        bytes: file.bytes,
        filename: file.item.name,
        mime: file.item.mime,
      };
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
