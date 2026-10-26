import { ActionError, type ActionAvailability, type ActionResultView, type ActionAudience, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  ShelfClipboardRecord, ShelfDeviceSettings, ShelfItemRecord, ShelfJobOutcome, ShelfJobRecord, ShelfRecipeId, ShelfSettingsPatch, ShelfSnapshot,
  ShelfAdmitFolderInput, ShelfAdmitInput, ShelfRunJobInput, ShelfExecutionControl, ShelfAdmitActionInput,
} from "@molis-ai/molis-work-module-shelf/contract";
import { SHELF_ADMIT_ACTION } from "@molis-ai/molis-work-module-shelf/contract";
import { isHttpUrl, parseSettingsWriteBody, shelfErrors, SHELF_RECIPES, SHELF_SHORTCUT_RECIPE, SHELF_JOB_TIMEOUT_MS } from "@molis-ai/molis-work-module-shelf";
import { shelfTextMaterial } from "./material.js";
import { createShelfSearchHandlers, shelfClipboardSearchEntriesAction, shelfFileContentAction, shelfFileEntriesAction, shelfSearchEntriesAction, shelfSubjectAction } from "./search.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const nullableText = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
// Records are owned by the Shelf store; the contract names what callers rely on without freezing every display field.
const record = (required: readonly string[]) => ({ type: "object", required });
const item = record(["item_id", "group", "kind", "name", "mime", "size_bytes", "hidden", "status", "created_at"]);
const job = record(["job_id", "recipe", "status", "item_ids", "created_at"]);
const itemId = object({ item_id: id });
// A write reads the shelf it changes; the files service asks each action for the permission of what it does.
const read = ["shelf:read"], write = [...read, "shelf:write"];
// The personal store belongs to the Home: Shelf's Home instance offers these, each project's instance the project ones.
/** Clipboard history, device settings and the local folder path stay with the person at this computer. */
const LOCAL: readonly ActionAudience[] = ["user"];
const SHARED: readonly ActionAudience[] = ["user", "workflow", "agent", "mcp"];

function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[], audiences: readonly ActionAudience[], resultView?: ActionResultView): ActionDefinition<I, O> {
  // The existing HTTP surface never serialized Shelf: recipes run for minutes while the panel keeps reading and cancelling.
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "home", scheduling: "concurrent", audiences, permissions, subject_kinds: ["shelf_item"], input_schema: input, output_schema: output, ...(resultView ? { result_view: resultView } : {}) } };
}

function jobDefinition(name: string, title: string, description: string, recipes: readonly ShelfRecipeId[], cost: "none" | "metered", permissions: readonly string[]): ActionDefinition<ShelfRunJobInput, ShelfJobOutcome> {
  const definition = define<ShelfRunJobInput, ShelfJobOutcome>(name, title, description, "command",
    object({ recipe: { type: "string", enum: recipes }, item_id: id, item_ids: { type: "array", minItems: 1, maxItems: 50, items: id },
      option_id: nullableText, shortcut_id: nullableText }, ["recipe"]),
    object({ job, result: { anyOf: [item, { type: "null" }] }, origin_hash: text }), permissions, SHARED);
  return { ...definition, action: { ...definition.action, execution: { cost, timeout_ms: SHELF_JOB_TIMEOUT_MS } } };
}
const AI_RECIPES = [...SHELF_RECIPES, SHELF_SHORTCUT_RECIPE].filter(recipe => recipe.requires_agent).map(recipe => recipe.recipe);

