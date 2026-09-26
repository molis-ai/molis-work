import { ACTION_REFERENCE_SCHEMA, ACTION_SCENE_TARGETS_SCHEMA } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionCallContext, ActionDefinition, ActionHandlerBinding, ActionSchema, ActionSceneTarget, ActionSceneUsage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { FunctionDraftPatch, FunctionRecord, FunctionSceneBinding, FunctionsPrimitive, FunctionAuthoringCatalog } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsActionPorts } from "./actions.js";
import { assertReadyToPublish } from "./store.js";

const text = { type: "string" };
const id = { type: "string", minLength: 1 };
const nullableText = { type: ["string", "null"] };
const primitive = { enum: ["choice", "noul", "score"] };
const strings = { type: "array", items: text };
const criteria = { oneOf: [
  { type: "array", items: text },
  { type: "array", minItems: 1, items: { type: "object", properties: { key: text, description: text }, required: ["key", "description"], additionalProperties: false } },
  { type: "object", properties: { true_description: text, false_description: text }, required: ["true_description", "false_description"], additionalProperties: false },
] };
const patchSchema = { type: "object", properties: {
  name: text, function_key: text, instructions: text, criteria, scene_id: nullableText,
  scene_version: { type: ["integer", "null"], minimum: 1 }, scene_provider_id: nullableText,
  subject_kinds: strings, scene_map: { type: "object", additionalProperties: text },
  action_map: { type: "object", additionalProperties: { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] } },
}, additionalProperties: false };
const recordSchema = { type: "object", properties: {
  ...patchSchema.properties, id, status: { enum: ["draft", "published"] }, primitive,
  version: { type: ["integer", "null"], minimum: 1 }, model: text, config_hash: text,
  last_preview: { type: ["object", "null"] }, samples: { type: "array", items: { type: "object", properties: { id, label: text, input: text }, required: ["id", "label", "input"] } },
  published_at: nullableText, created_at: text, updated_at: text,
}, required: ["id", "name", "function_key", "instructions", "criteria", "scene_id", "subject_kinds", "scene_map", "status", "primitive", "version", "model", "config_hash", "last_preview", "samples", "published_at", "created_at", "updated_at"] };
const recordResult = { type: "object", properties: { function: recordSchema }, required: ["function"] };
const input = (properties: Record<string, unknown>, required: string[] = []): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const revision = { id, updated_at: { type: ["string", "null"], minLength: 1 } };
type Revision = { id: string; updated_at?: string | null };
type RecordResult = { function: FunctionRecord };

function define<I, O>(suffix: string, title: string, description: string, input_schema: ActionSchema, output_schema: ActionSchema, write = false, preview = false): ActionDefinition<I, O> {
  return { capability_id: `functions.authoring.${suffix}`, version: 1, operation: write ? "command" : "query", action: {
    title, description, kind: write ? "operation" : "query", scope: "home", audiences: ["user", "agent", "workflow", "mcp"],
    permissions: preview ? ["functions:manage", "functions:invoke"] : ["functions:manage"], subject_kinds: [], input_schema, output_schema,
  } };
}

export const functionAuthoringActions = {
  list: define<Record<string, never>, { functions: FunctionRecord[] }>("list", "管理判断规则", "读取草稿与已发布规则；需要规则管理权限。", input({}), { type: "object", properties: { functions: { type: "array", items: recordSchema } }, required: ["functions"] }),
  get: define<{ id: string }, RecordResult>("get", "读取判断定义", "按稳定记录 ID 读取判断定义、样本和最后试跑。", input({ id }, ["id"]), recordResult),
  create: define<{ primitive?: FunctionsPrimitive; name?: string; function_key?: string }, RecordResult>("create", "新建判断草稿", "创建可编辑草稿；不会自动发布或绑定。", input({ primitive, name: text, function_key: text }), recordResult, true),
  update: define<Revision & { patch: FunctionDraftPatch }, RecordResult>("update", "保存判断草稿", "修改草稿；updated_at 用于拒绝过期编辑，已发布规则不可修改。", input({ ...revision, patch: patchSchema }, ["id", "patch"]), recordResult, true),
  preview: define<Revision & { input: string }, RecordResult>("preview", "试跑判断", "使用判断服务执行输入并保存试跑结果，不执行建议的业务操作。", input({ ...revision, input: { type: "string", minLength: 1, maxLength: 8000 } }, ["id", "input"]), recordResult, true, true),
  publish: define<Revision, RecordResult>("publish", "发布判断规则", "通过已有试跑及配置校验后发布不可变版本，进入可调用目录。", input(revision, ["id"]), recordResult, true),
  delete: define<Revision, { ok: true }>("delete", "删除判断草稿", "仅删除草稿；已发布规则和历史不可删除。", input(revision, ["id"]), { type: "object", properties: { ok: { const: true } }, required: ["ok"] }, true),
  addSample: define<Revision & { input: string; label?: string }, RecordResult>("sample.add", "添加试跑样本", "将输入保存到规则的样本列表。", input({ ...revision, input: text, label: text }, ["id", "input"]), recordResult, true),
  removeSample: define<Revision & { sample_id: string }, RecordResult>("sample.remove", "移除试跑样本", "从当前规则移除指定样本。", input({ ...revision, sample_id: id }, ["id", "sample_id"]), recordResult, true),
} as const;

