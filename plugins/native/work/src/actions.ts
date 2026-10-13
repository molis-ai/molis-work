import { sessionMessageActions, createSessionMessageHandlers } from "./message-actions.js";
import type { SessionMessageService } from "./messages.js";
import { defineSubjectContextAction, subjectContext, ActionError, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type ActionSubject, type ActionSubjectContext, defineSearchEntriesAction, bindSearchEntriesHandler, searchText, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkSessionApi, WorkSessionRecord, WorkSessionGoalLink } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { RUNTIME_SESSION_CAPABILITIES, type RuntimeHostApi, type RuntimeSessionCapabilities } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { SessionContentService } from "./content.js";
import type { SessionDirectoryService } from "./directory.js";
import type { SessionHandoffService } from "./handoff.js";
import type { SessionContentResult, SessionHandoffGoalContext, SessionResumeResult } from "./types.js";
import { publicSessionRecord, publicSessionHandoff } from "./http/public-records.js";
import { defineHomeEventsAction, withinHomeEventWindow, assertHomeEventWindow, type HomeEvent } from "@molis-ai/molis-work-contracts/platform/actions";

export type PublicWorkSession = ReturnType<typeof publicSessionRecord>;
export type PublicSessionContent = Omit<SessionContentResult, "session"> & { session: PublicWorkSession };
export interface WorkSessionDirectory {
  records: Array<{ session: PublicWorkSession; goal_history: WorkSessionGoalLink[]; event_count: number }>;
  runtimes: Array<{ runtime_id: string; capabilities: RuntimeSessionCapabilities }>;
}
const text = { type: "string" }, nullable = { type: ["string", "null"] };
const sessionProperties = { session_id: text, runtime_id: text, native_runtime_session_id: nullable, project_id: nullable,
  current_goal_id: nullable, workspace_id: nullable, workspace_path: nullable, title: nullable,
  status: { enum: ["discovered", "active", "closed"] }, provenance: { enum: ["molis_work_created", "runtime_discovered", "explicitly_linked"] },
  runtime_workspace_hint: nullable, created_at: text, updated_at: text };
export const publicWorkSessionSchema = { type: "object", properties: sessionProperties, required: Object.keys(sessionProperties), additionalProperties: false };
const sessionInput = { type: "object", properties: { session_id: { type: "string", minLength: 1 } }, required: ["session_id"], additionalProperties: false };
const eventProperties = { event_id: text, session_id: text, source: { enum: ["runtime_native", "molis_work_tui", "molis_work"] },
  kind: { enum: ["user_message", "runtime_message", "tool", "approval", "status", "artifact", "terminal_output"] },
  label: text, content: text, occurred_at: text, source_order: { type: "number" }, runtime_id: text, metadata: { type: "object" } };
const define = <I, O>(id: string, title: string, description: string, operation: "query" | "command", input: Record<string, unknown>, output: Record<string, unknown>, permissions: string[],
  audiences: readonly ("user" | "agent" | "workflow" | "mcp")[] = ["user", "agent", "workflow", "mcp"]): ActionDefinition<I, O> => ({
  capability_id: id, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project",
    audiences, permissions, subject_kinds: ["session"], input_schema: input, output_schema: output },
});
export interface HandoffTargetInput { package_id: string; target_runtime_id: string; target_workspace_id?: string | null; target_workspace_path?: string | null; content: string }
const handoffTargetSchema = { type: "object", properties: { package_id: { type: "string", minLength: 1 }, target_runtime_id: { type: "string" }, target_workspace_id: { type: ["string", "null"] },
  target_workspace_path: { type: ["string", "null"] }, content: { type: "string", maxLength: 200_000 } }, required: ["package_id", "target_runtime_id", "content"], additionalProperties: false };
