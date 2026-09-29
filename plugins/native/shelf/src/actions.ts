import { ActionError, type ActionResultView, type ActionAudience, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  ShelfClipboardRecord, ShelfDeviceSettings, ShelfItemRecord, ShelfJobOutcome, ShelfJobRecord, ShelfRecipeId, ShelfSettingsPatch, ShelfSnapshot,
  ShelfAdmitFolderInput, ShelfAdmitInput, ShelfRunJobInput,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import { parseSettingsWriteBody } from "@molis-ai/molis-work-module-shelf";
import { shelfTextMaterial } from "./material.js";
import { createShelfSearchHandlers, shelfClipboardSearchEntriesAction, shelfSearchEntriesAction } from "./search.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const nullableText = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
// Records are owned by the Shelf store; the contract names what callers rely on without freezing every display field.
const record = (required: readonly string[]) => ({ type: "object", required });
const item = record(["item_id", "group", "kind", "name", "mime", "size_bytes", "hidden", "status", "created_at"]);
const job = record(["job_id", "recipe", "status", "item_ids", "created_at"]);
const itemId = object({ item_id: id });
const read = ["shelf:read"], write = ["shelf:write"];
// The personal store belongs to the Home, not to a project Runtime installation: the Host registers these from the plugin
// package, as it does Jelly and Cognia. The Manifest's `actions` stays reserved for what the Runtime instance redeems.
/** Clipboard history, device settings and the local folder path stay with the person at this computer. */
const LOCAL: readonly ActionAudience[] = ["user"];
const SHARED: readonly ActionAudience[] = ["user", "workflow", "agent", "mcp"];

function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[], audiences: readonly ActionAudience[], resultView?: ActionResultView): ActionDefinition<I, O> {
  // The existing HTTP surface never serialized Shelf: recipes run for minutes while the panel keeps reading and cancelling.
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "home", scheduling: "concurrent", audiences, permissions, subject_kinds: ["shelf_item"], input_schema: input, output_schema: output, ...(resultView ? { result_view: resultView } : {}) } };
}

