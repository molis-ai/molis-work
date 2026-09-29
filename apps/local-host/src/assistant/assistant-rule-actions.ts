/**
 * The person's attention rules as actions of the Assistant itself, in the Home's directory. The person can say
 * "写文档时不要提醒，失败除外" and the Assistant finds these like any capability; adding or removing a rule is a
 * change, so it stops at the person's confirmation of the exact rule. The Host then applies it exactly as written.
 */
import type { ActionDefinition, ActionHandlerBinding, ActionRegistryPort, ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantRuleInput } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AssistantService } from "./assistant-service.js";

export const ASSISTANT_RULES_PROVIDER = "io.molis.work.assistant.rules";

/** Where a rule can apply: the plugin pages people know, by the ids the Host matches. */
const SURFACES: ReadonlyArray<[string, string]> = [["pages", "Pages"], ["coding", "Coding"], ["goals", "Goals"], ["jelly", "Jelly"], ["cognia", "Cognia"],
  ["dataset", "Dataset"], ["form", "Forms"], ["workflows", "工作流程"], ["lingguang", "灵光"], ["home", "项目首页"]];
const KINDS: ReadonlyArray<[string, string]> = [["failed", "一轮失败"], ["needs-decision", "需要你确认或回答"], ["completed", "你不在时做完"], ["result", "插件交回结果"]];

const rulesOutput: ActionSchema = { type: "object", properties: { rules: { type: "array", title: "现在的提醒规则", items: { type: "object" } } }, required: ["rules"] };

const define = (capability: string, operation: "query" | "command", title: string, description: string, input: ActionSchema, effect?: "write"): ActionDefinition => ({
  capability_id: capability, version: 1, operation, provider_id: ASSISTANT_RULES_PROVIDER,
  action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "home", audiences: ["user", "agent"], permissions: [], subject_kinds: [],
    ...(effect ? { effect } : {}), input_schema: input, output_schema: rulesOutput },
});

export const ASSISTANT_RULE_ACTIONS = {
  list: define("assistant.rules.list", "query", "查看提醒规则", "列出用户为助理设的提醒规则：在哪些插件页面不提醒、暂停到何时、哪些情况例外。", { type: "object", properties: {}, additionalProperties: false }),
  add: define("assistant.rules.add", "command", "添加提醒规则",
    "按用户的话添加一条提醒规则：quiet 表示在所列插件页面（不列则处处）不提醒；pause 表示暂停提醒到 until。except 里的情况仍然提醒（例如“失败除外”写 failed）。label 用用户原话。“这次先别提醒”用 pause，并给出结束时间。",
    { type: "object", additionalProperties: false, required: ["kind", "label"], properties: {
      kind: { type: "string", title: "规则类型", enum: ["quiet", "pause"], description: "quiet：在某些页面不提醒；pause：暂停提醒到某时" },
      surfaces: { type: "array", title: "在哪些页面", items: { type: "string", enum: SURFACES.map(([id]) => id) }, description: SURFACES.map(([id, name]) => `${id}=${name}`).join("，") },
      except: { type: "array", title: "仍然提醒的情况", items: { type: "string", enum: KINDS.map(([id]) => id) }, description: KINDS.map(([id, name]) => `${id}=${name}`).join("，") },
      until: { type: "string", format: "date-time", title: "到什么时候", description: "暂停必填；quiet 可不填（长期有效）" },
      label: { type: "string", title: "规则说法", maxLength: 200, description: "用户的原话，例如“写文档时不要提醒，失败除外”" },
    } }, "write"),
  remove: define("assistant.rules.remove", "command", "删除提醒规则", "删除一条提醒规则（先用“查看提醒规则”找到它的 rule_id）。",
    { type: "object", additionalProperties: false, required: ["rule_id"], properties: { rule_id: { type: "string", title: "规则" } } }, "write"),
} as const;

export function registerAssistantRuleActions(registry: ActionRegistryPort, service: () => AssistantService): () => void {
  const handlers: ActionHandlerBinding[] = [
    { capability_id: "assistant.rules.list", version: 1, handle: async () => ({ rules: service().rules() }) },
    { capability_id: "assistant.rules.add", version: 1, handle: async (_context, input) => ({ rules: service().saveRule(input as AssistantRuleInput) }) },
    { capability_id: "assistant.rules.remove", version: 1, handle: async (_context, input) => ({ rules: service().removeRule(String((input as { rule_id?: unknown }).rule_id ?? "")) }) },
  ];
  return registry.registerProvider({ provider: { provider_id: ASSISTANT_RULES_PROVIDER, title: "助理", kind: "system" },
    definitions: Object.values(ASSISTANT_RULE_ACTIONS), handlers });
}