const goalLinkProperties = { link_id: text, session_id: text, goal_id: text, relation: { enum: ["current", "history"] }, linked_by: text, created_at: text, ended_at: nullable };
export const workActions = {
  homeEvents: defineHomeEventsAction("sessions.home.events", ["session"], "会话首页事项", ["sessions:read"]),
  ...sessionMessageActions,
  subject: defineSubjectContextAction("sessions.subject.read", "session", "会话上下文", ["sessions:read"]),
  /** System search: sessions by title, Runtime and the Goal they work on. Private session content stays with its owner. */
  searchEntries: defineSearchEntriesAction("sessions.search.entries", [{ kind: "session", title: "会话", surface: "sessions" }], "会话", ["sessions:read"]),
  directory: define<Record<string, never>, WorkSessionDirectory>("sessions.directory.read", "会话目录", "读取当前项目会话、目标关联历史、内容记录数量和 Runtime 支持的操作，供目录与会话选择使用。", "query",
    { type: "object", properties: {}, additionalProperties: false }, { type: "object", properties: {
      records: { type: "array", items: { type: "object", properties: { session: publicWorkSessionSchema,
        goal_history: { type: "array", items: { type: "object", properties: goalLinkProperties, required: Object.keys(goalLinkProperties), additionalProperties: false } },
        event_count: { type: "integer", minimum: 0 } }, required: ["session", "goal_history", "event_count"], additionalProperties: false } },
      runtimes: { type: "array", items: { type: "object", properties: { runtime_id: text, capabilities: { type: "object",
        properties: Object.fromEntries(RUNTIME_SESSION_CAPABILITIES.map(key => [key, { enum: ["native", "registry", "unsupported"] }])),
        required: [...RUNTIME_SESSION_CAPABILITIES], additionalProperties: false } }, required: ["runtime_id", "capabilities"], additionalProperties: false } },
    }, required: ["records", "runtimes"], additionalProperties: false }, ["sessions:read"]),
  list: define<Record<string, never>, { sessions: PublicWorkSession[] }>("sessions.list", "项目会话", "读取明确关联到当前项目的 Session，包含其当前目标和工作区。", "query",
    { type: "object", properties: {}, additionalProperties: false }, { type: "object", properties: { sessions: { type: "array", items: publicWorkSessionSchema } }, required: ["sessions"], additionalProperties: false }, ["sessions:read"]),
  content: define<{ session_id: string }, PublicSessionContent>("sessions.content.read", "会话内容", "读取原生会话与 Molis Work 留存的内容；缺失或不完整的原生历史会明确说明。", "query", sessionInput,
    { type: "object", properties: { session: publicWorkSessionSchema, content_mode: { enum: ["native", "fallback", "unavailable", "failed"] },
      events: { type: "array", items: { type: "object", properties: eventProperties, required: Object.keys(eventProperties) } },
      native_error: { anyOf: [{ type: "null" }, { type: "object", properties: { code: text, message: text }, required: ["code", "message"] }] },
      native_history: { anyOf: [{ type: "null" }, { type: "object", properties: { mode: { const: "summary" }, turn_count: { type: "number" }, has_earlier: { type: "boolean" } }, required: ["mode", "turn_count", "has_earlier"] }] },
      partial_terminal_history: { type: "boolean" } }, required: ["session", "content_mode", "events", "native_error", "native_history", "partial_terminal_history"] }, ["sessions:read"]),
  resume: define<{ session_id: string }, SessionResumeResult>("sessions.resume", "恢复原生会话", "请求原 Runtime 加载此会话；不发送用户消息，不改变会话关联。", "command", sessionInput,
    { type: "object", anyOf: [{ type: "object", properties: { status: { const: "ok" }, runtime_id: text, native_runtime_session_id: text, value: {} }, required: ["status", "runtime_id", "native_runtime_session_id", "value"] },
      { type: "object", properties: { status: { enum: ["unsupported", "failed"] }, runtime_id: text, code: text, message: text, next_action: { enum: ["create_handoff", "retry"] } }, required: ["status", "runtime_id", "code", "message", "next_action"] }] }, ["sessions:read", "sessions:resume"]),
  /** Changing which project/Goal a session belongs to, or archiving it, carries the person's confirmation: local user only. */
  archive: define<{ session_id: string; archived: boolean }, { session: PublicWorkSession }>("sessions.archive", "归档或恢复会话记录", "归档（结束）或恢复一条会话记录；原生会话与内容保留", "command",
    { type: "object", properties: { session_id: { type: "string", minLength: 1 }, archived: { type: "boolean" } }, required: ["session_id", "archived"], additionalProperties: false },
    { type: "object", properties: { session: publicWorkSessionSchema }, required: ["session"], additionalProperties: false }, ["sessions:manage"], ["user"]),
  associations: define<{ session_id: string; project_id: string | null; current_goal_id: string | null; workspace_path: string | null }, { session: PublicWorkSession }>("sessions.associations.update", "修改会话关联",
    "把会话挂到另一个项目或当前项目的某个 Goal，或解除关联；工作区路径变化时不沿用原工作区身份", "command",
    { type: "object", properties: { session_id: { type: "string", minLength: 1 }, project_id: nullable, current_goal_id: nullable, workspace_path: nullable },
      required: ["session_id", "project_id", "current_goal_id", "workspace_path"], additionalProperties: false },
    { type: "object", properties: { session: publicWorkSessionSchema }, required: ["session"], additionalProperties: false }, ["sessions:manage"], ["user"]),
  /** Reads the native runtime's own session list into the registry; nothing is linked to a project by this. */
  discover: define<{ runtime_id: string }, SessionDirectoryDiscoveryView>("sessions.discover", "同步原生会话目录", "从所选 Runtime 读取原生会话元数据；不读取内容、不自动关联项目", "command",
    { type: "object", properties: { runtime_id: { type: "string", minLength: 1, maxLength: 200 } }, required: ["runtime_id"], additionalProperties: false },
    { type: "object", properties: { runtime_id: text, status: { enum: ["ok", "unsupported", "failed"] }, records: { type: "array", items: publicWorkSessionSchema }, code: text, message: text },
      required: ["runtime_id", "status", "records"] }, ["sessions:manage"], ["user"]),
  /** Starting a native session or linking an existing one to this project carries the person's confirmation. */
  create: define<{ runtime_id: string; action: "create" | "link"; native_runtime_session_id?: string; current_goal_id: string | null; workspace_id: string | null; workspace_path: string | null; title: string | null },
    { session: PublicWorkSession }>("sessions.create", "新建或关联会话", "在所选 Runtime 新建会话，或把一条已发现的原生会话关联到当前项目，可同时挂到当前 Goal", "command",
    { type: "object", properties: { runtime_id: { type: "string", minLength: 1 }, action: { enum: ["create", "link"] }, native_runtime_session_id: { type: "string" },
      current_goal_id: nullable, workspace_id: nullable, workspace_path: nullable, title: nullable },
      required: ["runtime_id", "action", "current_goal_id", "workspace_id", "workspace_path", "title"], additionalProperties: false },
    { type: "object", properties: { session: publicWorkSessionSchema }, required: ["session"], additionalProperties: false }, ["sessions:manage"], ["user"]),
  /** A handoff moves a session's work to another runtime; every step is the person's own, at this computer. */
  handoffPrepare: define<{ session_id: string; target_runtime_id: string; target_workspace_id?: string | null; target_workspace_path?: string | null; project_name?: string }, Record<string, unknown>>(
    "sessions.handoffs.prepare", "准备会话交接", "按来源会话的当前 Goal 生成交接包草稿；同一来源与目标重复准备时复用原草稿", "command",
    { type: "object", properties: { session_id: { type: "string", minLength: 1 }, target_runtime_id: { type: "string", minLength: 1 }, target_workspace_id: nullable, target_workspace_path: nullable,
      project_name: { type: "string", maxLength: 200 } }, required: ["session_id", "target_runtime_id"], additionalProperties: false }, { type: "object" }, ["sessions:manage", "goals:read"], ["user"]),
  handoffUpdate: define<HandoffTargetInput, Record<string, unknown>>("sessions.handoffs.update", "修改交接包", "保存交接包的目标与正文草稿；不会发送", "command", handoffTargetSchema, { type: "object" }, ["sessions:manage"], ["user"]),
  handoffSend: define<HandoffTargetInput, Record<string, unknown>>("sessions.handoffs.send", "发送交接包", "在目标 Runtime 打开会话并送出交接包；失败时交接包保留并说明原因", "command", handoffTargetSchema, { type: "object" }, ["sessions:manage"], ["user"]),
  handoffCancel: define<{ package_id: string }, Record<string, unknown>>("sessions.handoffs.cancel", "取消交接", "取消尚未发送的交接包", "command",
    { type: "object", properties: { package_id: { type: "string", minLength: 1 } }, required: ["package_id"], additionalProperties: false }, { type: "object" }, ["sessions:manage"], ["user"]),
};
export type SessionDirectoryDiscoveryView = { runtime_id: string; status: "ok" | "unsupported" | "failed"; records: PublicWorkSession[]; code?: string; message?: string };
export const WORK_ACTION_PERMISSIONS = ["sessions:read", "sessions:resume", "sessions:message", "sessions:manage"] as const;
export interface WorkSessionActionResources { messages: SessionMessageService; registry: WorkSessionApi; content: Pick<SessionContentService, "read" | "resume">; router: Pick<RuntimeHostApi, "capabilities">; supportedRuntimeIds: readonly string[];
  directory?: Pick<SessionDirectoryService, "discover" | "create">;
  handoff?: Pick<SessionHandoffService, "prepare" | "update" | "send" | "cancel"> }