export type { ShelfAdmitActionInput };
export interface ShelfTextView { item_id: string; title: string; text: string; content_hash: string; fingerprint: string }
export const shelfActions = {
  terminal: define<Record<string, never>, { panelId: string }>("terminal.open", "打开置物架终端", "在置物架副本目录打开本机 Agent", "command", object({}), object({ panelId: id }), [...read, "terminal:run"], LOCAL),
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
  // Defined in the Shelf contract, so another plugin invokes this very definition.
  admit: SHELF_ADMIT_ACTION,
  // Version 2 names no original folder: a folder has no 原件已变 check, and only the platform keeps a path (`original`).
  admitFolder: { ...define<{ name: string; entries: { relative: string; bytes_base64: string; mime?: string }[] }, { item: ShelfItemRecord }>("items.admit-folder", "放进文件夹",
    "把本机界面选中的整个文件夹复制进置物架，最多 32 MB", "command",
    object({ name: { type: "string", minLength: 1, maxLength: 500 }, entries: { type: "array", minItems: 1, items: object({ relative: { type: "string", minLength: 1, maxLength: 1000 },
      bytes_base64: text, mime: { type: "string", maxLength: 200 } }, ["relative", "bytes_base64"]) } }),
    object({ item }), write, LOCAL), version: 2 },
  capture: define<{ url: string }, { item: ShelfItemRecord }>("items.capture", "抓取网页放进 Shelf",
    "抓取一个公开网页或本机网页的正文，存成置物架里的一份材料；局域网地址不抓，抓不到时只保存链接", "command",
    object({ url: { type: "string", minLength: 1, maxLength: 4096 } }), object({ item }), [...write, "materials:fetch", "materials:fetch_local"], SHARED),
  original: define<{ item_id: string }, { registered: true }>("items.original", "登记原件",
    "把本机界面这次放进来的文件登记为这份副本的原件，处理前先核对原件没变；路径只由平台保存", "command",
    itemId, object({ registered: { const: true } }), [...read, "materials:original"], LOCAL),
  sample: define<Record<string, never>, { item: ShelfItemRecord }>("sample.seed", "放一份示例", "在置物架放入示例材料", "command", object({}), object({ item }), write, LOCAL),
  hide: define<{ item_id: string }, { hidden: true }>("items.hide", "从 Shelf 收起", "从列表收起一份材料，保留副本以便再次接收", "command", itemId, object({ hidden: { const: true } }), write, SHARED),
  delete: define<{ item_id: string }, { deleted: true }>("items.delete", "删除 Shelf 副本", "删除置物架里的副本；运行中的材料不能删除，原件不受影响", "command", itemId, object({ deleted: { const: true } }), [...write, "materials:original"], SHARED),
  useAsMaterial: define<{ item_id: string }, { item: ShelfItemRecord }>("items.use-material", "结果转为材料", "把处理结果复制为新的材料，供下一次处理", "command", itemId, object({ item }), write, SHARED),
  edit: define<{ item_id: string; text: string }, { item: ShelfItemRecord }>("items.edit", "修改 Shelf 文字", "用新的正文覆盖置物架里一份文字材料的副本，原件不受影响，旧正文不保留；只有可编辑的文字材料能改，正文最多 512 KB", "command",
    object({ item_id: id, text: { type: "string", maxLength: 2_000_000 } }), object({ item }), write, SHARED),
  generate: jobDefinition("jobs.generate", "用 AI 处理 Shelf 材料", "通过配置的模型和共享 Prologue 生成结果，可能产生模型费用；不执行终端命令", AI_RECIPES, "metered", [...write, "model:invoke", "materials:read", "materials:original"]),
  extract: jobDefinition("jobs.extract", "在本机提取 Shelf 文字", "在本机提取 PDF 或图片文字，不调用模型或联网", ["extract_text"], "none", [...write, "materials:read", "materials:original"]),
  cancelJob: define<{ job_id: string }, { job: ShelfJobRecord }>("jobs.cancel", "取消 Shelf 任务", "中止一个运行中的处理任务并把它标为已取消；已经结束的任务原样返回，不报错", "command", object({ job_id: id }), object({ job }), write, SHARED),
  settings: define<Record<string, never>, ShelfDeviceSettings>("settings.read", "读取 Shelf 设置", "读取本机快捷键、动作排序与运行时设置", "query", object({}), { type: "object" }, read, LOCAL),
  saveSettings: define<Record<string, unknown>, ShelfDeviceSettings>("settings.write", "保存 Shelf 设置", "修改本机快捷键、动作排序与运行时设置", "command", { type: "object" }, { type: "object" }, write, LOCAL),
  clip: define<{ text: string; concealed?: boolean; types?: string[] }, { clip: ShelfClipboardRecord | null }>("clipboard.add", "记录剪贴板",
    "记录本机剪贴板；密码等标记为隐藏的内容不会保存", "command",
    object({ text: { type: "string", maxLength: 2_000_000 }, concealed: { type: "boolean" }, types: { type: "array", maxItems: 50, items: { type: "string", maxLength: 200 } } }, ["text"]),
    object({ clip: { anyOf: [record(["clip_id", "kind", "title", "body"]), { type: "null" }] } }), write, LOCAL),
  deleteClip: define<{ clip_id: string }, { deleted: true }>("clipboard.delete", "删除剪贴板记录", "删除一条剪贴板历史", "command", object({ clip_id: id }), object({ deleted: { const: true } }), write, LOCAL),
  clipToMaterial: define<{ clip_id: string }, { item: ShelfItemRecord }>("clipboard.material", "剪贴板放进 Shelf", "把一条剪贴板历史放进置物架", "command", object({ clip_id: id }), object({ item }),
    [...write, "materials:read", "materials:fetch", "materials:fetch_local"], LOCAL),
  searchEntries: shelfSearchEntriesAction,
  subject: shelfSubjectAction,
  files: shelfFileEntriesAction,
  fileContent: shelfFileContentAction,
  clipboardSearchEntries: shelfClipboardSearchEntriesAction,
};
export const SHELF_ACTIONS: readonly ActionDefinition[] = Object.values(shelfActions);
export const SHELF_ACTION_PERMISSIONS = [...new Set(SHELF_ACTIONS.flatMap(definition => definition.action.permissions))];