export interface ShelfAdmitActionInput {
  text?: string; title?: string; capture_pages?: boolean;
  filename?: string; bytes_base64?: string; mime?: string; origin_realpath?: string;
}
export interface ShelfTextView { item_id: string; title: string; text: string; content_hash: string; fingerprint: string }
export const shelfActions = {
  snapshot: define<Record<string, never>, ShelfSnapshot>("snapshot", "读取置物架面板",
    "读取置物架全部状态，含剪贴板历史、设备设置与本机目录，仅供本机界面使用", "query", object({}), { type: "object", required: ["materials", "results", "clipboard"] }, read, LOCAL),
  list: define<Record<string, never>, { materials: ShelfItemRecord[]; results: ShelfItemRecord[]; running_jobs: ShelfJobRecord[] }>("items.list", "Shelf 材料列表",
    "列出置物架上的材料、处理结果和运行中的任务，不含剪贴板与设备设置", "query", object({}),
    object({ materials: { type: "array", items: item }, results: { type: "array", items: item }, running_jobs: { type: "array", items: job } }), read, SHARED),
  readText: define<{ item_id: string }, ShelfTextView>("items.read", "读取 Shelf 文字",
    "读取一份文字材料的完整当前正文；图片、PDF 等需先在 Shelf 提取为文字", "query", itemId,
    object({ item_id: id, title: text, text, content_hash: text, fingerprint: text }), read, SHARED),
  file: define<{ item_id: string; child?: string }, { name: string; mime: string; bytes_base64: string }>("items.file", "读取 Shelf 原文件",
    "读取置物架副本或文件夹内文件的原始字节", "query", object({ item_id: id, child: { type: "string", maxLength: 1000 } }, ["item_id"]),
    object({ name: text, mime: text, bytes_base64: text }), read, LOCAL),
  admit: define<ShelfAdmitActionInput, { item: ShelfItemRecord }>("items.admit", "放进 Shelf",
    "把一段文字（可抓取其中网页）或一个文件副本放进置物架；同一原件重复加入保留原副本", "command",
    object({ text: { type: "string", maxLength: 2_000_000, title: "文字" }, title: { type: "string", maxLength: 200, title: "标题" }, capture_pages: { type: "boolean", title: "抓取其中的网页" },
      filename: { type: "string", maxLength: 500, title: "文件名" }, bytes_base64: { type: "string", maxLength: 128 * 1024 * 1024, title: "文件内容（Base64）" }, mime: { type: "string", maxLength: 200, title: "文件类型" },
      origin_realpath: { type: "string", maxLength: 4096, title: "原文件位置", description: "仅本机界面拖入文件时提供，用于任务前核对原件未变" } }, []),
    object({ item }), write, SHARED, { summary: "已接收材料", title_pointer: "/item/name",
      link: { label: "打开材料", href_template: "/projects/{project_id}/?openPlugin=shelf&openItem={/item/item_id}&openTitle={/item/name}" } }),
  admitFolder: define<{ name: string; entries: { relative: string; bytes_base64: string; mime?: string }[]; origin_realpath?: string }, { item: ShelfItemRecord }>("items.admit-folder", "放进文件夹",
    "把本机界面选中的整个文件夹复制进置物架", "command",
    object({ name: { type: "string", minLength: 1, maxLength: 500 }, entries: { type: "array", minItems: 1, items: object({ relative: { type: "string", minLength: 1, maxLength: 1000 },
      bytes_base64: text, mime: { type: "string", maxLength: 200 } }, ["relative", "bytes_base64"]) }, origin_realpath: { type: "string", maxLength: 4096 } }, ["name", "entries"]),
    object({ item }), write, LOCAL),
  sample: define<Record<string, never>, { item: ShelfItemRecord }>("sample.seed", "放一份示例", "在置物架放入示例材料", "command", object({}), object({ item }), write, LOCAL),
  hide: define<{ item_id: string }, { hidden: true }>("items.hide", "从 Shelf 收起", "从列表收起一份材料，保留副本以便再次接收", "command", itemId, object({ hidden: { const: true } }), write, SHARED),
  delete: define<{ item_id: string }, { deleted: true }>("items.delete", "删除 Shelf 副本", "删除置物架里的副本；运行中的材料不能删除，原件不受影响", "command", itemId, object({ deleted: { const: true } }), write, SHARED),
  useAsMaterial: define<{ item_id: string }, { item: ShelfItemRecord }>("items.use-material", "结果转为材料", "把处理结果复制为新的材料，供下一次处理", "command", itemId, object({ item }), write, SHARED),
  edit: define<{ item_id: string; text: string }, { item: ShelfItemRecord }>("items.edit", "修改 Shelf 文字", "保存文字材料的新正文", "command",
    object({ item_id: id, text: { type: "string", maxLength: 2_000_000 } }), object({ item }), write, SHARED),
  runJob: define<{ recipe: ShelfRecipeId; item_id?: string; item_ids?: string[]; option_id?: string | null; shortcut_id?: string | null }, ShelfJobOutcome>("jobs.run", "用 Shelf 处理材料",
    "用本机终端 Agent 按所选动作处理材料并生成结果；失败时保留任务记录与原因", "command",
    object({ recipe: { type: "string", minLength: 1, maxLength: 100 }, item_id: id, item_ids: { type: "array", minItems: 1, maxItems: 50, items: id },
      option_id: nullableText, shortcut_id: nullableText }, ["recipe"]),
    object({ job, result: { anyOf: [item, { type: "null" }] }, origin_hash: text }), write, SHARED),
  cancelJob: define<{ job_id: string }, { job: ShelfJobRecord }>("jobs.cancel", "取消 Shelf 任务", "取消运行中的处理任务", "command", object({ job_id: id }), object({ job }), write, SHARED),
  settings: define<Record<string, never>, ShelfDeviceSettings>("settings.read", "读取 Shelf 设置", "读取本机快捷键、动作排序与运行时设置", "query", object({}), { type: "object" }, read, LOCAL),
  saveSettings: define<Record<string, unknown>, ShelfDeviceSettings>("settings.write", "保存 Shelf 设置", "修改本机快捷键、动作排序与运行时设置", "command", { type: "object" }, { type: "object" }, write, LOCAL),
  clip: define<{ text: string; concealed?: boolean; types?: string[] }, { clip: ShelfClipboardRecord | null }>("clipboard.add", "记录剪贴板",
    "记录本机剪贴板；密码等标记为隐藏的内容不会保存", "command",
    object({ text: { type: "string", maxLength: 2_000_000 }, concealed: { type: "boolean" }, types: { type: "array", maxItems: 50, items: { type: "string", maxLength: 200 } } }, ["text"]),
    object({ clip: { anyOf: [record(["clip_id", "kind", "title", "body"]), { type: "null" }] } }), write, LOCAL),
  deleteClip: define<{ clip_id: string }, { deleted: true }>("clipboard.delete", "删除剪贴板记录", "删除一条剪贴板历史", "command", object({ clip_id: id }), object({ deleted: { const: true } }), write, LOCAL),
  clipToMaterial: define<{ clip_id: string }, { item: ShelfItemRecord }>("clipboard.material", "剪贴板放进 Shelf", "把一条剪贴板历史放进置物架", "command", object({ clip_id: id }), object({ item }), write, LOCAL),
  searchEntries: shelfSearchEntriesAction,
  clipboardSearchEntries: shelfClipboardSearchEntriesAction,
};
export const SHELF_ACTIONS: readonly ActionDefinition[] = Object.values(shelfActions);
export const SHELF_ACTION_PERMISSIONS = [...new Set(SHELF_ACTIONS.flatMap(definition => definition.action.permissions))];

