import { sessionMessageActions, createSessionMessageHandlers } from "./message-actions.js";
import type { SessionMessageService } from "./messages.js";
import { defineSubjectContextAction, subjectContext, ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type ActionSubject, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkSessionApi, WorkSessionRecord, WorkSessionGoalLink } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { RUNTIME_SESSION_CAPABILITIES, type RuntimeHostApi, type RuntimeSessionCapabilities } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { SessionContentService } from "./content.js";
import type { SessionContentResult, SessionResumeResult } from "./types.js";
import { publicSessionRecord } from "./http/public-records.js";
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
  status: { enum: ["discovered", "active", "closed"] }, provenance: { enum: ["molis_work_created", "runtime_discovered", "explicitly_linked", "legacy_migrated"] },
  runtime_workspace_hint: nullable, created_at: text, updated_at: text };
export const publicWorkSessionSchema = { type: "object", properties: sessionProperties, required: Object.keys(sessionProperties), additionalProperties: false };
const sessionInput = { type: "object", properties: { session_id: { type: "string", minLength: 1 } }, required: ["session_id"], additionalProperties: false };
const eventProperties = { event_id: text, session_id: text, source: { enum: ["runtime_native", "molis_work_tui", "molis_work"] },
  kind: { enum: ["user_message", "runtime_message", "tool", "approval", "status", "artifact", "terminal_output"] },
  label: text, content: text, occurred_at: text, source_order: { type: "number" }, runtime_id: text, metadata: { type: "object" } };
const define = <I, O>(id: string, title: string, description: string, operation: "query" | "command", input: Record<string, unknown>, output: Record<string, unknown>, permissions: string[]): ActionDefinition<I, O> => ({
  capability_id: id, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation", scope: "project",
    audiences: ["user", "agent", "workflow", "mcp"], permissions, subject_kinds: ["session"], input_schema: input, output_schema: output },
});
const goalLinkProperties = { link_id: text, session_id: text, goal_id: text, relation: { enum: ["current", "history"] }, linked_by: text, created_at: text, ended_at: nullable };
export const workActions = {
  homeEvents: defineHomeEventsAction("sessions.home.events", ["session"], "会话首页事项", ["sessions:read"]),
  ...sessionMessageActions,
  subject: defineSubjectContextAction("sessions.subject.read", "session", "会话上下文", ["sessions:read"]),
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
};
export const WORK_ACTION_PERMISSIONS = ["sessions:read", "sessions:resume", "sessions:message"] as const;
export interface WorkSessionActionResources { messages: SessionMessageService; registry: WorkSessionApi; content: Pick<SessionContentService, "read" | "resume">; router: Pick<RuntimeHostApi, "capabilities">; supportedRuntimeIds: readonly string[] }

export function createWorkActionHandlers(projectId: string, resources: () => Promise<WorkSessionActionResources>,
  assertAuthority: (caller: ActionCallContext, action: ActionReference) => Promise<void>,
  readSubject?: (subject: ActionSubject, caller: ActionCallContext) => Promise<ActionSubjectContext>): ActionHandlerBinding[] {
  const check = (registry: WorkSessionApi, sessionId: string, caller: ActionCallContext): WorkSessionRecord => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "Session 调用不属于当前项目");
    const session = registry.get(sessionId);
    if (session.project_id !== projectId) throw new ActionError("sessions.not_found", "找不到此项目的 Session");
    return session;
  };
  const same = (before: WorkSessionRecord, after: WorkSessionRecord) => before.runtime_id === after.runtime_id && before.native_runtime_session_id === after.native_runtime_session_id
    && before.current_goal_id === after.current_goal_id && before.workspace_id === after.workspace_id && before.workspace_path === after.workspace_path && before.status === after.status;
  const bind = <I, O>(definition: ActionDefinition<I, O>, operation: (input: I, caller: ActionCallContext) => Promise<O>): ActionHandlerBinding => ({ ...definition, handle: (caller, input) => operation(input as I, caller) });
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
  ];
}