/** The personal Shelf store, bound by the Host to this Home. */
export interface ShelfActionPorts {
  /** Whether a recipe can reach a model now; asked outside any action, so it reads no Shelf file and no other plugin's model list. */
  aiAvailability?(): ActionAvailability;
  snapshot(): ShelfSnapshot | Promise<ShelfSnapshot>;
  settings(): ShelfDeviceSettings;
  saveSettings(patch: ShelfSettingsPatch): ShelfDeviceSettings | Promise<ShelfDeviceSettings>;
  admit(input: ShelfAdmitInput, control?: ShelfExecutionControl): ShelfItemRecord | Promise<ShelfItemRecord>;
  admitText(body: string, title?: string, capture?: boolean, control?: ShelfExecutionControl): Promise<ShelfItemRecord>;
  captureUrl(url: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord>;
  claimOriginal(itemId: string): Promise<void>;
  admitFolder(input: ShelfAdmitFolderInput): ShelfItemRecord | Promise<ShelfItemRecord>;
  readChild(itemId: string, relative: string): { name: string; mime: string; bytes: Buffer };
  seedSample(): ShelfItemRecord | Promise<ShelfItemRecord>;
  hide(itemId: string): void | Promise<void>;
  deleteCopy(itemId: string): void | Promise<void>;
  runJob(input: ShelfRunJobInput, control?: ShelfExecutionControl): Promise<ShelfJobOutcome>;
  cancelJob(jobId: string): ShelfJobRecord | Promise<ShelfJobRecord>;
  useAsMaterial(itemId: string): ShelfItemRecord | Promise<ShelfItemRecord>;
  addClipboard(body: string, extra?: { concealed?: boolean; types?: readonly string[] }): ShelfClipboardRecord | null | Promise<ShelfClipboardRecord | null>;
  clipboardToMaterial(clipId: string, control?: ShelfExecutionControl): Promise<ShelfItemRecord>;
  deleteClipboard(clipId: string): void | Promise<void>;
  writeCopy(itemId: string, text: string): ShelfItemRecord | Promise<ShelfItemRecord>;
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer };
}

export function createShelfActionHandlers(ports: ShelfActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionExecutionContext) => O | Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller),
    ...(definition.capability_id === shelfActions.generate.capability_id && ports.aiAvailability ? { availability: () => ports.aiAvailability!() } : {}),
  });
  const bytes = (encoded: string) => {
    const decoded = Buffer.from(encoded, "base64");
    if (!decoded.byteLength && encoded.length) throw shelfErrors.invalid("文件内容无效");
    return decoded;
  };
  return [
    bind(shelfActions.snapshot, () => ports.snapshot()),
    bind(shelfActions.list, async () => {
      const { materials, results, running_jobs } = await ports.snapshot();
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
      const control = { signal: caller.signal, beforeEffect: () => caller.beforeEffect() };
      // A link stays a link here: fetching its page is `capture`'s, under its own permissions.
      const typed = input.text?.trim();
      if (typed) return { item: await ports.admitText(typed, input.title?.trim() || undefined, false, control) };
      const filename = input.filename?.trim();
      if (!filename || !input.bytes_base64) throw shelfErrors.invalid("请选择要加入的文件");
      return { item: await ports.admit({ filename, bytes: bytes(input.bytes_base64), mime: input.mime?.trim() || undefined }, control) };
    }),
    bind(shelfActions.admitFolder, async input => ({ item: await ports.admitFolder({ name: input.name.trim(),
      entries: input.entries.map(entry => ({ relative: entry.relative, bytes: bytes(entry.bytes_base64), mime: entry.mime || undefined })) }) })),
    bind(shelfActions.capture, async (input, caller) => {
      if (!isHttpUrl(input.url.trim())) throw shelfErrors.invalid("请给出 http 或 https 网址");
      return { item: await ports.captureUrl(input.url.trim(), { signal: caller.signal, beforeEffect: () => caller.beforeEffect() }) };
    }),
    bind(shelfActions.original, async input => { await ports.claimOriginal(input.item_id); return { registered: true as const }; }),
    bind(shelfActions.sample, async () => ({ item: await ports.seedSample() })),
    bind(shelfActions.hide, async input => { await ports.hide(input.item_id); return { hidden: true as const }; }),
    bind(shelfActions.delete, async input => { await ports.deleteCopy(input.item_id); return { deleted: true as const }; }),
    bind(shelfActions.useAsMaterial, async input => ({ item: await ports.useAsMaterial(input.item_id) })),
    bind(shelfActions.edit, async input => ({ item: await ports.writeCopy(input.item_id, input.text) })),
    ...[shelfActions.generate, shelfActions.extract].map(definition => bind(definition, async (input, caller) => {
      if (!input.item_id && !input.item_ids?.length) throw shelfErrors.invalid("请选择动作和材料");
      const beforeEffect = () => caller.beforeEffect();
      await beforeEffect();
      return ports.runJob(input, { signal: caller.signal, beforeEffect });
    })),
    bind(shelfActions.cancelJob, async input => ({ job: await ports.cancelJob(input.job_id) })),
    bind(shelfActions.settings, () => ports.settings()),
    bind(shelfActions.saveSettings, input => {
      const parsed = parseSettingsWriteBody(input);
      if ("error" in parsed) throw shelfErrors.invalid(parsed.error);
      return ports.saveSettings(parsed.ok);
    }),
    bind(shelfActions.clip, async input => ({ clip: await ports.addClipboard(input.text, { concealed: input.concealed === true, types: input.types ?? [] }) })),
    bind(shelfActions.deleteClip, async input => { await ports.deleteClipboard(input.clip_id); return { deleted: true as const }; }),
    bind(shelfActions.clipToMaterial, async (input, caller) => ({ item: await ports.clipboardToMaterial(input.clip_id, { signal: caller.signal, beforeEffect: () => caller.beforeEffect() }) })),
    ...createShelfSearchHandlers(() => ports.snapshot(), itemId => ports.readFile(itemId)),
  ];
}

