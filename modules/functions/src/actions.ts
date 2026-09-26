import { ActionError, ACTION_REFERENCE_SCHEMA, type ActionDefinition, type ActionProviderRegistration, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_MCP_DESTINATION_ID, type FunctionRecord, FunctionSummary, FunctionDescribe, FunctionInvokeResult } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FunctionsService } from "./service.js";
import { functionAuthoringActions, functionAuthoringHandlers } from "./authoring-actions.js";

const text = { type: "string" };
const integer = { type: "integer", minimum: 1 };
const primitive = { enum: ["choice", "noul", "score"] };
const empty = { type: "object", properties: {}, additionalProperties: false };
const summary = { type: "object", properties: { function_key: text, name: text, primitive, version: integer, model: text },
  required: ["function_key", "name", "primitive", "version", "model"] };
const resultSchema = { type: "object", properties: {
  suggested_behavior_ids: { type: "array", items: text },
  recommended_actions: { type: "array", items: { ...ACTION_REFERENCE_SCHEMA, required: ["capability_id", "version", "provider_id"] } },
  status: { enum: ["ok", "needs_review"] }, function_key: text, version: integer, model: text, config_hash: text, primitive,
  data: { type: "object", properties: { choice: { type: ["string", "null"] }, noul: { type: "number" }, score: { type: "number" }, legend: { type: "array", items: text } }, additionalProperties: false },
  probabilities: { type: "object", additionalProperties: { type: "number" } }, confidence: { type: ["number", "null"] },
}, required: ["suggested_behavior_ids", "status", "function_key", "version", "model", "config_hash", "primitive", "data", "probabilities", "confidence"] };

function define<Input, Output>(id: string, title: string, description: string, input: Record<string, unknown>, output: Record<string, unknown>, judgment = false): ActionDefinition<Input, Output> {
  return { capability_id: id, version: 1, operation: judgment ? "command" : "query", action: {
    title, description, kind: judgment ? "judgment" : "query", scope: "home", audiences: ["user", "agent", "workflow", "mcp"],
    permissions: judgment ? ["functions:invoke"] : [], subject_kinds: [], input_schema: input, output_schema: output,
  } };
}

export const functionsActions = {
  list: define<Record<string, never>, { functions: FunctionSummary[] }>("functions.list", "已发布判断规则", "列出已发布规则及稳定身份；草稿不在调用目录中。", empty,
    { type: "object", properties: { functions: { type: "array", items: summary } }, required: ["functions"] }),
  describe: define<{ function_key: string }, { function: FunctionDescribe }>("functions.describe", "查看判断合同", "读取指定已发布规则的输入、判断条件和版本。", {
    type: "object", properties: { function_key: { type: "string", minLength: 1 } }, required: ["function_key"], additionalProperties: false,
  }, { type: "object", properties: { function: { ...summary, properties: { ...summary.properties, instructions: text,
    input: { type: "object", properties: { content: { const: "string" } }, required: ["content"] }, criteria: { oneOf: [{ type: "array" }, { type: "object" }] } },
    required: [...summary.required, "instructions", "input", "criteria"] } }, required: ["function"] }),
  invoke: define<{ function_key: string; input: string }, FunctionInvokeResult>("functions.invoke", "调用判断规则", "执行已发布规则并保存判断记录；needs_review 表示需要人判断，结果不授予业务操作权限。", {
    type: "object", properties: { function_key: { type: "string", minLength: 1 }, input: { type: "string", minLength: 1, maxLength: 8000 } },
    required: ["function_key", "input"], additionalProperties: false,
  }, resultSchema, true),
} as const;

