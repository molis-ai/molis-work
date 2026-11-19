import { objectSchema as closed, createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { SUBJECT_REFERENCE_TYPE, SUBJECT_STATE_TYPE, SUBJECT_STATE_INPUT_SCHEMA, SUBJECT_STATE_OUTPUT_SCHEMA, defineSearchEntriesAction, defineSubjectContextAction, type ActionAudience, type ActionDefinition, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteMethod, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingRunControlInput, controlInput } from "./run-inputs.js";

const id = { type: "string", minLength: 1, maxLength: 200 };
const session = { session_id: id };
const round = { session_id: id, run_id: id };
/** A session's fields, drafts and selections stay the route's own validation; the contract names the identity it acts on. */
const open = (properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required });
const result: ActionSchema = { type: "object" };
const READS: readonly ActionAudience[] = ["user", "agent", "workflow", "mcp"];
/** Starting, steering and planning rounds change files in authorized directories: only the person at this computer does that. */
const LOCAL: readonly ActionAudience[] = ["user"];

type Translate = { toInput(request: PluginRouteRequest): Record<string, unknown>; toRequest(input: Record<string, unknown>): Pick<PluginRouteRequest, "params" | "query" | "body"> & { method: PluginRouteMethod } };
function define(name: string, version: number, title: string, description: string, operation: "query" | "command", input: ActionSchema,
  permissions: readonly string[], audiences: readonly ActionAudience[], execution?: ActionDefinition["action"]["execution"], scheduling?: "concurrent"): ActionDefinition<Record<string, unknown>, unknown> {
  return createActionDefinition<Record<string, unknown>, unknown>(`coding.${name}`, operation, { title, description, ...(execution ? { execution } : {}), ...(scheduling ? { scheduling } : {}),
    audiences, permissions, subject_kinds: ["coding_session"], input_schema: input, output_schema: result }, version);
}
const body = (request: PluginRouteRequest) => request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {};
const params = (input: Record<string, unknown>) => ({ ...(typeof input.session_id === "string" ? { sessionId: input.session_id } : {}), ...(typeof input.run_id === "string" ? { runId: input.run_id } : {}) });
const without = (input: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
const query = (input: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.flatMap(key => input[key] === undefined ? [] : [[key, String(input[key])]]));
const fromRequest = (request: PluginRouteRequest, keys: readonly string[] = []) => ({ ...(request.params.sessionId ? { session_id: request.params.sessionId } : {}),
  ...(request.params.runId ? { run_id: request.params.runId } : {}),
  ...Object.fromEntries(keys.flatMap(key => request.query[key] === undefined ? [] : [[key, key === "window" || key === "before" || key === "limit" || key === "revision" ? Number(request.query[key]) : request.query[key]]])) });

const sessionRecord = closed({ project_id: id, session_id: id, title: { type: "string" }, state: { type: "string" }, archived: { type: "boolean" },
  goal_id: { type: ["string", "null"] }, runtime_id: id, runtime_session_id: { type: ["string", "null"] }, created_at: { type: "string" }, updated_at: { type: "string" },
  execution_state: { enum: ["active", "archived", null] } });
const listSessions = define("sessions.list", /* @version action.coding.sessions.list */ 1, "浏览编码会话", "本人分页查看活动或已归档会话；不读取执行正文", "query",
  closed({ archived: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string", minLength: 1, maxLength: 4096 } }, ["archived"]), ["artifact:read"], LOCAL);

const createSession = define("sessions.create", /* @version action.coding.sessions.create */ 1, "新建编码会话",
  "新建一个编码会话；第一轮任务开始前不会调用模型", "command", closed({ title: { type: "string", maxLength: 200 } }, []), ["storage:private"], READS);
export const codingCreateSessionAction = { ...createSession, action: { ...createSession.action,
  output_schema: closed({ session: open({
    project_id: id, session_id: id, title: { type: "string" }, state: { const: "idle" }, archived: { const: false },
    goal_id: { type: "null" }, runtime_id: id, runtime_session_id: { type: "null" },
    created_at: { type: "string", format: "date-time" }, updated_at: { type: "string", format: "date-time" },
  }) }), result_subject: { id: "session.session_id", revision: "session.updated_at" } } };

const childIdentity = { ...round, child_id: id };
const childParams = (input: Record<string, unknown>) => ({ ...params(input), childId: String(input.child_id) });
const childInput = (request: PluginRouteRequest, keys: readonly string[] = []) => ({ ...fromRequest(request, keys), child_id: request.params.childId });

/** Coding's business surface: the Runtime instance redeems these, and the matching routes only forward to them. */
export const codingRouteActions: Readonly<Record<string, { definition: ActionDefinition<Record<string, unknown>, unknown> } & Translate>> = {
  "coding.read-subtask-conversation": { definition: define("subtasks.conversation", /* @version action.coding.subtasks.conversation */ 1, "Read child conversation", "Read the original child history and exact execution binding", "query", closed(childIdentity), ["artifact:read"], LOCAL),
    toInput: request => childInput(request), toRequest: input => ({ method: "GET", params: childParams(input), query: {}, body: {} }) },
  "coding.wait-subtask-conversation": { definition: define("subtasks.wait", /* @version action.coding.subtasks.wait */ 1, "Wait for child progress", "Read after an event, including after the parent ended", "query",
      closed({ ...childIdentity, since: { type: "string", maxLength: 200 }, timeout: { type: "string", pattern: "^[0-9]{1,5}$" } }, Object.keys(childIdentity)), ["artifact:read"], LOCAL, { timeout_ms: 30_000 }, "concurrent"),
    toInput: request => childInput(request, ["since", "timeout"]), toRequest: input => ({ method: "GET", params: childParams(input), query: query(input, ["since", "timeout"]), body: {} }) },
  "coding.check-subtask-request": { definition: define("subtasks.request", /* @version action.coding.subtasks.request */ 1, "Check original child request", "Query without repeating input or execution", "query", closed({ ...childIdentity, request_id: id }), ["artifact:read"], LOCAL),
    toInput: request => childInput(request, ["request_id"]), toRequest: input => ({ method: "GET", params: childParams(input), query: query(input, ["request_id"]), body: {} }) },
  "coding.command-subtask": { definition: define("subtasks.command", /* @version action.coding.subtasks.command */ 1, "Speak to or control a child", "Use the trusted person entry and the frozen child execution", "command", closed({ ...childIdentity, command: { type: "object" } }), ["artifact:read", "storage:private"], LOCAL, undefined, "concurrent"),
    toInput: request => ({ ...childInput(request), command: body(request) }), toRequest: input => ({ method: "POST", params: childParams(input), query: {}, body: input.command }) },
  "coding.session-binding": { definition: { ...define("sessions.binding.read", /* @version action.coding.sessions.binding.read */ 1, "读取会话的执行绑定", "本人只读当前业务会话的原执行引用与归档状态，不读取正文或创建执行", "query", closed(session), ["artifact:read"], LOCAL),
      action: { ...define("sessions.binding.read", /* @version action.coding.sessions.binding.read */ 1, "读取会话的执行绑定", "本人只读当前业务会话的原执行引用与归档状态，不读取正文或创建执行", "query", closed(session), ["artifact:read"], LOCAL).action,
        output_schema: closed({ session_id: id, project_id: id, archived: { type: "boolean" }, runtime: { anyOf: [{ type: "null" },
          closed({ runtime_id: id, session_id: id })] } }) } },
    toInput: request => fromRequest(request), toRequest: input => ({ method: "GET", params: params(input), query: {}, body: {} }) },
  // One session as a subject: its title, state and latest rounds, by the shared protocol (the Assistant, references).
  "coding.subject-state": { definition: { ...define("subject.state", /* @version action.coding.subject.state */ 1, "编码会话的当前可见状态", "只读取当前会话是否归档或已不存在，不读取正文", "query", SUBJECT_STATE_INPUT_SCHEMA, ["artifact:read"], READS),
      action: { ...define("subject.state", /* @version action.coding.subject.state */ 1, "编码会话的当前可见状态", "只读取当前会话是否归档或已不存在，不读取正文", "query", SUBJECT_STATE_INPUT_SCHEMA, ["artifact:read"], READS).action,
        input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_STATE_TYPE, input_schema: SUBJECT_STATE_INPUT_SCHEMA, output_schema: SUBJECT_STATE_OUTPUT_SCHEMA } },
    toInput: request => ({ subject_id: request.params.sessionId }), toRequest: input => ({ method: "GET", params: { sessionId: String(input.subject_id) }, query: {}, body: {} }) },
  "coding.subject": { definition: defineSubjectContextAction("coding.subject.read", /* @version action.coding.subject.read */ 1, "coding_session", "编码会话", ["artifact:read"]) as unknown as ActionDefinition<Record<string, unknown>, unknown>,
    toInput: request => ({ subject_id: request.params.sessionId }), toRequest: input => ({ method: "GET", params: { sessionId: String(input.subject_id ?? "") }, query: {}, body: {} }) },
  // System search: every session of the project by version; its text is read back through `coding.subject`.
  "coding.search-entries": { definition: defineSearchEntriesAction("coding.search.entries", /* @version action.coding.search.entries */ 1, [{ kind: "coding_session", title: "编码会话", surface: "coding" }], "编码会话", ["artifact:read"]) as unknown as ActionDefinition<Record<string, unknown>, unknown>,
    toInput: request => ({ cursor: typeof request.query.cursor === "string" && request.query.cursor ? request.query.cursor : null, limit: Number(request.query.limit ?? 500) }),
    toRequest: input => ({ method: "GET", params: {}, query: { ...(typeof input.cursor === "string" ? { cursor: input.cursor } : {}), limit: String(input.limit ?? 500) }, body: {} }) },
  "coding.list-sessions": { definition: { ...listSessions, action: { ...listSessions.action,
      output_schema: closed({ sessions: { type: "array", items: sessionRecord }, next_cursor: { type: ["string", "null"] } }) } },
    toInput: request => ({ archived: request.query.archived === "true" ? true : request.query.archived === "false" ? false : request.query.archived, ...fromRequest(request, ["limit", "cursor"]) }),
    toRequest: input => ({ method: "GET", params: {}, query: { archived: String(input.archived), ...query(input, ["limit", "cursor"]) }, body: {} }) },
  "coding.state": { definition: define("state", /* @version action.coding.state */ 1, "Coding 概况", "读取本项目的编码会话、可用模型、运行时、方法与当前工作目录", "query", closed({ workspace_id: id }, []), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["workspace_id"]), toRequest: input => ({ method: "GET", params: {}, query: query(input, ["workspace_id"]), body: {} }) },
  "coding.create-session": { definition: codingCreateSessionAction,
    toInput: request => body(request).title === undefined ? {} : { title: body(request).title }, toRequest: input => ({ method: "POST", params: {}, query: {}, body: input }) },
  "coding.read-session": { definition: define("sessions.read", /* @version action.coding.sessions.read */ 1, "读取编码会话", "读取会话、最近几轮执行与草稿；window 限制完整读取的轮次", "query",
      closed({ ...session, window: { type: "integer", minimum: 1, maximum: 50 }, known: { type: "string", maxLength: 20_000 }, earlier: { type: "string", maxLength: 200 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["window", "known", "earlier"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["window", "known", "earlier"]), body: {} }) },
  "coding.update-session": { definition: define("sessions.update", /* @version action.coding.sessions.update */ 1, "修改编码会话", "改名、归档，或按原编辑版本保存草稿、材料、技能、角色、预算等本会话设置", "command", open({...session,expected_input_revision:{type:'integer',minimum:0}} ,['session_id']), ["storage:private"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "PATCH", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.read-runs": { definition: define("runs.list", /* @version action.coding.runs.list */ 1, "编码会话的轮次", "分页读取一个编码会话里更早的执行轮次（用 before 往前翻，每页最多 50 条）；只读，不改变会话", "query",
      closed({ ...session, before: { type: "integer", minimum: 0 }, history_before: {type:"integer",minimum:0}, limit: { type: "integer", minimum: 1, maximum: 50 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["before", "history_before", "limit"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["before", "history_before", "limit"]), body: {} }) },
  // A long session may first have the round's own model write a digest of its earlier rounds: that wait runs beside the project's queue.
  "coding.start-run": { definition: define("runs.start", /* @version action.coding.runs.start */ 1, "开始一轮编码", "在已授权的工作目录按所选方式（讨论、规划、修改、执行、评审、并行写入）开始一轮；写操作仍经审查", "command",
      open({ ...session, task: { type: "string", maxLength: 100_000 }, intent: { enum: ["discuss", "plan", "edit", "execute", "review", "collaborate", "parallel"] }, workspace_id: id, worktree_id: id, provider_id: id, model_id: id }, ["session_id", "intent", "workspace_id", "provider_id", "model_id"]),
      ["artifact:read", "storage:private"], LOCAL, { cost: "metered" }, "concurrent"),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  // A picture pasted into the composer, kept by the platform as this session's attachment (A3); the material service reads only inside an action.
  "coding.attachments": { definition: define("images.keep", /* @version action.coding.images.keep */ 1, "存下一张图片", "把贴进输入框的一张图片存成这个会话的附件，供下一轮发给模型；只收 PNG、JPEG、GIF、WebP，5 MB 以内", "command",
      closed({ ...session, name: { type: "string", minLength: 1, maxLength: 300 }, data: { type: "string", minLength: 1, maxLength: 7_000_000 } }), ["materials:read"], LOCAL, undefined, "concurrent"),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.round-images": { definition: define("images.read", /* @version action.coding.images.read */ 1, "读取一轮带的图片", "读回某一轮发给模型的图片；只读，只认这一轮带过的", "query",
      closed(round), ["materials:read"], LOCAL, undefined, "concurrent"),
    toInput: request => fromRequest(request),
    toRequest: input => ({ method: "GET", params: params(input), query: {}, body: {} }) },
  "coding.control-run": { definition: define("runs.control", /* @version action.coding.runs.control */ 1, "控制编码轮次", "回答提问、补充要求（可指向要纠正的那条）、撤回还没交给模型的补充、暂停、继续或停止正在进行的一轮，或把它从下一次模型调用起换到另一个已配置的模型", "command",
      codingRunControlInput, [], LOCAL),
    toInput: request => controlInput({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  // Starting a parked round now keeps its follower, a job only a checked command may keep (PG-038).
  "coding.queued-round": { definition: define("runs.queued", /* @version action.coding.runs.queued */ 1, "现在开始或放弃等待", "停在等待上的会话：现在就开始下一轮（这个等待由你接手），或放弃这个等待", "command",
      closed({ ...session, action: { enum: ["start", "cancel"] } }), ["artifact:read", "storage:private"], LOCAL, { cost: "metered" }, "concurrent"),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.read-report": { definition: define("reports.read", /* @version action.coding.reports.read */ 1, "读取执行报告", "读取一轮的固定报告；没有固定版本时按这一轮的记录生成预览", "query",
      closed({ ...round, fixed: { type: "boolean" } }, ["session_id", "run_id"]), ["artifact:read"], READS),
    toInput: request => ({ ...fromRequest(request), ...(request.query.fixed === "1" ? { fixed: true } : {}) }),
    toRequest: input => ({ method: "GET", params: params(input), query: input.fixed ? { fixed: "1" } : {} as Record<string, string>, body: {} }) },
  "coding.save-report": { definition: define("reports.save", /* @version action.coding.reports.save */ 1, "保存执行报告", "把已结束的一轮保存为固定版本报告；重复保存返回原版本", "command", closed(round), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => fromRequest(request), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: {} }) },
  "coding.reports": { definition: define("reports.list", /* @version action.coding.reports.list */ 1, "执行报告目录", "列出本项目已保存的固定执行报告（每份是某个会话某一轮的结果）；只读。还没有固定版本的某一轮不在这里，用「读取执行报告」预览", "query", closed({}), ["artifact:read"], READS),
    toInput: () => ({}), toRequest: () => ({ method: "GET", params: {}, query: {}, body: {} }) },
  "coding.artifacts": { definition: define("artifacts.list", /* @version action.coding.artifacts.list */ 1, "编码成果目录", "列出本项目已保存的报告与变更", "query", closed({}), ["artifact:read"], READS),
    toInput: () => ({}), toRequest: () => ({ method: "GET", params: {}, query: {}, body: {} }) },
  "coding.read-changeset": { definition: define("changesets.read", /* @version action.coding.changesets.read */ 1, "读取变更", "读取一轮的固定变更；没有固定版本时按这一轮的记录生成预览", "query",
      closed({ ...round, fixed: { type: "boolean" } }, ["session_id", "run_id"]), ["artifact:read"], READS),
    toInput: request => ({ ...fromRequest(request), ...(request.query.fixed === "1" ? { fixed: true } : {}) }),
    toRequest: input => ({ method: "GET", params: params(input), query: input.fixed ? { fixed: "1" } : {} as Record<string, string>, body: {} }) },
  "coding.save-changeset": { definition: define("changesets.save", /* @version action.coding.changesets.save */ 1, "保存变更", "把一轮的改动保存为固定版本变更；重复保存返回原版本", "command", closed(round), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => fromRequest(request), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: {} }) },
  "coding.read-plan": { definition: define("plans.read", /* @version action.coding.plans.read */ 1, "读取编码计划", "读取会话当前计划，或一个已确认的固定修订", "query",
      closed({ ...session, revision: { type: "integer", minimum: 1 } }, ["session_id"]), ["artifact:read"], READS),
    toInput: request => fromRequest(request, ["revision"]), toRequest: input => ({ method: "GET", params: params(input), query: query(input, ["revision"]), body: {} }) },
  "coding.save-plan": { definition: define("plans.save", /* @version action.coding.plans.save */ 1, "保存编码计划", "按读取时的修订从规划轮次形成计划，或保存修改后的计划", "command",
      open({ ...session, expected_revision: { type: "integer", minimum: 0 } }, ["session_id", "expected_revision"]), ["storage:private"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  "coding.confirm-plan": { definition: define("plans.confirm", /* @version action.coding.plans.confirm */ 1, "确认编码计划", "把当前计划确认为固定版本，之后可按此计划执行", "command", open(session), ["artifact:read", "artifact:write"], LOCAL),
    toInput: request => ({ ...body(request), session_id: request.params.sessionId }), toRequest: input => ({ method: "POST", params: params(input), query: {}, body: without(input, "session_id") }) },
  // The table of background tasks offers this as a row's command (home-background.ts): the same stop the session's own panel has.
  "coding.background-stop": { definition: define("background.stop", /* @version action.coding.background.stop */ 1, "停止后台命令", "停止会话里一条还在跑的后台命令，与会话面板里的停止相同", "command",
      closed({ ...session, task_id: id }), ["artifact:read", "storage:private"], LOCAL),
    toInput: request => ({ session_id: request.params.sessionId, task_id: request.params.taskId }),
    toRequest: input => ({ method: "POST", params: { ...params(input), taskId: String(input.task_id ?? "") }, query: {}, body: {} }) },
};
export const CODING_ACTIONS: readonly ActionDefinition[] = Object.values(codingRouteActions).map(entry => entry.definition);
