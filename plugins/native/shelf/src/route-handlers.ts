import type {
  ShelfAdmitFolderInput,
  ShelfAdmitInput,
  ShelfDeviceSettings,
  ShelfJobOutcome,
  ShelfRecipeId,
  ShelfRunJobInput,
  ShelfSettingsPatch,
  ShelfSnapshot,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { parseSettingsWriteBody } from "@molis-ai/molis-work-module-shelf";
import type { ShelfItemRecord, ShelfClipboardRecord, ShelfJobRecord } from "@molis-ai/molis-work-contracts/modules/shelf";
import { shelfRouteErrorResponse } from "./route-error.js";
import type { ShelfPluginRouteHandler } from "./routes.js";

export interface ShelfRouteHandlerPorts {
  snapshot(): ShelfSnapshot;
  settings(): ShelfDeviceSettings;
  saveSettings(patch: ShelfSettingsPatch): ShelfDeviceSettings;
  admit(input: ShelfAdmitInput): ShelfItemRecord;
  admitText(body: string, title?: string): Promise<ShelfItemRecord>;
  admitFolder(input: ShelfAdmitFolderInput): ShelfItemRecord;
  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer };
  seedSample(): ShelfItemRecord;
  hide(itemId: string): void;
  deleteCopy(itemId: string): void;
  runJob(input: ShelfRunJobInput): Promise<ShelfJobOutcome>;
  cancelJob(jobId: string): ShelfJobRecord;
  useAsMaterial(itemId: string): ShelfItemRecord;
  addClipboard(body: string, extra?: { concealed?: boolean; types?: readonly string[] }): ShelfClipboardRecord | null;
  clipboardToMaterial(clipId: string): Promise<ShelfItemRecord>;
  deleteClipboard(clipId: string): void;
  writeCopy(itemId: string, text: string): ShelfItemRecord;
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer };
}

export function createShelfRouteHandlers(options: ShelfRouteHandlerPorts): Record<string, ShelfPluginRouteHandler> {
  return {
    "shelf.snapshot": () => ({ status: 200, body: options.snapshot() }),
    "shelf.settings.read": () => ({ status: 200, body: options.settings() }),
    "shelf.settings.write": ({ request }) => {
      const parsed = parseSettingsWriteBody(request.body);
      if ("error" in parsed) return { status: 400, body: { error: parsed.error } };
      return { status: 200, body: options.saveSettings(parsed.ok) };
    },
    "shelf.sample": () => ({ status: 200, body: { item: options.seedSample(), snapshot: options.snapshot() } }),
    "shelf.admit": async ({ request }) => {
      const text = stringValue(request.body.text);
      if (text) {
        const item = await options.admitText(text, stringValue(request.body.title) || undefined);
        return { status: 200, body: { item, snapshot: options.snapshot() } };
      }
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
    "shelf.folder": ({ request }) => {
      const name = stringValue(request.body.name);
      const raw = Array.isArray(request.body.entries) ? request.body.entries : [];
      if (!name || !raw.length) return { status: 400, body: { error: "请选择要加入的文件夹" } };
      const entries = raw.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const record = entry as Record<string, unknown>;
        const relative = stringValue(record.relative);
        const encoded = stringValue(record.bytes_base64);
        if (!relative || !encoded) return [];
        return [{ relative, bytes: Buffer.from(encoded, "base64"), mime: stringValue(record.mime) || undefined }];
      });
      if (!entries.length) return { status: 400, body: { error: "这个文件夹里没有可以加入的文件" } };
      const item = options.admitFolder({ name, entries });
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
    "shelf.job": async ({ request }) => {
      const recipe = stringValue(request.body.recipe) as ShelfRecipeId;
      const itemIds = Array.isArray(request.body.item_ids)
        ? request.body.item_ids.map((value) => String(value).trim()).filter(Boolean)
        : [];
      const itemId = stringValue(request.body.item_id);
      if (!recipe || (!itemIds.length && !itemId)) return { status: 400, body: { error: "请选择动作和材料" } };
      try {
        const outcome = await options.runJob({
          recipe,
          item_id: itemId || undefined,
          item_ids: itemIds.length ? itemIds : undefined,
          option_id: stringValue(request.body.option_id) || null,
          shortcut_id: stringValue(request.body.shortcut_id) || null,
        });
        return { status: 200, body: { ...outcome, snapshot: options.snapshot() } };
      } catch (error) {
        // A failed run leaves a row saying why, so the caller gets the shelf back too.
        const failure = shelfRouteErrorResponse(error);
        return { ...failure, body: { ...(failure.body as object), snapshot: options.snapshot() } };
      }
    },
    "shelf.job.cancel": ({ params }) => {
      if (!params.job_id) return { status: 404, body: { error: "这个任务不存在" } };
      return { status: 200, body: { job: options.cancelJob(params.job_id), snapshot: options.snapshot() } };
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
    "shelf.clipboard.join": async ({ params }) => {
      if (!params.clip_id) return { status: 404, body: { error: "这条剪贴板不存在" } };
      const item = await options.clipboardToMaterial(params.clip_id);
      return { status: 200, body: { item, snapshot: options.snapshot() } };
    },
    "shelf.file": ({ params, request }) => {
      if (!params.item_id) return { status: 404, body: { error: "这份材料不在架子上" } };
      const child = request.query.get("child")?.trim();
      if (child) {
        const inside = options.readChild(params.item_id, child);
        return { status: 200, bytes: inside.bytes, filename: inside.name, mime: inside.mime };
      }
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