/** Saving a personal copy into a project writes a project Artifact owned by the person who confirmed it. */
export interface ShelfMaterialPreview { payload: import("@molis-ai/molis-work-module-shelf/contract").ShelfTextMaterial; fingerprint: string }
function defineProject<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  output: ActionSchema, permissions: readonly string[]): ActionDefinition<I, O> {
  return { capability_id: `shelf.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
    scope: "project", scheduling: "concurrent", audiences: LOCAL, permissions, subject_kinds: ["shelf_item"], input_schema: input, output_schema: output } };
}
const material = object({ title: text, text, content_hash: text, source: { type: "object", required: ["item_id"] } });
export const shelfProjectActions = {
  previewMaterial: defineProject<{ item_id: string }, ShelfMaterialPreview>("material.preview", "预览要存到项目资料的文字",
    "预览将从 Shelf 存到当前项目资料的完整文字与指纹", "query", itemId, object({ payload: material, fingerprint: text }), read),
  saveMaterial: defineProject<{ item_id: string; expected_fingerprint: string }, { reference: { artifact_id: string; version: number }; title: string }>("material.save", "存到项目资料",
    "按已预览的指纹把 Shelf 文字存进当前项目的资料（成果库里的一份导入文档，项目里的 Agent 都能找到）；内容变化时拒绝", "command",
    object({ item_id: id, expected_fingerprint: { type: "string", minLength: 1 } }),
    object({ reference: object({ artifact_id: id, version: { type: "integer", minimum: 1 } }), title: text }), [...read, "artifacts:read", "artifacts:write", "actions:invoke"]),
};
export const SHELF_PROJECT_ACTIONS: readonly ActionDefinition[] = Object.values(shelfProjectActions);
export const SHELF_PROJECT_ACTION_PERMISSIONS = [...new Set(SHELF_PROJECT_ACTIONS.flatMap(definition => definition.action.permissions))];

export interface ShelfProjectActionPorts {
  readFile(itemId: string): { item: ShelfItemRecord; bytes: Buffer };
  /** Saves the text into the project's knowledge as the caller; the same text saved again keeps its version. */
  publish(payload: ShelfMaterialPreview["payload"], caller: ActionExecutionContext): Promise<{ artifact_id: string; version: number }>;
}

export function createShelfProjectActionHandlers(projectId: string, ports: ShelfProjectActionPorts): ActionHandlerBinding[] {
  const current = (caller: ActionCallContext, itemId: string) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请在项目中打开 Shelf，再存到项目资料");
    return shelfTextMaterial(ports.readFile(itemId));
  };
  return [
    { ...shelfProjectActions.previewMaterial, handle: (caller, input) => current(caller, (input as { item_id: string }).item_id) },
    { ...shelfProjectActions.saveMaterial, handle: async (caller, input) => {
      const { item_id, expected_fingerprint } = input as { item_id: string; expected_fingerprint: string };
      const value = current(caller, item_id);
      if (value.fingerprint !== expected_fingerprint) throw shelfErrors.conflict("材料已变化，请重新预览后保存");
      await caller.beforeEffect();
      return { reference: await ports.publish(value.payload, caller), title: value.payload.title };
    } },
  ];
}
