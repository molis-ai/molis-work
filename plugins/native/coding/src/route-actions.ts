import { defineSearchEntriesAction, defineSubjectContextAction, type ActionAudience, type ActionDefinition, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteMethod, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";

const id = { type: "string", minLength: 1, maxLength: 200 };
const session = { session_id: id };
const round = { session_id: id, run_id: id };
/** A session's fields, drafts and selections stay the route's own validation; the contract names the identity it acts on. */
const open = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required });
const closed = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const result: ActionSchema = { type: "object" };
const READS: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
/** Starting, steering and planning rounds change files in authorized directories: only the person at this computer does that. */
const LOCAL: readonly ActionAudience[] = ["user"];

type Translate = { toInput(request: PluginRouteRequest): Record<string, unknown>; toRequest(input: Record<string, unknown>): Pick<PluginRouteRequest, "params" | "query" | "body"> & { method: PluginRouteMethod } };
function define(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[], execution?: ActionDefinition["action"]["execution"], scheduling?: "concurrent"): ActionDefinition<Record<string, unknown>, unknown> {
  return { capability_id: `coding.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}), ...(scheduling ? { scheduling } : {}), kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences, permissions, subject_kinds: ["coding_session"], input_schema: input, output_schema: result } };
}
const body = (request: PluginRouteRequest) => request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
const params = (input: Record<string, unknown>) => ({ ...(typeof input.session_id === "string" ? { sessionId: input.session_id } : {}), ...(typeof input.run_id === "string" ? { runId: input.run_id } : {}) });
const without = (input: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
const query = (input: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.flatMap(key => input[key] === undefined ? [] : [[key, String(input[key])]]));
const fromRequest = (request: PluginRouteRequest, keys: readonly string[] = []) => ({ ...(request.params.sessionId ? { session_id: request.params.sessionId } : {}),
  ...(request.params.runId ? { run_id: request.params.runId } : {}),
  ...Object.fromEntries(keys.flatMap(key => request.query[key] === undefined ? [] : [[key, key === "window" || key === "before" || key === "limit" || key === "revision" ? Number(request.query[key]) : request.query[key]]])) });

/** Coding's business surface: the Runtime instance redeems these, and the matching routes only forward to them. */
export const codingRouteActions: Readonly<Record<string, { definition: ActionDefinition<Record<string, unknown>, unknown> } & Translate>> = {
  // One session as a subject: its title, state and latest rounds, by the shared protocol (the Assistant, references).
  "coding.subject": { definition: defineSubjectContextAction("coding.subject.read", "coding_session", "编码会话", ["artifact:read"]) as unknown as ActionDefinition<Record<string, unknown>, unknown>,
    toInput: request => ({ subject_id: request.params.sessionId }), toRequest: input => ({ method: "GET", params: { sessionId: String(input.subject_id ?? "") }, query: {}, body: {} }) },
  // System search: every session of the project by version; its text is read back through `coding.subject`.
  "coding.search-entries": { definition: defineSearchEntriesAction("coding.search.entries", [{ kind: "coding_session", title: "编码会话", surface: "coding" }], "编码会话", ["artifact:read"]) as unknown as ActionDefinition<Record<string, unknown>, unknown>,
    toInput: request => ({ cursor: typeof request.query.cursor === "string" && request.query.cursor ? request.query.cursor : null, limit: Number(request.query.limit ?? 500) }),
    toRequest: input => ({ method: "GET", params: {}, query: { ...(typeof input.cursor === "string" ? { cursor: input.cursor } : {}), limit: String(input.limit ?? 500) }, body: {} }) },
  "coding.state": { definition: define("state", "Coding 概况", "读取本项目的编码会话、可用模型、运行时、方法与当前工作目录", "query", closed({}), ["artifact:read"], READS),
    toInput: () => ({}), toRequest: () => ({ method: "GET", params: {}, query: {}, body: {} }) },
  "coding.create-session": { definition: define("sessions.create", "新建编码会话", "新建一个编码会话；第一轮任务开始前不会调用模型", "command", closed({ title: { type: "string", maxLength: 200 } }, []), ["storage:private"], READS),
    toInput: request => body(request).title === undefined ? {} : { title: body(request).title }, toRequest: input => ({ method: "POST", params: {}, query: {}, body: input }) },
  "coding.read-session": { definition: define("sessions.read", "读取编码会话", "读取会话、最近几轮执行与草稿；window 限制完整读取的轮次", "query",
      closed({ ...session, window: { type: "integer", minimum: 1, maximum: 50 }, known: { type: "string", maxLength: 20_000 }, earlier: { type: "string", maxLength: 200 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["window", "known", "earlier"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["window", "known", "earlier"]), body: {} }) },
  "coding.update-session": { definition: define("sessions.update", "修改编码会话", "改名、归档，或保存草稿、材料、方法、角色、预算等本会话设置", "command", open(session), ["storage:private"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "PATCH", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.read-runs": { definition: define("runs.list", "编码会话的轮次", "分页读取会话更早的执行轮次", "query",
      closed({ ...session, before: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 50 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["before", "limit"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["before", "limit"]), body: {} }) },
  // A long session may first have the round's own model write a digest of its earlier rounds: that wait runs beside the project's queue.
  "coding.start-run": { definition: define("runs.start", "开始一轮编码", "在已授权的工作目录按所选方式（讨论、规划、修改、执行、评审、并行写入）开始一轮；写操作仍经审查", "command",
      open({ ...session, task: { type: "string", maxLength: 100_000 }, intent: { enum: ["discuss", "plan", "edit", "execute", "review", "collaborate", "parallel"] }, workspace_id: id, provider_id: id, model_id: id }, ["session_id", "intent", "workspace_id", "provider_id", "model_id"]),
      ["artifact:read", "storage:private"], LOCAL, { cost: "metered" }, "concurrent"),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.control-run": { definition: define("runs.control", "控制编码轮次", "回答提问、补充要求、暂停、继续或停止正在进行的一轮", "command",
      open({ ...session, run_id: id, kind: { enum: ["answer", "steer", "stop", "pause", "resume"] } }, ["session_id", "run_id", "kind"]), [], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.read-report": { definition: define("reports.read", "读取执行报告", "读取一轮的固定报告；没有固定版本时按这一轮的记录生成预览", "query",
      closed({ ...round, fixed: { type: "boolean" } }, ["session_id", "run_id"]), ["artifact:read"], READS),
    toInput: request => ({ ...fromRequest(request), ...(request.query.fixed === "1" ? { fixed: true } : {}) }),
    toRequest: input => ({ method: "GET", params: params(input), query: input.fixed ? { fixed: "1" } : {} as Record<string, string>, body: {} }) },
  "coding.save-report": { definition: define("reports.save", "保存执行报告", "把已结束的一轮保存为固定版本报告；重复保存返回原版本", "command", closed(round), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => fromRequest(request), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: {} }) },
  "coding.reports": { definition: define("reports.list", "执行报告目录", "列出本项目已保存的固定报告", "query", closed({}), ["artifact:read"], READS),
    toInput: () => ({}), toRequest: () => ({ method: "GET", params: {}, query: {}, body: {} }) },
  "coding.artifacts": { definition: define("artifacts.list", "编码成果目录", "列出本项目已保存的报告与变更", "query", closed({}), ["artifact:read"], READS),
    toInput: () => ({}), toRequest: () => ({ method: "GET", params: {}, query: {}, body: {} }) },
  "coding.read-changeset": { definition: define("changesets.read", "读取变更", "读取一轮的固定变更；没有固定版本时按这一轮的记录生成预览", "query",
      closed({ ...round, fixed: { type: "boolean" } }, ["session_id", "run_id"]), ["artifact:read"], READS),
    toInput: request => ({ ...fromRequest(request), ...(request.query.fixed === "1" ? { fixed: true } : {}) }),
    toRequest: input => ({ method: "GET", params: params(input), query: input.fixed ? { fixed: "1" } : {} as Record<string, string>, body: {} }) },
  "coding.save-changeset": { definition: define("changesets.save", "保存变更", "把一轮的改动保存为固定版本变更；重复保存返回原版本", "command", closed(round), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => fromRequest(request), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: {} }) },
  "coding.read-plan": { definition: define("plans.read", "读取编码计划", "读取会话当前计划，或一个已确认的固定修订", "query",
      closed({ ...session, revision: { type: "integer", minimum: 1 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["revision"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["revision"]), body: {} }) },
  "coding.save-plan": { definition: define("plans.save", "保存编码计划", "按读取时的修订从规划轮次形成计划，或保存修改后的计划", "command",
      open({ ...session, expected_revision: { type: "integer", minimum: 0 } }, ["session_id", "expected_revision"]), ["storage:private"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.confirm-plan": { definition: define("plans.confirm", "确认编码计划", "把当前计划确认为固定版本，之后可按此计划执行", "command", open(session), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
};
export const CODING_ACTIONS: readonly ActionDefinition[] = Object.values(codingRouteActions).map(entry => entry.definition);