/** Contextual reads are composed by the Host from the same authorized action and scene clients. */
export const functionContextActions = {
  targets: define<{ id: string }, { targets: readonly ActionSceneTarget[] }>("targets", "判断规则可配置位置", "读取消费方提供的真实配置位置、原绑定及修订号；不会创建规则或授予权限。", input({ id }, ["id"]), ACTION_SCENE_TARGETS_SCHEMA),
  configure: define<{ id: string; scene_id: string; scene_version: number; provider_id: string; binding_id: string; expected_revision: string | null; enabled: boolean }, { ok: true }>("configure", "配置判断使用位置", "在消费方提供的位置启用、替换或停用当前规则；按原修订号写入，过期页面不能覆盖新配置。", input({
    id, scene_id: id, scene_version: { type: "integer", minimum: 1 }, provider_id: id, binding_id: id, expected_revision: nullableText, enabled: { type: "boolean" },
  }, ["id", "scene_id", "scene_version", "provider_id", "binding_id", "expected_revision", "enabled"]), { type: "object", properties: { ok: { const: true } }, required: ["ok"] }, true),
  catalog: define<Record<string, never>, { catalog: FunctionAuthoringCatalog }>("catalog", "判断规则可用场景", "读取当前调用者范围内的消费场景、对象与结果选项；不可用项带原因，目录不授予执行权限。", input({}), {
    type: "object", properties: { catalog: { type: "object", properties: {
      subjects: { type: "array", items: { type: "object" } }, destinations: { type: "array", items: { type: "object" } }, behaviors: { type: "array", items: { type: "object" } },
    }, required: ["subjects", "destinations", "behaviors"] } }, required: ["catalog"],
  }),
  usages: define<{ id: string }, { usages: (ActionSceneUsage | FunctionSceneBinding)[] }>("usages", "判断规则实际使用位置", "读取当前范围由消费场景保存的真实绑定与可用状态；草稿没有生效绑定。", input({ id }, ["id"]), {
    type: "object", properties: { usages: { type: "array", items: { type: "object", properties: { scene_id: id }, required: ["scene_id"] } } }, required: ["usages"],
  }),
} as const;

export function functionAuthoringHandlers(ports: FunctionsActionPorts): ActionHandlerBinding[] {
  const bind = <I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionCallContext) => O | Promise<O>, availability?: ActionHandlerBinding["availability"]): ActionHandlerBinding => ({
    ...definition, handle: (caller, value) => run(value as I, caller), ...(availability ? { availability } : {}),
  });
  return [
    bind(functionAuthoringActions.list, () => ports.read(service => ({ functions: service.list() }))),
    bind(functionAuthoringActions.get, args => ports.read(service => ({ function: service.get(args.id) }))),
    bind(functionAuthoringActions.create, args => ports.read(service => ({ function: service.create(args) }))),
    bind(functionAuthoringActions.update, args => ports.read(service => ({ function: service.updateDraft(args.id, args.patch, args.updated_at ?? undefined) }))),
    bind(functionAuthoringActions.preview, (args, caller) => ports.run(async service => ({ function: await service.preview(args.id, args.input, args.updated_at ?? undefined, caller.signal) })),
      () => ports.credentialAvailable() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先连接判断服务" }),
    bind(functionAuthoringActions.publish, async (args, caller) => {
      const record = ports.read(service => service.get(args.id));
      if (record.status === "published") return { function: record };
      assertReadyToPublish(record);
      const scene = await ports.validatePublication?.(record, caller);
      await caller.validate_authority?.({ ...functionAuthoringActions.publish, provider_id: "system.functions" });
      caller.signal?.throwIfAborted();
      return ports.read(service => ({ function: service.publish(args.id, args.updated_at ?? record.updated_at, scene ?? undefined) }));
    }),
    bind(functionAuthoringActions.delete, args => ports.read(service => { service.deleteDraft(args.id, args.updated_at ?? undefined); return { ok: true }; })),
    bind(functionAuthoringActions.addSample, args => ports.read(service => ({ function: service.addSample(args.id, { input: args.input, label: args.label }, args.updated_at ?? undefined) }))),
    bind(functionAuthoringActions.removeSample, args => ports.read(service => ({ function: service.removeSample(args.id, args.sample_id, args.updated_at ?? undefined) }))),
  ];
}
