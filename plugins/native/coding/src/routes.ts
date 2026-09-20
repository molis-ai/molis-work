import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentRunControl, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { CodingSessionStore } from "./store.js";
import type { CodingSessionState } from "./projection.js";

export interface CodingModelChoice { provider_id: string; model_id: string; label: string }
export interface CodingExecutionPorts {
  sessions: CodingSessionStore;
  goalTitle(goalId: string): string | undefined;
  ready(): Promise<void>;
  models(): Promise<readonly CodingModelChoice[]>;
}

function bodyOf(request: PluginRouteRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return {};
  return request.body as Record<string, unknown>;
}
function text(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${label}不能为空，且不能超过 ${maximum} 字符`);
  return value.trim();
}
function sessionState(run: AgentRunView): CodingSessionState {
  if (run.phase === "completed") return "done";
  if (run.phase === "awaiting-input") return "waiting-answer";
  if (run.phase === "awaiting-review") return "waiting-approval";
  if (["failed", "stopped", "cancelled", "reconcile-required"].includes(run.phase)) return run.phase as CodingSessionState;
  return "running";
}

/** Coding owns intent and organization; execution is always obtained through Host capabilities. */
export function codingRoutes(context: PluginStartContext, ports?: CodingExecutionPorts): PluginRouteBinding[] {
  const boardId = context.board_id ?? "";
  const busy = new Set<string>();
  const route = (route_id: string, handle: (request: PluginRouteRequest, api: NonNullable<PluginStartContext["services"]>["capabilities"], execution: CodingExecutionPorts) => Promise<unknown>): PluginRouteBinding => ({
    route_id,
    async handle(request) {
      const api = context.services?.capabilities;
      if (!ports || !api || !boardId) return { status: 503, body: { error: "Coding 执行入口尚未装配" } };
      try {
        await ports.ready();
        return { status: 200, body: await handle(request, api, ports) };
      } catch (error) {
        const code = (error as { code?: string }).code;
        return { status: code === "coding.session_unknown" ? 404 : code === "agent.session_busy" ? 409 : 400,
          body: { error: error instanceof Error ? error.message : "Coding 操作失败", ...(code ? { code } : {}) } };
      }
    },
  });
  const selected = (request: PluginRouteRequest, execution: CodingExecutionPorts) =>
    execution.sessions.get(boardId, request.params.sessionId ?? "");
  return [
    route("coding.state", async (_request, api, execution) => {
      const runtimes = await api!.invoke(agent.listRuntimes, []);
      const sessions = await Promise.all(execution.sessions.list(boardId).map(async record => {
        if (record.runtime_session_id) {
          try {
            const snapshot = await api!.invoke(agent.readSession, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
            const next = snapshot.recovery ? "reconcile-required" : snapshot.latest_run ? sessionState(snapshot.latest_run) : "idle";
            if (next !== record.state) record = execution.sessions.setState(boardId, record.session_id, next, record.updated_at);
          } catch {
            // One unreadable ledger must not hide other sessions or make the
            // directory call completed work safe to continue.
            if (record.state !== "reconcile-required") record = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
          }
        }
        return { ...record, goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null };
      }));
      return { sessions, models: await execution.models(),
        workspace: await api!.invoke(projectsCapabilities.readWorkspace, []),
        workspaces: await api!.invoke(projectsCapabilities.listWorkspaces, []),
        runtimes: await Promise.all(runtimes.map(async (runtime) => ({ ...runtime,
          roles: await api!.invoke(agent.availableRoles, [runtime.runtime_id, context.plugin_id]),
        }))),
      };
    }),
    route("coding.create-session", async (request, _api, execution) => {
      const body = bodyOf(request);
      const record = execution.sessions.create({ board_id: boardId, session_id: crypto.randomUUID(),
        title: text(body.title ?? "新编码会话", "会话名称"), runtime_id: "prologue", at: new Date().toISOString() });
      return { session: record };
    }),
    route("coding.read-session", async (request, api, execution) => {
      const record = selected(request, execution);
      const draft = context.services?.storage?.get(`draft:${record.session_id}`) ?? "";
      if (!record.runtime_session_id) return { session: record, runs: [], draft };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      try {
        const snapshot = await api!.invoke(agent.readSession, [session]);
        const runs = await Promise.all(snapshot.runs.map((run) => api!.invoke(agent.readRun, [session, run])));
        const last = runs.at(-1);
        const state = snapshot.recovery ? "reconcile-required" : last ? sessionState(last) : "idle";
        const updated = state === record.state ? record : execution.sessions.setState(boardId, record.session_id, state, record.updated_at);
        return { session: { ...updated, goal_title: updated.goal_id ? execution.goalTitle(updated.goal_id) ?? null : null }, runs, draft,
          ...(snapshot.recovery ? { recovery_required: true, error: snapshot.recovery.reason } : {}) };
      } catch (error) {
        // Never replace a lost runtime reference with a new session: that would
        // silently lose history and could repeat effects after a restart.
        const session = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
        return { session, runs: [], draft, recovery_required: true,
          error: (error as { code?: string }).code === "agent.session_unknown"
            ? "此会话的执行记录尚未恢复，不能把它当新任务重跑。原会话与草稿已保留。"
            : "此会话的执行记录暂时无法读取，不能将未知结果当作已完成。原会话与草稿已保留，请稍后重试。" };
      }
    }),
    route("coding.command-output", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const run = snapshot.runs.find(entry => entry.run_id === request.params.runId);
      if (!run) throw new Error("这轮执行不属于当前会话");
      return api!.invoke(agent.readCommandOutput, [session, { run_id: run.run_id, call_id: text(request.params.callId, "命令引用") }]);
    }),
    route("coding.update-session", async (request, _api, execution) => {
      const record = selected(request, execution);
      const body = bodyOf(request);
      if (body.draft !== undefined) {
        if (typeof body.draft !== "string" || body.draft.length > 100_000) throw new Error("草稿格式无效或超过长度限制");
        context.services!.storage!.set(`draft:${record.session_id}`, body.draft);
      }
      return { session: body.title === undefined ? record : execution.sessions.rename(boardId, record.session_id, text(body.title, "会话名称"), new Date().toISOString()) };
    }),
    route("coding.start-run", async (request, api, execution) => {
      const record = selected(request, execution);
      if (busy.has(record.session_id)) throw Object.assign(new Error("这个会话正在提交任务"), { code: "agent.session_busy" });
      busy.add(record.session_id);
      try {
        const body = bodyOf(request);
        const task = text(body.task, "任务", 100_000);
        const role = body.intent === "review" ? "reviewer" : body.intent === "execute" ? "builder" : body.intent === "edit" ? "writer" : body.intent === "discuss" ? "reader" : null;
        if (!role) throw new Error("请选择讨论、修改文件、执行或评审；计划协作尚未接通");
        const workspaces = await api!.invoke(projectsCapabilities.listWorkspaces, []);
        const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw new Error("请先为这个项目选择已授权的工作区目录");
        const directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
        const identity = { board_id: boardId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: request.actor_id };
        const models = await execution.models();
        const model = models.find((entry) => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
        if (!model) throw new Error("所选模型不可用，请在全局模型设置中检查配置");
        const roles = await api!.invoke(agent.availableRoles, [record.runtime_id, context.plugin_id]);
        const availability = roles.find((entry) => entry.role_id === role);
        if (!availability?.available) throw new Error(availability?.reason ?? "这个执行方式尚未接通");
        const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
          : await api!.invoke(agent.createSession, [record.runtime_id, { ...identity, directory, title: record.title }]);
        if (!record.runtime_session_id) execution.sessions.setRuntimeSession(boardId, record.session_id, session.session_id, new Date().toISOString());
        const run = await api!.invoke(agent.startRun, [record.runtime_id, { ...identity, session, directory, task, role_id: role,
          model_selection: { provider_id: model.provider_id, model_id: model.model_id } }]);
        context.services!.storage!.delete(`draft:${record.session_id}`);
        execution.sessions.setState(boardId, record.session_id, "running", new Date().toISOString());
        return { run };
      } finally { busy.delete(record.session_id); }
    }),
    route("coding.control-run", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const body = bodyOf(request);
      const run = snapshot.runs.find((entry) => entry.run_id === body.run_id);
      if (!run) throw new Error("找不到属于这个会话的执行");
      const current = await api!.invoke(agent.readRun, [session, run]);
      if (isTerminalAgentPhase(current.phase)) throw new Error("这一轮已经结束，请开始新一轮");
      const control: AgentRunControl = body.kind === "steer" ? { kind: "steer", text: text(body.text, "补充要求", 100_000) }
        : body.kind === "stop" ? { kind: "stop" } : body.kind === "pause" ? { kind: "pause" }
        : body.kind === "resume" ? { kind: "resume" } : (() => { throw new Error("不支持的控制动作"); })();
      await api!.invoke(agent.controlRun, [session, run, control]);
      return { accepted: true };
    }),
  ];
}
