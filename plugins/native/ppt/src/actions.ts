import { ActionError, type ActionDefinition, type ActionSchema, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PptRecord, PptSlideInput } from "@molis-ai/molis-work-contracts/modules/ppt";
import { promotePpt, type PptPublishArtifactPort, type PptReadArtifactPort } from "./promote.js";
import type { PptStore } from "./store.js";

const text = { type: "string" }, id = { ...text, minLength: 1, pattern: "\\S" }, version = { type: "integer", minimum: 1 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const array = (items: unknown) => ({ type: "array", items });
const color = { ...text, pattern: "^#[0-9a-fA-F]{6}$" };
const slideFields = { id: text, title: text, bullets: { ...array(text), maxItems: 12 }, notes: text, order: { type: "integer" } };
const recordFields = { id, project_id: id, title: text, description: text, color_primary: color, color_background: color, color_text: color,
  slides: array(object(slideFields)), created_at: text, updated_at: text, version, artifact_id: text, artifact_version: { type: "integer", minimum: 0 } };
const record = object({ ...recordFields, publication_pending: object({ version, source_version: version }) }, Object.keys(recordFields));
const changed = object({ presentation: record }), identity = { id, expected_version: version };
const read = ["ppt:read"], write = ["ppt:read", "ppt:write"];
type Identity = { id: string; expected_version?: number };
type Edit = Identity & { title?: string; description?: string; color_primary?: string; color_background?: string; color_text?: string; slides?: readonly PptSlideInput[] };
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema, permissions: readonly string[] = operation === "query" ? read : write): ActionDefinition<I, O> {
  return { capability_id: `ppt.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "workflow", "agent", "mcp"], subject_kinds: ["ppt"], input_schema: input, output_schema: output, permissions } };
}
export const pptActions = {
  list: define<Record<string, never>, { presentations: PptRecord[] }>("list", "演示稿列表", "读取当前项目的演示稿", "query", object({}), object({ presentations: array(record) })),
  get: define<{ id: string }, { presentation: PptRecord }>("get", "读取演示稿", "读取幻灯片、配色、版本和发布状态；id 来自列表或创建结果", "query", object({ id }), changed),
  create: define<{ title?: string }, { presentation: PptRecord }>("create", "新建演示稿", "创建带一页空白幻灯片的演示稿", "command", object({ title: { ...text, maxLength: 80 } }, []), changed),
  update: define<Edit, { presentation: PptRecord }>("update", "编辑演示稿", "替换指定字段或整组幻灯片；提交读取版本以避免覆盖其他编辑", "command", object({ ...identity, title: { ...text, maxLength: 80 }, description: { ...text, maxLength: 2000 }, color_primary: color, color_background: color, color_text: color,
    slides: { ...array(object(slideFields, [])), minItems: 1, maxItems: 40 } }, ["id"]), changed),
  delete: define<Identity, { ok: true }>("delete", "删除演示稿", "删除当前项目演示稿，待恢复的 Artifact 发布需先完成", "command", object(identity, ["id"]), object({ ok: { const: true } })),
  export: define<Identity, { filename: string; mime_type: "application/json"; content: string }>("export", "导出演示稿 JSON", "返回已保存演示稿的完整 JSON、文件名和 MIME 类型；不是 PPTX", "query", object(identity, ["id"]), object({ filename: text, mime_type: { const: "application/json" }, content: text })),
  promote: define<Identity, { presentation: PptRecord; artifact: { artifact_id: string; version: number }; recovered: boolean }>("promote", "演示稿存成 Artifact", "发布固定幻灯片与配色或恢复原发布；后续编辑保留", "command", object(identity, ["id"]), object({ presentation: record, artifact: object({ artifact_id: id, version }), recovered: { type: "boolean" } }), [...write, "artifact:write"]),
};
export const PPT_ACTION_PERMISSIONS = [...new Set(Object.values(pptActions).flatMap(definition => definition.action.permissions))];
export interface PptActionPorts {
  withStore<T>(run: (store: PptStore) => T): T;
  publishArtifact?: (input: Parameters<PptPublishArtifactPort>[0], caller: ActionCallContext) => ReturnType<PptPublishArtifactPort>;
  readArtifact?: (input: Parameters<PptReadArtifactPort>[0], caller: ActionCallContext) => ReturnType<PptReadArtifactPort>;
}
export function createPptActionHandlers(ports: PptActionPorts): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({ capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, caller), ...(availability ? { availability } : {}) });
  return [
    bind(pptActions.list, (_, caller) => ports.withStore(store => ({ presentations: store.list(project(caller)) }))),
    bind(pptActions.get, (input, caller) => ports.withStore(store => ({ presentation: store.get(input.id, project(caller)) }))),
    bind(pptActions.create, (input, caller) => ports.withStore(store => ({ presentation: store.create({ ...input, project_id: project(caller) }) }))),
    bind(pptActions.update, (input, caller) => ports.withStore(store => ({ presentation: store.update(input.id, input, project(caller)) }))),
    bind(pptActions.delete, (input, caller) => ports.withStore(store => { store.delete(input.id, project(caller), input.expected_version); return { ok: true }; })),
    bind(pptActions.export, (input, caller) => ports.withStore(store => {
      const presentation = store.get(input.id, project(caller));
      if (input.expected_version !== undefined && input.expected_version !== presentation.version) throw new ActionError("ppt.conflict", "演示稿已改变，请重新读取后导出");
      return { filename: presentation.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_") + ".json", mime_type: "application/json" as const, content: JSON.stringify(presentation, null, 2) };
    })),
    bind(pptActions.promote, (input, caller) => ports.withStore(store => promotePpt(store, input.id, project(caller), value => ports.publishArtifact!(value, caller), { actorId: caller.actor_id, expectedVersion: input.expected_version, readArtifact: ports.readArtifact ? value => ports.readArtifact!(value, caller) : undefined })),
      () => ports.publishArtifact ? { available: true } : { available: false, code: "ppt.unavailable", reason: "当前环境不能发出 Artifact" }),
  ];
}
