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
const KINDS: ReadonlyArray<[string, string]> = [["failed", "一轮失败"], ["needs-decision", "需要你确认或回答"], ["completed", "你不在时做完"], ["result", "插件交回结果"], ["material", "与工作目标相关的新资料"]];

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

const followUpsOutput: ActionSchema = { type: "object", properties: { followups: { type: "array", title: "这项工作的定时", items: { type: "object" } } }, required: ["followups"] };
const defineFollowUp = (capability: string, operation: "query" | "command", title: string, description: string, input: ActionSchema): ActionDefinition => ({
  ...define(capability, operation, title, description, input, operation === "command" ? "write" : undefined),
  action: { ...define(capability, operation, title, description, input, operation === "command" ? "write" : undefined).action, output_schema: followUpsOutput } });

/** Timed rounds of a work: “每天六点汇总今天的工作”. They run only while Molis Work runs here; missed times are not replayed. */
export const ASSISTANT_FOLLOW_UP_ACTIONS = {
  list: defineFollowUp("assistant.followups.list", "query", "查看定时", "列出这项工作的定时安排：到点让助理做什么、下一次时间、上一次的结果（开始、错过、跳过、失败）。", { type: "object", properties: {}, additionalProperties: false }),
  add: defineFollowUp("assistant.followups.add", "command", "添加定时",
    "按用户的要求给这项工作加一个定时：到 at（带时区的具体日期时间）时，助理用 text 开始这项工作的新一轮；repeat 为 daily/weekly 时之后每天/每周同一时间再做。只在 Molis Work 在这台电脑上运行时执行；那时没在运行就记为错过、提醒用户，不会事后补做。label 用用户的说法。",
    { type: "object", additionalProperties: false, required: ["text", "at", "label"], properties: {
      text: { type: "string", title: "到时要做的事", maxLength: 4000 },
      at: { type: "string", format: "date-time", title: "第一次的时间", description: "带时区的具体日期时间，例如 2026-09-29T18:00:00+08:00" },
      repeat: { type: "string", title: "重复", enum: ["none", "daily", "weekly"], description: "none=一次，daily=每天，weekly=每周" },
      label: { type: "string", title: "定时说法", maxLength: 120 },
    } }),
  remove: defineFollowUp("assistant.followups.remove", "command", "取消定时", "取消这项工作的一个定时（先用“查看定时”找到 followup_id）。",
    { type: "object", additionalProperties: false, required: ["followup_id"], properties: { followup_id: { type: "string", title: "定时" } } }),
} as const;

/** The work an Assistant round is acting for (its calls are audited as `assistant:<work_id>`). */
const callingWork = (context: { audit_actor_id?: string }) => context.audit_actor_id?.startsWith("assistant:") ? context.audit_actor_id.slice("assistant:".length) : null;

export function registerAssistantRuleActions(registry: ActionRegistryPort, service: () => AssistantService): () => void {
  const handlers: ActionHandlerBinding[] = [
    { capability_id: "assistant.rules.list", version: 1, handle: async () => ({ rules: service().rules() }) },
    { capability_id: "assistant.rules.add", version: 1, handle: async (_context, input) => ({ rules: service().saveRule(input as AssistantRuleInput) }) },
    { capability_id: "assistant.rules.remove", version: 1, handle: async (_context, input) => ({ rules: service().removeRule(String((input as { rule_id?: unknown }).rule_id ?? "")) }) },
    { capability_id: "assistant.followups.list", version: 1, handle: async context => ({ followups: service().followUps(callingWork(context) ?? undefined) }) },
    { capability_id: "assistant.followups.add", version: 1, handle: async (context, input) => {
      const work = callingWork(context);
      if (!work) throw new Error("定时要在一项助理工作里添加");
      const value = input as { text: string; at: string; repeat?: "none" | "daily" | "weekly"; label: string };
      service().saveFollowUp({ work_id: work, text: value.text, at: value.at, label: value.label, ...(value.repeat ? { repeat: value.repeat } : {}) });
      return { followups: service().followUps(work) };
    } },
    { capability_id: "assistant.followups.remove", version: 1, handle: async (context, input) => {
      const id = String((input as { followup_id?: unknown }).followup_id ?? ""), work = callingWork(context);
      if (work && !service().followUps(work).some(item => item.followup_id === id)) throw new Error("这项工作没有这个定时");
      service().removeFollowUp(id);
      return { followups: service().followUps(work ?? undefined) };
    } },
  ];
  return registry.registerProvider({ provider: { provider_id: ASSISTANT_RULES_PROVIDER, title: "助理", kind: "system" },
    definitions: [...Object.values(ASSISTANT_RULE_ACTIONS), ...Object.values(ASSISTANT_FOLLOW_UP_ACTIONS)], handlers });
}
