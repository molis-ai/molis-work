import { isDeepStrictEqual } from "node:util";
import { materialChoices, materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentRunControl, type AgentRunView, type AgentSkillRef, type AgentMcpToolRef, type AgentMcpSourceRef, type AgentMcpServerInput } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { CodingSessionStore } from "./store.js";
import type { CodingSessionState } from "./projection.js";
import { CODING_REPORT_TYPE } from "./artifacts.js";
import { codingReportPreview, codingReportReference, createCodingExecutionReport, readCodingExecutionReport } from "./report.js";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { currentGoalContext, savedGoalContext, saveGoalContext, resolveGoalContext, runGoalContext } from "./goal-context.js";
import { codingChangeSetReference, codingChangeSetPreview, readCodingChangeSet, createCodingChangeSet, codingChangeFeedback } from "./changeset.js";
import { CODING_CHANGESET_TYPE } from "./artifacts.js";
import { characterSelection, characterTitle, savedCharacter, type CodingCharacterPorts } from "./characters.js";
import { confirmedPlan, parseCodingPlan, planFromRun, planMaterial, planReference } from "./plans.js";
import { CODING_PLAN_TYPE } from "./artifacts.js";

export interface CodingModelChoice { provider_id: string; model_id: string; label: string }
export interface CodingExecutionPorts {
  characters?: CodingCharacterPorts;
  sessions: CodingSessionStore;
  materialReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  reportReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  changeSetReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
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
function methodSelection(value: unknown): AgentSkillRef[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("方法选择格式无效");
  const refs = value.map(item => {
    if (!item || typeof item !== "object") throw new Error("方法引用无效");
    const {skill_id, version} = item as Record<string, unknown>;
    if (typeof skill_id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(skill_id)
      || typeof version !== "number" || !Number.isInteger(version) || version < 1) throw new Error("方法版本无效");
    return {skill_id, version};
  });
  if (new Set(refs.map(ref=>ref.skill_id)).size !== refs.length) throw new Error("方法选择重复");
  return refs;
}
function mcpSelection(value: unknown): AgentMcpToolRef[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("MCP 选择格式无效");
  const refs = value.map(item => {
    if (!item || typeof item !== "object") throw new Error("MCP 工具引用无效");
    const entry = item as Record<string, unknown>;
    if (entry.configuration_version !== undefined && (!Number.isInteger(entry.configuration_version) || Number(entry.configuration_version) < 1)) throw new Error("MCP 配置版本无效");
    return { ...(entry.configuration_version === undefined ? {} : {configuration_version: entry.configuration_version as number}), server: text(entry.server, "MCP 服务"), tool: text(entry.tool, "MCP 工具"), version: text(entry.version, "MCP 版本") };
  });
  if (new Set(refs.map(ref=>JSON.stringify([ref.server,ref.tool]))).size !== refs.length) throw new Error("MCP 工具选择重复");
  return refs;
}
function mcpSources(value: unknown): AgentMcpSourceRef[] {
  if(!Array.isArray(value) || value.length>100) throw new Error("MCP 资料选择格式无效");
  const refs=value.map(item=>{
    if(!item || typeof item!=="object" || !Number.isInteger(item.configuration_version) || item.configuration_version<1) throw new Error("MCP 资料配置版本无效");
    return {server:text(item.server,"MCP 资料服务"),configuration_version:item.configuration_version as number};
  });
  if(new Set(refs.map(ref=>ref.server)).size!==refs.length) throw new Error("MCP 资料来源重复");
  return refs;
}
function nextConfiguration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("下一轮配置格式无效");
  const config = value as Record<string, unknown>;
  if (!["discuss", "plan", "collaborate", "edit", "execute", "review"].includes(String(config.intent))) throw new Error("执行方式无效");
  for (const key of ["provider_id", "model_id", "workspace_id"]) {
    if (typeof config[key] !== "string" || (config[key] as string).length > 1000) throw new Error("模型或工作区配置无效");
  }
  return { intent: config.intent as string, provider_id: config.provider_id as string,
    model_id: config.model_id as string, workspace_id: config.workspace_id as string };
}
function questionAnswer(body: Record<string, unknown>): Extract<AgentRunControl, { kind: "answer" }> {
  const pending_id = text(body.pending_id, "问题引用");
  const pending_revision = body.pending_revision;
  if (typeof pending_revision !== "number" || !Number.isInteger(pending_revision) || pending_revision < 1) throw new Error("问题版本无效，请重新读取原问题");
  if (body.answers === undefined) {
    text(body.text, "回答", 100_000);
    // Validate blank/oversized input without rewriting the user's answer.
    return { kind: "answer", pending_id, pending_revision, text: body.text as string };
  }
  if (body.text !== undefined || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 10) throw new Error("问卷回答格式无效");
  const answers = body.answers.map(value => {
    if (!value || typeof value !== "object") throw new Error("问卷回答格式无效");
    const { question, indexes, other } = value as Record<string, unknown>;
    if (typeof question !== "number" || !Number.isInteger(question) || !Array.isArray(indexes) || indexes.length > 20
      || !indexes.every(index => typeof index === "number" && Number.isInteger(index))
      || other !== undefined && (typeof other !== "string" || other.length > 500)) throw new Error("问题或选项编号无效");
    return { question, indexes: indexes as number[], ...(other === undefined ? {} : { other: other as string }) };
  });
  return { kind: "answer", pending_id, pending_revision, answers };
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
  const reportRoute = (save: boolean) => route(save ? "coding.save-report" : "coding.read-report", async (request, api, execution) => {
    const record = selected(request, execution);
    const runId = text(request.params.runId, "执行引用");
    const artifacts = context.services!.artifacts;
    const existing = readCodingExecutionReport(artifacts, record.session_id, runId);
    if (existing) return existing;
    if (request.query?.fixed === "1") throw new Error("原固定报告当前不可读，不能用执行中的新信息重新拼接替代");
    if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const snapshot = await api!.invoke(agent.readSession, [session]);
    const ref = snapshot.runs.find(entry => entry.run_id === runId);
    if (!ref) throw new Error("这轮执行不属于当前会话");
    const run = await api!.invoke(agent.readRun, [session, ref]);
    if (!isTerminalAgentPhase(run.phase)) throw new Error("这一轮尚未结束或仍需核对结果，暂不能保存报告");
    const commands = await Promise.all((run.command_outputs ?? []).map(async command => {
      try {
        const output = await api!.invoke(agent.readCommandOutput, [session, { run_id: runId, call_id: command.call_id }]);
        return { call_id: command.call_id, output };
      } catch { return { call_id: command.call_id, output: null }; }
    }));
    const report = createCodingExecutionReport({ session_id: record.session_id, runtime_id: record.runtime_id, title: record.title, run, commands, ...runGoalContext(context, run) });
    if (!save) return { report, reference: null, saved_at: null };
    // No asynchronous gap between recheck and publish: concurrent clicks share
    // the existing fixed version, even if their evidence reads finished later.
    const saved = readCodingExecutionReport(artifacts, record.session_id, runId);
    if (saved) return saved;
    const reference = codingReportReference(record.session_id, runId);
    const result = artifacts.publish({ ...reference, artifact_type_id: CODING_REPORT_TYPE, schema_version: 1,
      content: { kind: "inline", payload: JSON.parse(JSON.stringify(report)) },
      metadata: { title: report.title, session_id: record.session_id, run_id: runId } });
    return { report, reference, saved_at: result.artifact.created_at };
  });
  const reportOutput = (write: boolean) => route(write ? "coding.select-report-output" : "coding.report-output", async (request, _api, execution) => {
    const session = selected(request, execution);
    const saved = readCodingExecutionReport(context.services!.artifacts, session.session_id, text(request.params.runId, "执行引用"));
    if (!saved) throw new Error("请先保存固定报告，再选择报告输出");
    const outputs = context.services!.outputs!;
    if (write) {
      const body = bodyOf(request);
      const expected = body.expected_reference === null ? null : materialSelection([body.expected_reference])[0]!;
      outputs.select({ port: "report", reference: saved.reference, expected_reference: expected });
    }
    const current = outputs.reference("report");
    return { reference: saved.reference, current, selected: current?.artifact_id === saved.reference.artifact_id && current?.version === saved.reference.version };
  });
  const reportProgress = (write: boolean) => route(write ? "coding.record-report-progress" : "coding.report-progress", async (request, api, execution) => {
    const session = selected(request, execution);
    const runId = text(request.params.runId, "执行引用");
    const saved = readCodingExecutionReport(context.services!.artifacts, session.session_id, runId);
    if (!saved) throw new Error("请先保存这轮固定报告，再记录 Goal 进展");
    const { report, reference } = saved;
    if (!report.goal || report.goal_source_error) throw new Error("这份报告没有可确认的原目标，不能改用会话后来选择的目标记录进展");
    const goalId = report.goal.goal_id;
    const idempotencyKey = `coding-report-progress:${reference.artifact_id}@${reference.version}`;
    const actorId = request.actor_id;
    if (!actorId) throw new Error("当前操作缺少用户身份");
    if (!write) {
      const receipt = await api!.invoke(goalProgressCapabilities.receipt, { goal_id: goalId, actor_id: actorId, idempotency_key: idempotencyKey });
      if (receipt) return { report_goal: report.goal, reference, title: report.title, recorded: receipt, current: null };
      const current = await api!.invoke(goalContextCapabilities.read, { goal_id: goalId });
      return { report_goal: report.goal, reference, title: report.title, recorded: null, current };
    }
    const body = bodyOf(request);
    const cursor = body.expected_goal_cursor, revision = body.expected_contract_revision;
    if (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0
      || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) throw new Error("请先查看原目标当前版本，再确认记录进展");
    // The original Goal transaction checks replay first, then versions and write.
    // Nothing is derived from a browser-supplied report, Goal id, or source body.
    return api!.invoke(goalProgressCapabilities.record, {
      goal_id: goalId, actor_id: actorId, actor_kind: "user", idempotency_key: idempotencyKey,
      based_on_cursor: cursor, expected_goal_cursor: cursor, expected_contract_revision: revision,
      summary: text(body.summary, "进展内容", 10000),
      ...(body.next_step ? { next_step: text(body.next_step, "下一步", 10000) } : {}),
      source: { ...reference, title: report.title, origin: { plugin_id: "coding", item_id: reference.artifact_id } },
    });
  });
  return [
    ...[false, true].map(save => route(save ? "coding.save-changeset" : "coding.read-changeset", async (request, api, execution) => {
      const record = selected(request, execution), runId = text(request.params.runId, "执行引用");
      const artifacts = context.services!.artifacts;
      const existing = readCodingChangeSet(artifacts, record.session_id, runId);
      if (existing) return { ...existing, output: context.services!.outputs!.reference("changeset") };
      if (request.query?.fixed === "1") throw new Error("原固定变更不可读，不能替换成当前工作区");
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]), ref = snapshot.runs.find(run => run.run_id === runId);
      if (!ref) throw new Error("这轮执行不属于当前会话");
      const run = await api!.invoke(agent.readRun, [session, ref]);
      const change = createCodingChangeSet(record.session_id, run, await api!.invoke(agent.readRunReviews, [session, ref]));
      if (!save) return { change, reference: null, saved_at: null, output: context.services!.outputs!.reference("changeset") };
      const saved = readCodingChangeSet(artifacts, record.session_id, runId);
      if (saved) return { ...saved, output: context.services!.outputs!.reference("changeset") };
      const reference = codingChangeSetReference(record.session_id, runId);
      const result = artifacts.publish({ ...reference, artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify(change)) },
        metadata: { title: record.title + " · 本轮固定变更", session_id: record.session_id, run_id: runId } });
      return { change, reference, saved_at: result.artifact.created_at, output: context.services!.outputs!.reference("changeset") };
    })),
    route("coding.changeset-output", async (request, _api, execution) => {
      const record = selected(request, execution), saved = readCodingChangeSet(context.services!.artifacts, record.session_id, text(request.params.runId, "执行引用"));
      if (!saved) throw new Error("请先保存固定变更");
      const body = bodyOf(request), expected = body.expected_reference === null ? null : materialSelection([body.expected_reference])[0]!;
      context.services!.outputs!.select({ port: "changeset", reference: saved.reference, expected_reference: expected });
      return { ...saved, output: context.services!.outputs!.reference("changeset") };
    }),
    route("coding.changeset-feedback", async (request, _api, execution) => {
      const record = selected(request, execution), runId = text(request.params.runId, "执行引用");
      const saved = readCodingChangeSet(context.services!.artifacts, record.session_id, runId);
      if (!saved) throw new Error("请先保存固定变更，再填写行级意见");
      return { task: codingChangeFeedback(saved.change, bodyOf(request).comments), reference: saved.reference };
    }),
    reportRoute(false), reportRoute(true), reportOutput(false), reportOutput(true), reportProgress(false), reportProgress(true),
    route("coding.goals", async (request, api) => api!.invoke(goalContextCapabilities.list, {
      ...(request.query?.after_cursor ? { after_cursor: String(request.query.after_cursor) } : {}),
    })),
    route("coding.goal-context", async (request) => {
      const value = await currentGoalContext(context, text(request.params.goalId, "目标"));
      return { ...value, text: value.material.text };
    }),
    route("coding.read-goal", async (request, _api, execution) => {
      const record = selected(request, execution);
      if (!record.goal_id) return { goal_id: null, selected: null };
      try { return { goal_id: record.goal_id, selected: savedGoalContext(context, record.session_id) }; }
      catch (error) { return { goal_id: record.goal_id, selected: null, error: error instanceof Error ? error.message : "固定目标不可读" }; }
    }),
    route("coding.select-goal", async (request, _api, execution) => {
      const record = selected(request, execution), body = bodyOf(request);
      if (busy.has(record.session_id)) throw new Error("正在提交任务，请稍后修改下一轮目标");
      const goalId = body.goal_id === null ? null : text(body.goal_id, "目标");
      if (goalId) {
        const value = await currentGoalContext(context, goalId);
        if (value.reference.artifact_id !== body.expected_artifact_id) throw new Error("目标内容已变化，请重新查看后确认");
        if (busy.has(record.session_id)) throw new Error("正在提交任务，请稍后修改下一轮目标");
        saveGoalContext(context, record.session_id, value);
      }
      const session = execution.sessions.setGoal(boardId, record.session_id, goalId, new Date().toISOString());
      if (!goalId) context.services!.storage!.delete(`goal-context:${record.session_id}`);
      return { session, selected: goalId ? savedGoalContext(context, record.session_id) : null };
    }),
    route("coding.reports", async (_request, _api, execution) => {
      if (!execution.reportReferences) throw new Error("报告目录尚未装配");
      const reports = execution.reportReferences().flatMap(reference => {
        const value = codingReportPreview(context.services!.artifacts.read(reference));
        if (!value) return [];
        const { body_markdown: _body, ...entry } = value;
        return [entry];
      });
      return { reports };
    }),
    route("coding.artifacts", async (_request, _api, execution) => {
      if (!execution.reportReferences || !execution.changeSetReferences) throw new Error("成果目录尚未装配");
      const artifacts = [...execution.reportReferences(), ...execution.changeSetReferences()].flatMap(reference => {
        const record = context.services!.artifacts.read(reference);
        const report = codingReportPreview(record);
        if (report) { const { body_markdown: _body, ...entry } = report; return [{ ...entry, kind: "report", file_count: 0 }]; }
        const saved = codingChangeSetPreview(record);
        if (!saved) return [];
        const { change, ...entry } = saved;
        return [{ ...entry, kind: "changeset", file_count: change.files.length }];
      }).sort((a, b) => b.saved_at.localeCompare(a.saved_at) || a.reference.artifact_id.localeCompare(b.reference.artifact_id));
      return { artifacts };
    }),
    route("coding.materials", async (request, _api, execution) => {
      const record = selected(request, execution);
      return { materials: materialChoices(context, savedMaterials(context, record.session_id), execution.materialReferences?.()) };
    }),
    route("coding.state", async (_request, api, execution) => {
      const runtimes = await api!.invoke(agent.listRuntimes, []);
      const sessions = await Promise.all(execution.sessions.list(boardId).map(async record => {
        let checkpointBusy = false;
        if (record.runtime_session_id) {
          try {
            const snapshot = await api!.invoke(agent.readSession, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
            checkpointBusy = snapshot.checkpoint_busy === true;
            const next = snapshot.recovery ? "reconcile-required" : snapshot.latest_run ? sessionState(snapshot.latest_run) : "idle";
            if (next !== record.state) record = execution.sessions.setState(boardId, record.session_id, next, record.updated_at);
          } catch {
            // One unreadable ledger must not hide other sessions or make the
            // directory call completed work safe to continue.
            if (record.state !== "reconcile-required") record = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
          }
        }
        return { ...record, checkpoint_busy: checkpointBusy, goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null };
      }));
      const methods = runtimes.some(runtime=>runtime.runtime_id === "prologue") ? await api!.invoke(agent.listSkills, ["prologue", context.plugin_id]) : [];
      const mcp = runtimes.some(runtime=>runtime.runtime_id === "prologue" && runtime.capabilities.mcp !== "unsupported") ? await api!.invoke(agent.listMcp, ["prologue", context.plugin_id]) : [];
      return { sessions, methods, mcp, models: await execution.models(),
        workspace: await api!.invoke(projectsCapabilities.readWorkspace, []),
        workspaces: await api!.invoke(projectsCapabilities.listWorkspaces, []),
        runtimes: await Promise.all(runtimes.map(async (runtime) => ({ ...runtime,
          roles: await api!.invoke(agent.availableRoles, [runtime.runtime_id, context.plugin_id]),
        }))),
      };
    }),
    route("coding.save-mcp", async (request, api) => {
      const body = bodyOf(request);
      const input = { id: body.id, expected_version: body.expected_version, label: body.label, enabled: body.enabled, timeout_ms: body.timeout_ms,
        transport: body.transport, executable: body.executable, argv: body.argv, endpoint: body.endpoint, auth: body.auth } as AgentMcpServerInput;
      if (input.transport === "stdio") {
        const workspaces = await api!.invoke(projectsCapabilities.listWorkspaces, []);
        const workspace = workspaces.find(item=>item.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw new Error("请选择当前项目已授权的 MCP 工作区");
        input.directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
      }
      return { server: await api!.invoke(agent.saveMcp, ["prologue", context.plugin_id, input]) };
    }),
    route("coding.control-mcp", async (request, api) => {
      const action = bodyOf(request).action;
      if (!["connect","disconnect","cancel","remove"].includes(String(action))) throw new Error("MCP 操作无效");
      await api!.invoke(agent.controlMcp, ["prologue", context.plugin_id, text(request.params.serverId,"MCP 服务"), action as "connect" | "disconnect" | "cancel" | "remove"]);
      return { accepted: true };
    }),
    route("coding.discover-methods", async (request, api) => {
      const body = bodyOf(request);
      const workspaces = await api!.invoke(projectsCapabilities.listWorkspaces, []);
      const workspace = workspaces.find(item => item.workspace_id === body.workspace_id);
      if (!workspace?.realpath_verified) throw new Error("请先选择这个项目已授权的工作区");
      return { candidates: await api!.invoke(agent.discoverSkills, ["prologue", context.plugin_id,
        { canonical_path: workspace.canonical_path, realpath_verified: true }, text(body.path, "方法目录", 1000)]) };
    }),
    route("coding.install-method", async (request, api) => ({ method: await api!.invoke(agent.installSkill,
      ["prologue", context.plugin_id, text(bodyOf(request).candidate_id, "候选方法")]) })),
    route("coding.read-method", async (request, api) => {
      const ref = methodSelection([{skill_id: request.params.skillId, version: Number(request.params.version)}])[0]!;
      return { method: await api!.invoke(agent.readSkill, ["prologue", context.plugin_id, ref]) };
    }),
    route("coding.create-session", async (request, _api, execution) => {
      const body = bodyOf(request);
      const record = execution.sessions.create({ board_id: boardId, session_id: crypto.randomUUID(),
        title: text(body.title ?? "新编码会话", "会话名称"), runtime_id: "prologue", at: new Date().toISOString() });
      return { session: record };
    }),
    route("coding.read-plan", async (request, _api, execution) => {
      const record = selected(request, execution);
      if (request.query?.revision !== undefined) {
        const revision = Number(request.query.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("固定计划修订无效");
        return { plan: confirmedPlan(context, record.session_id, revision), fixed: true };
      }
      return { plan: execution.sessions.plan(boardId, record.session_id) };
    }),
    route("coding.save-plan", async (request, api, execution) => {
      const record = selected(request, execution), body = bodyOf(request);
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后调整下一版计划");
      const expected = body.expected_revision;
      if (!Number.isSafeInteger(expected) || Number(expected) < 0) throw new Error("请先读取计划修订");
      const current = execution.sessions.plan(boardId, record.session_id);
      if ((current?.revision ?? 0) !== expected) throw new Error("计划已变化，请重新打开后合并修改");
      let proposal;
      if (body.run_id !== undefined) {
        if (!record.runtime_session_id) throw new Error("没有可读取的规划轮次");
        const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
        const snapshot = await api!.invoke(agent.readSession, [session]);
        const ref = snapshot.runs.find(run => run.run_id === body.run_id);
        if (!ref) throw new Error("规划轮次不属于当前会话");
        proposal = planFromRun(record.session_id, await api!.invoke(agent.readRun, [session, ref]));
      } else {
        if (!current) throw new Error("请先从规划轮次形成计划");
        proposal = { source: current.source, content: parseCodingPlan(body.content) };
      }
      if (current?.confirmed && !proposal.content.change_reason) throw new Error("调整已确认计划时，请说明变更理由");
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后调整下一版计划");
      const plan = execution.sessions.savePlan(boardId, record.session_id, Number(expected), {
        ...proposal, revision: Number(expected) + 1, confirmed: null,
      });
      return { plan };
    }),
    route("coding.confirm-plan", async (request, _api, execution) => {
      const record = selected(request, execution), draft = execution.sessions.plan(boardId, record.session_id);
      if (busy.has(record.session_id)) throw new Error("正在开始执行，请稍后确认下一版计划");
      if (!draft || draft.revision !== bodyOf(request).expected_revision) throw new Error("计划已变化，请重新查看当前修订");
      if (draft.content.blockers) throw new Error("计划仍有未解决阻塞，请先调整计划");
      if (draft.confirmed) return { plan: draft };
      const reference = planReference(record.session_id, draft.revision), fixed = { ...draft, confirmed: reference };
      planMaterial(fixed);
      const artifacts = context.services!.artifacts;
      if (!artifacts.read(reference)) artifacts.publish({ ...reference, artifact_type_id: CODING_PLAN_TYPE, schema_version: 1,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify(fixed)) },
        metadata: { title: fixed.content.title, session_id: record.session_id, run_id: fixed.source.run_id } });
      const saved = confirmedPlan(context, record.session_id, draft.revision);
      if (!isDeepStrictEqual(saved, fixed)) throw new Error("固定计划与当前草稿不一致，不能确认");
      return { plan: execution.sessions.confirmPlan(boardId, record.session_id, fixed) };
    }),
    route("coding.control-subagent", async (request, api, execution) => {
      const record = selected(request, execution), body = bodyOf(request);
      if (!record.runtime_session_id) throw new Error("此会话没有执行记录");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const run = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "原执行") };
      const children = await api!.invoke(agent.listSubagents, [session, run]);
      const child = children.find(child => child.subagent_id === request.params.childId);
      if (!child) throw new Error("子任务不属于这轮执行");
      if (body.action === "stop") await api!.invoke(agent.cancelSubagent, [session, run, child.subagent_id, request.actor_id]);
      else {
        if (!["accepted", "needs-work"].includes(String(body.action)) || child.state !== "completed") throw new Error("只有已结束的成功执行可以评价结果，失败或中断需先核对");
        const notes = typeof body.notes === "string" ? body.notes.trim() : "";
        if (notes.length > 4000 || body.action === "needs-work" && !notes) throw new Error("返工需写明原因，说明最多 4000 字符");
        const key = `subagent-verdict:${record.session_id}:${run.run_id}:${child.subagent_id}`;
        const previous = context.services!.storage!.get(key);
        const revision = typeof previous === "string" ? JSON.parse(previous).revision : 0;
        if (body.expected_revision !== revision) throw new Error("评价已变化，请重新查看后提交");
        context.services!.storage!.set(key, JSON.stringify({ revision: revision + 1, status: body.action, notes, actor: request.actor_id, at: new Date().toISOString() }));
      }
      return { ok: true };
    }),
    route("coding.characters", async (request, _api, execution) => {
      const record = selected(request, execution);
      return { characters: execution.characters?.list() ?? [], selected: savedCharacter(context, record.session_id), runtime_id: record.runtime_id };
    }),
    route("coding.read-session", async (request, api, execution) => {
      const record = selected(request, execution);
      const character = savedCharacter(context, record.session_id), character_title = characterTitle(context, character);
      const plan = execution.sessions.plan(boardId, record.session_id);
      const draft = context.services?.storage?.get(`draft:${record.session_id}`) ?? "";
      const savedConfiguration = context.services?.storage?.get(`configuration:${record.session_id}`);
      const configuration = typeof savedConfiguration === "string" ? nextConfiguration(JSON.parse(savedConfiguration)) : null;
      const savedMcp = context.services?.storage?.get(`mcp:${record.session_id}`);
      const mcp_tools = typeof savedMcp === "string" ? mcpSelection(JSON.parse(savedMcp)) : [];
      const savedSources = context.services?.storage?.get(`mcp-sources:${record.session_id}`);
      const mcp_sources = typeof savedSources === "string" ? mcpSources(JSON.parse(savedSources)) : [];
      const materials = savedMaterials(context, record.session_id);
      const savedMethods = context.services?.storage?.get(`methods:${record.session_id}`);
      const methods = typeof savedMethods === "string" ? methodSelection(JSON.parse(savedMethods)) : [];
      const questionDrafts = context.services?.storage?.get(`question-drafts:${record.session_id}`);
      const question_drafts = typeof questionDrafts === "string" ? JSON.parse(questionDrafts) : {};
      if (!record.runtime_session_id) return { session: { ...record, goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null }, runs: [], draft, question_drafts, materials, methods, configuration, mcp_tools, mcp_sources, character, character_title, plan };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      try {
        const snapshot = await api!.invoke(agent.readSession, [session]);
        const runs = await Promise.all(snapshot.runs.map((run) => api!.invoke(agent.readRun, [session, run])));
        const subagents = [];
        for (const run of runs.filter(run => run.frozen.role_id === "coordinator")) {
          try {
            const children = await api!.invoke(agent.listSubagents, [session, run.ref]);
            subagents.push({ run_id: run.ref.run_id, children: children.map(child => {
              const saved = context.services!.storage!.get(`subagent-verdict:${record.session_id}:${run.ref.run_id}:${child.subagent_id}`);
              return { ...child, verdict: typeof saved === "string" ? JSON.parse(saved) : null };
            }) });
          } catch (error) { subagents.push({ run_id: run.ref.run_id, children: [], error: error instanceof Error ? error.message : "子任务状态不可读取" }); }
        }
        const last = runs.at(-1);
        const state = snapshot.recovery ? "reconcile-required" : last ? sessionState(last) : "idle";
        const updated = state === record.state ? record : execution.sessions.setState(boardId, record.session_id, state, record.updated_at);
        return { session: { ...updated, checkpoint_busy: snapshot.checkpoint_busy === true, goal_title: updated.goal_id ? execution.goalTitle(updated.goal_id) ?? null : null }, runs, subagents, draft, question_drafts, materials, methods, configuration, mcp_tools, mcp_sources, character, character_title, plan, checkpoint_busy: snapshot.checkpoint_busy === true,
          ...(snapshot.recovery ? { recovery_required: true, error: snapshot.recovery.reason } : {}) };
      } catch (error) {
        // Never replace a lost runtime reference with a new session: that would
        // silently lose history and could repeat effects after a restart.
        const session = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
        return { session, runs: [], draft, question_drafts, materials, methods, configuration, mcp_tools, mcp_sources, character, character_title, plan, recovery_required: true,
          error: (error as { code?: string }).code === "agent.session_unknown"
            ? "此会话的执行记录尚未恢复，不能把它当新任务重跑。原会话与草稿已保留。"
            : "此会话的执行记录暂时无法读取，不能将未知结果当作已完成。原会话与草稿已保留，请稍后重试。" };
      }
    }),
    route("coding.recovery", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚无可核对的运行记录");
      return api!.invoke(agent.inspectRecovery, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
    }),
    route("coding.recover-run", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚无可核对的运行记录");
      const expectedVersion = bodyOf(request).expected_version;
      if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error("核对版本已失效，请重新核对");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      return api!.invoke(agent.recoverRun, [session, { session_id: session.session_id, run_id: text(request.params.runId, "执行引用") }, expectedVersion]);
    }),
    route("coding.checkpoints", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) return { checkpoints: [] };
      return { checkpoints: await api!.invoke(agent.listCheckpoints, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]) };
    }),
    route("coding.prepare-rewind", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const intent = bodyOf(request).intent;
      const role = intent === "edit" ? "writer" : intent === "execute" ? "builder" : null;
      if (!role) throw new Error("回退会修改文件，请先选择修改文件或执行方式");
      return { review: await api!.invoke(agent.prepareRewind, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }, text(request.params.checkpointId, "检查点引用"), role]) };
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
      const materials = body.materials === undefined ? undefined : materialSelection(body.materials);
      const configuration = body.configuration === undefined ? undefined : nextConfiguration(body.configuration);
      const character = body.character === undefined ? undefined : characterSelection(body.character);
      if (configuration) context.services!.storage!.set(`configuration:${record.session_id}`, JSON.stringify(configuration));
      if (body.mcp_sources !== undefined) context.services!.storage!.set(`mcp-sources:${record.session_id}`,JSON.stringify(mcpSources(body.mcp_sources)));
      if (body.mcp_tools !== undefined) context.services!.storage!.set(`mcp:${record.session_id}`, JSON.stringify(mcpSelection(body.mcp_tools)));
      if (body.methods !== undefined) context.services!.storage!.set(`methods:${record.session_id}`, JSON.stringify(methodSelection(body.methods)));
      if (character !== undefined) context.services!.storage!.set(`character:${record.session_id}`, JSON.stringify(character));
      if (body.question_drafts !== undefined) {
        if (!body.question_drafts || typeof body.question_drafts !== "object" || Array.isArray(body.question_drafts)
          || Object.keys(body.question_drafts).length > 20) throw new Error("待答草稿格式无效");
        const encoded = JSON.stringify(body.question_drafts);
        if (encoded.length > 100_000) throw new Error("待答草稿超过长度限制");
        context.services!.storage!.set(`question-drafts:${record.session_id}`, encoded);
      }
      if (body.draft !== undefined) {
        if (typeof body.draft !== "string" || body.draft.length > 100_000) throw new Error("草稿格式无效或超过长度限制");
        context.services!.storage!.set(`draft:${record.session_id}`, body.draft);
      }
      const title = body.title === undefined ? undefined : text(body.title, "会话名称");
      if (materials) context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify(materials));
      return { session: title === undefined ? record : execution.sessions.rename(boardId, record.session_id, title, new Date().toISOString()) };
    }),
    route("coding.start-run", async (request, api, execution) => {
      const record = selected(request, execution);
      if (busy.has(record.session_id)) throw Object.assign(new Error("这个会话正在提交任务"), { code: "agent.session_busy" });
      busy.add(record.session_id);
      try {
        const body = bodyOf(request);
        const draft = body.plan_revision === undefined ? null : execution.sessions.plan(boardId, record.session_id);
        if (body.plan_revision !== undefined && (!draft?.confirmed || draft.revision !== body.plan_revision || body.intent !== "execute")) throw new Error("请查看并确认当前计划版本，再按此计划执行");
        const plan = draft ? confirmedPlan(context, record.session_id, draft.revision) : null;
        const task = plan ? plan.source.task : text(body.task, "任务", 100_000);
        if (plan && record.runtime_session_id) {
          const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
          const snapshot = await api!.invoke(agent.readSession, [session]);
          for (const ref of snapshot.runs) {
            const existing = await api!.invoke(agent.readRun, [session, ref]);
            if (existing.frozen.text_materials.some(item => item.source_artifact_id === plan.confirmed!.artifact_id && item.source_version === plan.confirmed!.version)) return { run: { ref: existing.ref, frozen: existing.frozen }, existing: true };
          }
          if (snapshot.recovery || snapshot.checkpoint_busy) throw new Error("请先核对中断或回退结果，再执行计划");
        }
        const role = body.intent === "collaborate" ? "coordinator" : body.intent === "plan" ? "planner" : body.intent === "review" ? "reviewer" : body.intent === "execute" ? "builder" : body.intent === "edit" ? "writer" : body.intent === "discuss" ? "reader" : null;
        if (!role) throw new Error("请选择讨论、规划、修改文件、执行或评审");
        const workspaces = await api!.invoke(projectsCapabilities.listWorkspaces, []);
        const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw new Error("请先为这个项目选择已授权的工作区目录");
        const directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
        if (plan && directory.canonical_path !== plan.source.workspace_path) throw new Error("计划属于原工作区，请选择原工作区或重新规划，不能在另一目录执行");
        const identity = { board_id: boardId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: request.actor_id };
        const models = await execution.models();
        const model = models.find((entry) => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
        if (!model) throw new Error("所选模型不可用，请在全局模型设置中检查配置");
        const roles = await api!.invoke(agent.availableRoles, [record.runtime_id, context.plugin_id]);
        const availability = roles.find((entry) => entry.role_id === role);
        if (!availability?.available) throw new Error(availability?.reason ?? "这个执行方式尚未接通");
        const character = body.character === undefined ? savedCharacter(context, record.session_id) : characterSelection(body.character);
        if (character) {
          if (!execution.characters) throw new Error("Character 消费尚未装配，请明确移除角色后执行");
          if (record.runtime_id !== "prologue") throw new Error("当前运行时尚未验证 Character 的工具限制，请使用 Prologue 或明确移除角色");
          execution.characters.resolve(character);
        }
        const goal = await resolveGoalContext(context, record.session_id, record.goal_id ?? null);
        const text_materials = resolveMaterials(context, materialSelection(body.materials ?? savedMaterials(context, record.session_id)));
        if (goal) text_materials.unshift(goal.material);
        if (plan) text_materials.unshift(planMaterial(plan));
        if (text_materials.length > 30) throw new Error("计划、目标与材料合计每轮最多 30 份，请移除一份材料后重试");
        const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
          : await api!.invoke(agent.createSession, [record.runtime_id, { ...identity, directory, title: record.title }]);
        if (!record.runtime_session_id) execution.sessions.setRuntimeSession(boardId, record.session_id, session.session_id, new Date().toISOString());
        const run = await api!.invoke(agent.startRun, [record.runtime_id, { ...identity, session, directory, task, role_id: role, text_materials, character,
          model_selection: { provider_id: model.provider_id, model_id: model.model_id }, skills: methodSelection(body.methods ?? []), mcp_tools: mcpSelection(body.mcp_tools ?? []), mcp_sources: mcpSources(body.mcp_sources ?? []) }]);
        if (!plan) context.services!.storage!.delete(`draft:${record.session_id}`);
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
      const control: AgentRunControl = body.kind === "answer" ? questionAnswer(body)
        : body.kind === "steer" ? { kind: "steer", text: text(body.text, "补充要求", 100_000) }
        : body.kind === "stop" ? { kind: "stop" } : body.kind === "pause" ? { kind: "pause" }
        : body.kind === "resume" ? { kind: "resume" } : (() => { throw new Error("不支持的控制动作"); })();
      await api!.invoke(agent.controlRun, [session, run, control]);
      return { accepted: true };
    }),
  ];
}