/** The personal Shelf store, bound by the Host to this Home. */
export interface ShelfActionPorts {
  snapshot(): ShelfSnapshot;
  settings(): ShelfDeviceSettings;
  saveSettings(patch: ShelfSettingsPatch): ShelfDeviceSettings;
  admit(input: ShelfAdmitInput): ShelfItemRecord;
  admitText(body: string, title?: string, capture?: boolean): Promise<ShelfItemRecord>;
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

export function createShelfActionHandlers(ports: ShelfActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller),
  });
  const bytes = (encoded: string) => {
    const decoded = Buffer.from(encoded, "base64");
    if (!decoded.byteLength && encoded.length) throw new ActionError("shelf.invalid", "文件内容无效");
    return decoded;
  };
  return [
    bind(shelfActions.snapshot, () => ports.snapshot()),
    bind(shelfActions.list, () => {
      const { materials, results, running_jobs } = ports.snapshot();
      return { materials: [...materials], results: [...results], running_jobs: [...running_jobs] };
    }),
    bind(shelfActions.readText, input => {
      const { payload, fingerprint } = shelfTextMaterial(ports.readFile(input.item_id));
      return { item_id: input.item_id, title: payload.title, text: payload.text, content_hash: payload.content_hash, fingerprint };
    }),
    bind(shelfActions.file, input => {
      const file = input.child?.trim() ? ports.readChild(input.item_id, input.child.trim()) : (({ item, bytes }) => ({ name: item.name, mime: item.mime, bytes }))(ports.readFile(input.item_id));
      return { name: file.name, mime: file.mime, bytes_base64: file.bytes.toString("base64") };
    }),
    bind(shelfActions.admit, async (input, caller) => {
      // The store hashes the file at this path before each run; only the local interface names real paths.
      if (input.origin_realpath && caller.audience !== "user") throw new ActionError("actions.forbidden", "只有本机界面可以登记原件路径");
      const typed = input.text?.trim();
      if (typed) return { item: await ports.admitText(typed, input.title?.trim() || undefined, input.capture_pages !== false) };
      const filename = input.filename?.trim();
      if (!filename || !input.bytes_base64) throw new ActionError("shelf.invalid", "请选择要加入的文件");
      return { item: ports.admit({ filename, bytes: bytes(input.bytes_base64), mime: input.mime?.trim() || undefined, origin_realpath: input.origin_realpath?.trim() || null }) };
    }),
    bind(shelfActions.admitFolder, input => ({ item: ports.admitFolder({ name: input.name.trim(), origin_realpath: input.origin_realpath?.trim() || null,
      entries: input.entries.map(entry => ({ relative: entry.relative, bytes: bytes(entry.bytes_base64), mime: entry.mime || undefined })) }) })),
    bind(shelfActions.sample, () => ({ item: ports.seedSample() })),
    bind(shelfActions.hide, input => { ports.hide(input.item_id); return { hidden: true as const }; }),
    bind(shelfActions.delete, input => { ports.deleteCopy(input.item_id); return { deleted: true as const }; }),
    bind(shelfActions.useAsMaterial, input => ({ item: ports.useAsMaterial(input.item_id) })),
    bind(shelfActions.edit, input => ({ item: ports.writeCopy(input.item_id, input.text) })),
    bind(shelfActions.runJob, input => {
      if (!input.item_id && !input.item_ids?.length) throw new ActionError("shelf.invalid", "请选择动作和材料");
      return ports.runJob({ recipe: input.recipe, item_id: input.item_id, item_ids: input.item_ids, option_id: input.option_id ?? null, shortcut_id: input.shortcut_id ?? null });
    }),
    bind(shelfActions.cancelJob, input => ({ job: ports.cancelJob(input.job_id) })),
    bind(shelfActions.settings, () => ports.settings()),
    bind(shelfActions.saveSettings, input => {
      const parsed = parseSettingsWriteBody(input);
      if ("error" in parsed) throw new ActionError("shelf.invalid", parsed.error);
      return ports.saveSettings(parsed.ok);
    }),
    bind(shelfActions.clip, input => ({ clip: ports.addClipboard(input.text, { concealed: input.concealed === true, types: input.types ?? [] }) })),
    bind(shelfActions.deleteClip, input => { ports.deleteClipboard(input.clip_id); return { deleted: true as const }; }),
    bind(shelfActions.clipToMaterial, async input => ({ item: await ports.clipboardToMaterial(input.clip_id) })),
    ...createShelfSearchHandlers(() => ports.snapshot()),
  ];
}