export function createWorkActionHandlers(projectId: string, resources: () => Promise<WorkSessionActionResources>,
  assertAuthority: (caller: ActionCallContext, action: ActionReference) => Promise<void>,
  readSubject?: (subject: ActionSubject, caller: ActionCallContext) => Promise<ActionSubjectContext>,
  readGoalContract?: (goalId: string, caller: ActionCallContext) => Promise<SessionHandoffGoalContext>): ActionHandlerBinding[] {
  const check = (registry: WorkSessionApi, sessionId: string, caller: ActionCallContext): WorkSessionRecord => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
    const session = registry.get(sessionId);
    if (session.project_id !== projectId) throw new ActionError("sessions.not_found", "找不到此项目的 Session");
    return session;
  };
  const same = (before: WorkSessionRecord, after: WorkSessionRecord) => before.runtime_id === after.runtime_id && before.native_runtime_session_id === after.native_runtime_session_id
    && before.current_goal_id === after.current_goal_id && before.workspace_id === after.workspace_id && before.workspace_path === after.workspace_path && before.status === after.status;
  const bind = <I, O>(definition: ActionDefinition<I, O>, operation: (input: I, caller: ActionExecutionContext) => Promise<O>): ActionHandlerBinding => ({ ...definition, handle: (caller, input) => operation(input as I, caller) });
  const scoped = async <O>(id: string, caller: ActionCallContext, action: ActionReference, operation: (owner: WorkSessionActionResources) => Promise<O>) => {
    const owner = await resources();
    await assertAuthority(caller, action);
    caller.signal?.throwIfAborted();
    const before = check(owner.registry, id, caller);
    const result = await operation(owner);
    await assertAuthority(caller, action);
    caller.signal?.throwIfAborted();
    const after = check(owner.registry, id, caller);
    if (!same(before, after)) throw new ActionError("actions.subject_changed", "读取或恢复期间 Session 关联已变化，请重新选择");
    return result;
  };
  return [
    bind(workActions.homeEvents, async (input, caller) => {
      assertHomeEventWindow(input);
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources(); await assertAuthority(caller, workActions.homeEvents); caller.signal?.throwIfAborted();
      const labels: Record<string, string> = { discovered: "待确认", active: "进行中", closed: "已结束" };
      const sessions = owner.registry.list({ project_id: projectId }).filter(session => withinHomeEventWindow(session.updated_at || session.created_at, input));
      const projected = await Promise.all(sessions.map(async (session): Promise<HomeEvent | null> => {
        let goalLabel = session.current_goal_id ? "目标 · " + session.current_goal_id : "未关联目标";
        if (session.current_goal_id && readSubject) {
          try { goalLabel = (await readSubject({ kind: "goal", id: session.current_goal_id }, caller)).title; } catch { /* Only the association is owned by Sessions. */ }
        }
        if (!same(session, owner.registry.get(session.session_id))) return null;
        return {
        event_id: "session:" + session.session_id, subject: { kind: "session", id: session.session_id }, occurred_at: session.updated_at || session.created_at,
        placement: "occurred", category: "personal", title: session.title || "Session", summary: labels[session.status] || session.status,
        content: "打开这条会话查看进展，或带着当前事项继续交流。", facts: [["来自", "Sessions"], ["状态", labels[session.status] || session.status], ["挂在", goalLabel]],
        needs_attention: false, open: { kind: "item", surface: "sessions", id: session.session_id, title: session.title || "Session", label: "打开会话" },
        };
      }));
      await assertAuthority(caller, workActions.homeEvents);
      return { source: { surface: "sessions", title: "Sessions", icon: "terminal" }, events: projected.filter((event): event is HomeEvent => event !== null) };
    }),
    ...createSessionMessageHandlers(projectId, resources, assertAuthority),
    bind(workActions.subject, async (input, caller) => {
      const owner = await resources(); await assertAuthority(caller, workActions.subject); caller.signal?.throwIfAborted();
      const session = check(owner.registry, input.subject_id, caller);
      return subjectContext({ subject: { kind: "session", id: session.session_id }, revision: session.updated_at,
        title: session.title || "Session", content: `会话：${session.title || session.session_id}\nRuntime：${session.runtime_id}`,
        goal_ids: session.current_goal_id ? [session.current_goal_id] : [], session_id: session.session_id });
    }),
    { ...bindSearchEntriesHandler(workActions.searchEntries, async caller => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources(); await assertAuthority(caller, workActions.searchEntries); caller.signal?.throwIfAborted();
      return owner.registry.list({ project_id: projectId }).map((session): SearchEntry => ({
        subject: { kind: "session", id: session.session_id }, revision: session.updated_at, title: session.title || "Session",
        summary: searchText([session.runtime_id, session.status].filter(Boolean).join(" · "), 200), updated_at: session.updated_at, content: "summary",
        open: { surface: "sessions", id: session.session_id } }));
    }) },
    bind(workActions.directory, async (_input, caller) => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources();
      await assertAuthority(caller, workActions.directory);
      caller.signal?.throwIfAborted();
      const records = owner.registry.list({ project_id: projectId }).map(session => ({ session: publicSessionRecord(session),
        goal_history: owner.registry.goalHistory(session.session_id), event_count: owner.registry.eventCount(session.session_id) }));
      const runtimeIds = [...new Set([...owner.supportedRuntimeIds, ...records.map(row => row.session.runtime_id)])];
      return { records, runtimes: runtimeIds.map(runtime_id => ({ runtime_id, capabilities: owner.router.capabilities(runtime_id) })) };
    }),
    bind(workActions.list, async (_input, caller) => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources();
      await assertAuthority(caller, workActions.list);
      caller.signal?.throwIfAborted();
      return { sessions: owner.registry.list({ project_id: projectId }).map(publicSessionRecord) };
    }),
    bind(workActions.content, (input, caller) => scoped(input.session_id, caller, workActions.content, async owner => {
      const result = await owner.content.read(input.session_id);
      return { ...result, session: publicSessionRecord(result.session) };
    })),
    bind(workActions.resume, (input, caller) => scoped(input.session_id, caller, workActions.resume, owner => owner.content.resume(input.session_id))),
    bind(workActions.discover, async (input, caller) => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources(); await assertAuthority(caller, workActions.discover);
      if (!owner.directory) throw new ActionError("actions.unredeemed", "Session 目录服务尚未接通");
      await caller.beforeEffect();
      const result = await owner.directory.discover(input.runtime_id);
      return { ...result, records: result.records.map(publicSessionRecord) };
    }),
    bind(workActions.create, async (input, caller) => {
      if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
      const owner = await resources(); await assertAuthority(caller, workActions.create);
      if (!owner.directory) throw new ActionError("actions.unredeemed", "Session 目录服务尚未接通");
      const goalId = input.current_goal_id?.trim() || null;
      if (goalId) {
        let goal: ActionSubjectContext | null = null;
        try { goal = readSubject ? await readSubject({ kind: "goal", id: goalId }, caller) : null; } catch { goal = null; }
        if (!goal) throw new ActionError("actions.input_invalid", "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree");
      }
      await caller.beforeEffect();
      const common = { runtime_id: input.runtime_id, actor_id: caller.actor_id, user_confirmed: caller.audience === "user", project_id: projectId, current_goal_id: goalId,
        workspace_id: input.workspace_id, workspace_path: input.workspace_path, title: input.title?.trim() || null };
      const session = input.action === "create" ? await owner.directory.create(common)
        : owner.registry.explicitlyLinkSession({ ...common, native_runtime_session_id: input.native_runtime_session_id ?? "" });
      return { session: publicSessionRecord(session) };
    }),
    bind(workActions.handoffPrepare, async (input, caller) => {
      const owner = await resources(); await assertAuthority(caller, workActions.handoffPrepare);
      if (!owner.handoff || !readGoalContract) throw new ActionError("actions.unredeemed", "Session 交接服务尚未接通");
      const source = check(owner.registry, input.session_id, caller);
      if (!source.current_goal_id) throw new ActionError("sessions.goal_required", "请先为来源 Session 选择当前 Goal，再创建 Handoff");
      const contract = await readGoalContract(source.current_goal_id, caller);
      await caller.beforeEffect();
      const result = await owner.handoff.prepare({ source_session_id: source.session_id, project_id: projectId, project_name: input.project_name?.trim() || projectId,
        target_runtime_id: input.target_runtime_id, target_workspace_id: input.target_workspace_id ?? null,
        target_workspace_path: input.target_workspace_path === undefined ? source.workspace_path : input.target_workspace_path?.trim() || null, actor_id: caller.actor_id, goal_contract: contract });
      return { handoff: publicSessionHandoff(result.handoff, true), reused: result.reused, source: publicSessionRecord(source),
        goal: { goal_id: contract.goal.goal_id, title: contract.goal.title, outcome: contract.goal.outcome,
          work_state: contract.event_facts?.work_status ?? (contract.goal.trashed_at ? "trashed" : contract.goal.archived_at ? "archived" : "open") } };
    }),
    ...([["update", workActions.handoffUpdate], ["send", workActions.handoffSend]] as const).map(([mode, definition]) => bind(definition, async (input: HandoffTargetInput, caller) => {
      const owner = await resources(); await assertAuthority(caller, definition);
      if (!owner.handoff) throw new ActionError("actions.unredeemed", "Session 交接服务尚未接通");
      const current = owner.registry.getHandoff(input.package_id);
      if (current.source_project_id !== projectId) throw new ActionError("sessions.not_found", "找不到这条 Handoff package");
      await caller.beforeEffect();
      const target = { package_id: current.package_id, target_runtime_id: input.target_runtime_id, ...(input.target_workspace_id !== undefined && input.target_workspace_id !== null ? { target_workspace_id: input.target_workspace_id } : {}),
        target_workspace_path: input.target_workspace_path?.trim() || null, content: input.content, actor_id: caller.actor_id };
      if (mode === "update") return { handoff: publicSessionHandoff(owner.handoff.update({ ...target, user_confirmed: false }), true) };
      const result = await owner.handoff.send({ ...target, user_confirmed: caller.audience === "user" });
      return { handoff: publicSessionHandoff(result.handoff, true), destination_session: result.destination_session ? publicSessionRecord(result.destination_session) : null };
    })),
    bind(workActions.handoffCancel, async (input, caller) => {
      const owner = await resources(); await assertAuthority(caller, workActions.handoffCancel);
      if (!owner.handoff) throw new ActionError("actions.unredeemed", "Session 交接服务尚未接通");
      if (owner.registry.getHandoff(input.package_id).source_project_id !== projectId) throw new ActionError("sessions.not_found", "找不到这条 Handoff package");
      await caller.beforeEffect();
      return { handoff: publicSessionHandoff(owner.handoff.cancel(input.package_id), false) };
    }),
    bind(workActions.archive, async (input, caller) => {
      const owner = await resources(); await assertAuthority(caller, workActions.archive);
      check(owner.registry, input.session_id, caller);
      await caller.beforeEffect();
      // The action is offered to the local user only; that audience is what stands for the person's confirmation.
      return { session: publicSessionRecord(owner.registry.setStatus({ session_id: input.session_id, actor_id: caller.actor_id, user_confirmed: caller.audience === "user",
        status: input.archived ? "closed" : "active" })) };
    }),
    bind(workActions.associations, async (input, caller) => {
      const owner = await resources(); await assertAuthority(caller, workActions.associations);
      const current = check(owner.registry, input.session_id, caller);
      const goalId = input.project_id === projectId ? input.current_goal_id?.trim() || null : null;
      if (goalId) {
        let goal: ActionSubjectContext | null = null;
        try { goal = readSubject ? await readSubject({ kind: "goal", id: goalId }, caller) : null; } catch { goal = null; }
        if (!goal) throw new ActionError("actions.input_invalid", "当前 Goal 不属于这个 Project，或已经不在当前 Goal Tree");
      }
      const workspacePath = input.workspace_path?.trim() || null;
      await caller.beforeEffect();
      return { session: publicSessionRecord(owner.registry.updateAssociations({ session_id: input.session_id, actor_id: caller.actor_id, user_confirmed: caller.audience === "user",
        project_id: input.project_id?.trim() || null, current_goal_id: goalId,
        workspace_id: workspacePath === current.workspace_path ? current.workspace_id : null, workspace_path: workspacePath })) };
    }),
  ];
}