export function publishedFunctionAction(record: FunctionRecord): ActionDefinition<{ content: string }, FunctionInvokeResult> {
  if (record.status !== "published" || !record.version) throw new ActionError("actions.function_unpublished", "草稿不能注册为可调用判断");
  const value = record.primitive === "choice"
    ? { choice: { enum: [...(record.criteria as readonly { key: string }[]).map(item => item.key), null] } }
    : record.primitive === "noul" ? { noul: { type: "number" } }
      : { score: { type: "number" }, legend: { type: "array", items: text } };
  const definition = define<{ content: string }, FunctionInvokeResult>(`functions.published.${record.function_key}`, record.name,
    record.instructions, { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
    { ...resultSchema, properties: { ...resultSchema.properties, function_key: { const: record.function_key }, version: { const: record.version },
      primitive: { const: record.primitive }, data: { type: "object", properties: value, required: Object.keys(value), additionalProperties: false } } }, true);
  const recommendations = record.scene_id !== AGENT_MCP_DESTINATION_ID && (!!record.scene_id || Object.keys(record.scene_map ?? {}).length > 0);
  const choices = record.primitive === "choice" ? (record.criteria as readonly { key: string }[]).map(item => record.scene_map[item.key] ?? item.key)
    : Object.values(record.scene_map ?? {});
  return { ...definition, version: record.version, action: { ...definition.action, subject_kinds: [...record.subject_kinds],
    ...(Object.keys(record.action_map ?? {}).length ? { required_actions: Object.values(record.action_map!) } : {}),
    ...(record.scene_id && record.scene_version && record.scene_provider_id ? { result_scene: { scene_id: record.scene_id, version: record.scene_version, provider_id: record.scene_provider_id } } : {}),
    output_type: recommendations ? "molis.behavior-recommendation.v1" : "molis.judgment.v1",
    ...(recommendations && choices.length ? { output_schema: { ...definition.action.output_schema,
      properties: { ...(definition.action.output_schema!.properties as Record<string, unknown>),
        suggested_behavior_ids: { type: "array", items: { enum: [...new Set(choices)] } } } } } : {}),
  } };

}

export interface FunctionsActionPorts {
  credentialAvailable(): boolean;
  validatePublication?(record: FunctionRecord, caller: ActionCallContext): Promise<import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneReference | void>;
  validateRecommendations?(record: FunctionRecord, caller: ActionCallContext): Promise<void>;
  read<T>(operation: (service: FunctionsService) => T): T;
  run<T>(operation: (service: FunctionsService) => Promise<T>): Promise<T>;
}
const provider = { provider_id: "system.functions", title: "判断规则", kind: "system" as const };
const credentialAvailability = (ports: FunctionsActionPorts) => ports.credentialAvailable()
  ? { available: true as const } : { available: false as const, code: "actions.connection_required", reason: "请先连接判断服务" };

export function functionsActionProvider(ports: FunctionsActionPorts): ActionProviderRegistration {
  return { provider, definitions: [...Object.values(functionsActions), ...Object.values(functionAuthoringActions)], handlers: [
    ...functionAuthoringHandlers(ports),
    { ...functionsActions.list, handle: () => ports.read(service => ({ functions: service.listPublished() })) },
    { ...functionsActions.describe, handle: (_caller, input) => ports.read(service => ({ function: service.describePublished((input as { function_key: string }).function_key) })) },
    { ...functionsActions.invoke, availability: () => credentialAvailability(ports), handle: (caller, input) => {
      const args = input as { function_key: string; input: string };
      return ports.run(service => service.invokePublished(args.function_key, args.input, { project_id: caller.project_id ?? undefined,
        signal: caller.signal, record_history: !caller.scene_binding,
        before_evaluate: record => ports.validateRecommendations?.(record, caller),
        before_result: async record => { await ports.validateRecommendations?.(record, caller);
          await caller.validate_authority?.({ ...functionsActions.invoke, provider_id: provider.provider_id }); } }));
    } },
  ] };
}

export function publishedFunctionProvider(record: FunctionRecord, ports: FunctionsActionPorts): ActionProviderRegistration {
  const definition = publishedFunctionAction(record);
  return { provider, definitions: [definition], handlers: [{ ...definition,
    availability: () => credentialAvailability(ports),
    handle: (caller, input) => ports.run(service => service.invokePublished(record.function_key, (input as { content: string }).content,
      { version: record.version!, config_hash: record.config_hash, project_id: caller.project_id ?? undefined, signal: caller.signal,
        record_history: !caller.scene_binding, before_evaluate: current => ports.validateRecommendations?.(current, caller),
        before_result: async current => { await ports.validateRecommendations?.(current, caller);
          await caller.validate_authority?.({ ...definition, provider_id: provider.provider_id }); } })),
  }] };
}