/** Saving a personal copy into a project writes a project Artifact owned by the person who confirmed it. */
export interface ShelfMaterialPreview { payload: import("@molis-ai/molis-work-contracts/modules/shelf").ShelfTextMaterial; fingerprint: string }
function defineProject<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[]): ActionDefinition<I, O> {
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences: LOCAL, permissions, subject_kinds: ["shelf_item"], input_schema: input, output_schema: output } };
}
const material = object({ title: text, text, content_hash: text, source: { type: "object", required: ["item_id"] } });
export const shelfProjectActions = {
  previewMaterial: defineProject<{ item_id: string }, ShelfMaterialPreview>("material.preview", "预览项目材料",
    "预览将从 Shelf 保存到当前项目的完整文字与指纹", "query", itemId, object({ payload: material, fingerprint: text }), read),
  saveMaterial: defineProject<{ item_id: string; expected_fingerprint: string }, { reference: { artifact_id: string; version: number }; title: string }>("material.save", "保存为项目材料",
    "按已预览的指纹把 Shelf 文字保存为当前项目的固定版本材料；内容变化时拒绝", "command",
    object({ item_id: id, expected_fingerprint: { type: "string", minLength: 1 } }),
    object({ reference: object({ artifact_id: id, version: { type: "integer", minimum: 1 } }), title: text }), [...read, "artifact:write"]),
};
export const SHELF_PROJECT_ACTIONS: readonly ActionDefinition[] = Object.values(shelfProjectActions);
export const SHELF_PROJECT_ACTION_PERMISSIONS = [...new Set(SHELF_PROJECT_ACTIONS.flatMap(definition => definition.action.permissions))];

export interface ShelfProjectActionPorts {
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer };
  publish(payload: ShelfMaterialPreview["payload"], actorId: string): { artifact_id: string; version: number };
}

export function createShelfProjectActionHandlers(projectId: string, ports: ShelfProjectActionPorts): ActionHandlerBinding[] {
  const current = (caller: ActionCallContext, itemId: string) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请在项目中打开 Shelf，再保存项目材料");
    return shelfTextMaterial(ports.readFile(itemId));
  };
  return [
    { ...shelfProjectActions.previewMaterial, handle: (caller, input) => current(caller, (input as { item_id: string }).item_id) },
    { ...shelfProjectActions.saveMaterial, handle: async (caller, input) => {
      const { item_id, expected_fingerprint } = input as { item_id: string; expected_fingerprint: string };
      const value = current(caller, item_id);
      if (value.fingerprint !== expected_fingerprint) throw new ActionError("shelf.conflict", "材料已变化，请重新预览后保存");
      await caller.beforeEffect();
      return { reference: ports.publish(value.payload, caller.actor_id), title: value.payload.title };
    } },
  ];
}
