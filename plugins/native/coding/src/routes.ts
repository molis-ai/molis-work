import { parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingReportSteps } from "./report-steps.js";
import { parseFilePath } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { codingWriterAssignments } from "./writers.js";
import { codingTaskBoardPlans, stepVerdictKey } from "./taskboard.js";
import { isDeepStrictEqual } from "node:util";
import { materialChoices, materialSelection, resolveMaterials, savedMaterials } from "./materials.js";
import type { PluginRouteBinding, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentSessionStatus, type AgentSubagentWorkspace, type AgentRunControl, type AgentRunView, type AgentSkillRef, type AgentMcpToolRef, type AgentMcpSourceRef, type AgentMcpServerInput } from "@molis-ai/molis-work-contracts/services/agent-host";
import { projectsCapabilities, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { CodingSessionRecord, CodingSessionStore } from "./store.js";
import type { CodingSessionState } from "./projection.js";
import type { AgentStepAmendment, AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CODING_REPORT_TYPE } from "./artifacts.js";
import { codingReportPreview, codingReportReference, createCodingExecutionReport, readCodingExecutionReport } from "./report.js";
import { goalContextCapabilities, goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { currentGoalContext, savedGoalContext, saveGoalContext, resolveGoalContext, runGoalContext } from "./goal-context.js";
import { codingContinuation } from "./continuation.js";
import { COMMIT_DRAFT_INSTRUCTIONS, COMMIT_DRAFT_ROUNDS, commitDraftMaterial, commitMessageFrom } from "./commit-draft.js";
import { codingHistoryDigest, historySummaryMaterial, HISTORY_SUMMARY_INSTRUCTIONS, nextHistoryMode, summaryDigest } from "./history-digest.js";
import { CodingCooperationStore, DELEGATION_STATE_LABEL, type CodingDelegation } from "./cooperation.js";
import { attachMentions, readWorkspaceFileCapability, symbolsIn, workspaceFileIndex } from "./mentions.js";
import { codingRunForDisplay, codingSessionUsage, SESSION_PAGE, summariesFingerprint, summaryCache } from "./session-window.js";
import { codingChangeSetReference, codingChangeSetPreview, readCodingChangeSet, createCodingChangeSet, codingChangeFeedback } from "./changeset.js";
import { CODING_CHANGESET_TYPE } from "./artifacts.js";
import { characterSelection, characterTitle, savedCharacter, savedCharacterSkills, characterSkillSelection, type CodingCharacterPorts } from "./characters.js";
import { confirmedPlan, executionSteps, parseCodingPlan, planFromRun, planMaterial, planReference } from "./plans.js";
import { CODING_PLAN_TYPE } from "./artifacts.js";
import { writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

export const DEFAULT_SESSION_TITLE = "新编码会话";
/** First meaningful line of a task, without Markdown decoration, short enough for a list row. */
export function codingSessionTitleFrom(task: string): string {
  const line = task.split("\n").map(value => value.replace(/^[#>*\-\s`]+/, "").replace(/[`*_]/g, "").trim()).find(Boolean) ?? DEFAULT_SESSION_TITLE;
  const chars = Array.from(line);
  return chars.length <= 36 ? line : `${chars.slice(0, 35).join("")}…`;
}

export interface CodingModelChoice { provider_id: string; model_id: string; label: string }
export interface CodingExecutionPorts {
  characters?: CodingCharacterPorts;
  sessions: CodingSessionStore;
  materialReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  reportReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  changeSetReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  planReferences?(): import("@molis-ai/molis-work-contracts/modules/artifacts").ArtifactReference[];
  goalTitle(goalId: string): string | undefined;
  ready(): Promise<void>;
  models(): Promise<readonly CodingModelChoice[]>;
}

function bodyOf(request: PluginRouteRequest): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return {};
  return request.body as Record<string, unknown>;
}
function savedActions(context: PluginStartContext, id: string) {
  const value = context.services?.storage?.get(`actions:${id}`);
  return typeof value === "string" ? parseExactActionReferences(JSON.parse(value)) : [];
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
  if (!["discuss", "plan", "collaborate", "parallel", "edit", "execute", "review"].includes(String(config.intent))) throw new Error("执行方式无效");
  for (const key of ["provider_id", "model_id", "workspace_id"]) {
    if (typeof config[key] !== "string" || (config[key] as string).length > 1000) throw new Error("模型或工作区配置无效");
  }
  return { intent: config.intent as string, provider_id: config.provider_id as string,
    model_id: config.model_id as string, workspace_id: config.workspace_id as string,
    ...(config.writer_assignments === undefined ? {} : { writer_assignments: codingWriterAssignments(config.writer_assignments) }) };
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
/** A person's plan change, checked before it reaches the Host. */
function stepAmendment(value: unknown): AgentStepAmendment {
  const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = (key: string) => { const found = entry[key]; if (typeof found !== "string" || !/^(step|user)-\d{1,3}$/.test(found)) throw new Error("步骤引用无效"); return found; };
  const words = (key: string, label: string, max: number) => { const found = entry[key]; if (typeof found !== "string" || !found.trim() || found.length > max) throw new Error(`请填写${label}（不超过 ${max} 字）`); return found.trim(); };
  switch (entry.kind) {
    case "skip": return { kind: "skip", node: id("node"), reason: words("reason", "跳过原因", 300) };
    case "insert": return { kind: "insert", after: id("after"), title: words("title", "新步骤", 120), acceptance: words("acceptance", "完成条件", 300), ...(entry.mine === true ? { mine: true as const } : {}) };
    case "unblock": return { kind: "unblock", node: id("node"), note: words("note", "你的决定", 500) };
    case "move": if (entry.direction !== "up" && entry.direction !== "down") throw new Error("移动方向无效"); return { kind: "move", node: id("node"), direction: entry.direction };
    case "assign": if (entry.to !== "me" && entry.to !== "session") throw new Error("改派对象无效"); return { kind: "assign", node: id("node"), to: entry.to };
    case "resolve": if (entry.state !== "succeeded" && entry.state !== "failed") throw new Error("结果无效"); return { kind: "resolve", node: id("node"), state: entry.state, note: words("note", "结果说明", 500) };
    default: throw new Error("不支持的计划调整");
  }
}

/** What the model is told, in the person's voice; the graph itself holds the authoritative record. */
function amendmentNote(amendment: AgentStepAmendment, board: AgentStepBoard): string {
  const name = (id: string) => `「${board.nodes.find(node => node.id === id)?.title ?? id}」`;
  const tail = "请先用 board-read 读取最新版本，按新的顺序继续；不要重做已完成的步骤。";
  switch (amendment.kind) {
    case "skip": return `我调整了本轮计划：跳过${name(amendment.node)}，原因：${amendment.reason}。${tail}`;
    case "insert": return amendment.mine
      ? `我调整了本轮计划：在${name(amendment.after)}之后插入新步骤「${amendment.title}」，完成条件：${amendment.acceptance}，由我自己处理。你不要报告这一步；等它完成后再继续依赖它的步骤。${tail}`
      : `我调整了本轮计划：在${name(amendment.after)}之后插入新步骤「${amendment.title}」，完成条件：${amendment.acceptance}。新步骤在任务图里的编号以 board-read 为准（user- 开头），轮到它时照常报告 running 与结果。${tail}`;
    case "unblock": return `关于受阻的${name(amendment.node)}，我的决定：${amendment.note}。请按这个决定继续。${tail}`;
    case "move": return `我调整了本轮计划顺序：把${name(amendment.node)}${amendment.direction === "up" ? "提前" : "推后"}一步。${tail}`;
    case "assign": return amendment.to === "me"
      ? `我把${name(amendment.node)}改派给我自己处理。你（以及原来负责它的子任务）不要再报告这一步；等它完成后再继续依赖它的步骤。${tail}`
      : `我把${name(amendment.node)}交回本会话，由你负责报告和完成。${tail}`;
    case "resolve": return `我处理的${name(amendment.node)}${amendment.state === "succeeded" ? "已经完成" : "失败了"}：${amendment.note}。${amendment.state === "succeeded" ? "依赖它的步骤现在可以继续。" : "请看依赖它的步骤怎么办，需要我决定就说明。"}${tail}`;
  }
}

function sessionState(run: Pick<AgentRunView, "phase">): CodingSessionState {
  if (run.phase === "completed") return "done";
  if (run.phase === "awaiting-input") return "waiting-answer";
  if (run.phase === "awaiting-review") return "waiting-approval";
  if (run.phase === "paused") return "paused";
  if (["failed", "stopped", "cancelled", "reconcile-required"].includes(run.phase)) return run.phase as CodingSessionState;
  return "running";
}

/** Coding owns intent and organization; execution is always obtained through Host capabilities. */
export function codingRoutes(context: PluginStartContext, ports?: CodingExecutionPorts): PluginRouteBinding[] {
  const boardId = context.board_id ?? "";
  const busy = new Set<string>();
  const summaries = summaryCache();
  const cooperation = () => new CodingCooperationStore(context.services!.storage!);
  const fileIndexes = new Map<string, { at: number; value: Promise<{ files: string[]; truncated: boolean }> }>();
  const sessionTitle = (execution: CodingExecutionPorts) => (id: string) => { try { return execution.sessions.get(boardId, id).title; } catch { return undefined; } };
  /** Every fixed output of this project's Coding sessions, with the session it came from. */
  const sessionOutputs = (execution: CodingExecutionPorts) => [...execution.reportReferences?.() ?? [], ...execution.changeSetReferences?.() ?? [], ...execution.planReferences?.() ?? []]
    .flatMap(reference => { const [, encoded] = reference.artifact_id.split(":"); return encoded ? [{ reference, session_id: decodeURIComponent(encoded) }] : []; });
  /** A delegation as either side sees it: the other session named, and its end noticed when that session is gone. */
  const delegationView = (execution: CodingExecutionPorts, delegation: CodingDelegation, actor: string) => {
    const title = sessionTitle(execution);
    if (delegation.to_session && !title(delegation.to_session) && !["completed", "rejected", "cancelled", "failed"].includes(delegation.state)) {
      try { delegation = cooperation().apply(delegation.delegation_id, undefined, "failed", "failed", actor, new Date().toISOString(), () => {}, "接收委派的会话已不存在"); } catch { /* a concurrent change wins; shown as read */ }
    }
    const other = (id: string | null) => { if (!id) return null; try { const record = execution.sessions.get(boardId, id); return { session_id: id, title: record.title, state: record.state, updated_at: record.updated_at }; } catch { return { session_id: id, title: null, state: null, updated_at: null }; } };
    return { ...delegation, state_label: DELEGATION_STATE_LABEL[delegation.state], from: other(delegation.from_session), to: other(delegation.to_session) };
  };
  const savedBudget = (sessionId: string): { tokens: number } | null => {
    const saved = context.services?.storage?.get(`budget:${sessionId}`);
    return typeof saved === "string" ? JSON.parse(saved) as { tokens: number } : null;
  };
  /** What the model calls that wrote this session's digests used: the session's cost, though not a round of it. */
  const savedDigestUsage = (sessionId: string): { calls: number; tokens: { input: number; output: number } } | null => {
    const saved = context.services?.storage?.get(`digest-usage:${sessionId}`);
    return typeof saved === "string" ? JSON.parse(saved) as { calls: number; tokens: { input: number; output: number } } : null;
  };
  /** Children of the rounds that coordinate them, with the person's saved verdicts. */
  const subagentGroups = async (api: NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>, sessionId: string, session: { runtime_id: string; session_id: string }, runs: readonly AgentRunView[]) => {
    const groups = [];
    for (const run of runs.filter(run => ["coordinator", "writers"].includes(run.frozen.role_id))) {
      try {
        const children = await api.invoke(agent.listSubagents, [session, run.ref]);
        groups.push({ run_id: run.ref.run_id, children: children.map(child => {
          const saved = context.services!.storage!.get(`subagent-verdict:${sessionId}:${run.ref.run_id}:${child.subagent_id}`);
          return { ...child, integration_available: run.frozen.role_id === "writers" && Boolean(run.frozen.subagent_workspaces?.some(workspace => workspace.directory.canonical_path === child.workspace_path)), verdict: typeof saved === "string" ? JSON.parse(saved) : null };
        }) });
      } catch (error) { groups.push({ run_id: run.ref.run_id, children: [], error: error instanceof Error ? error.message : "子任务状态不可读取" }); }
    }
    return groups;
  };
  // A round started here is followed until it settles, so the session's recorded state — which the directory and the
  // cross-project background list read — stays right while no page is open. One follower per session; a newer round
  // replaces it, and a Host that stops answering (the plugin closing) ends it.
  const following = new Map<string, symbol>();
  const follow = (api: NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>, execution: CodingExecutionPorts,
    sessionId: string, session: { runtime_id: string; session_id: string }, run: { session_id: string; run_id: string }) => {
    const token = Symbol(sessionId);
    following.set(sessionId, token);
    const current = () => following.get(sessionId) === token;
    void (async () => {
      let since: string | null = null;
      while (current()) {
        const waited: { version: string; view: AgentRunView } = await api.invoke(agent.waitRun, [session, run, since, 25_000]);
        if (!current()) return;
        const view = waited.view;
        since = waited.version;
        const record = execution.sessions.get(boardId, sessionId), next = sessionState(view);
        if (next !== record.state) execution.sessions.setState(boardId, sessionId, next, record.updated_at);
        if (["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes(view.phase)) break;
      }
    })().catch(() => undefined).finally(() => { if (current()) following.delete(sessionId); });
  };
  // The directory a page shows: every session's current state, with what a new round needs. Read by coding.state.
  let stateRead: Promise<unknown> | null = null, stateNext: Promise<unknown> | null = null;
  const readState = async (api: NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>, execution: CodingExecutionPorts) => {
    const runtimes = await api.invoke(agent.listRuntimes, []);
    // Every session's standing in one Host call per runtime, rather than one queued read per session.
    const records = execution.sessions.list(boardId);
    const statuses = new Map<string, AgentSessionStatus | { session_id: string; error: string }>();
    for (const runtimeId of new Set(records.filter(record => record.runtime_session_id).map(record => record.runtime_id))) {
      const ids = records.filter(record => record.runtime_id === runtimeId && record.runtime_session_id).map(record => record.runtime_session_id!);
      try { for (const status of await api.invoke(agent.readSessionStatuses, [runtimeId, ids])) statuses.set(`${runtimeId}:${status.session_id}`, status); }
      catch (error) { for (const id of ids) statuses.set(`${runtimeId}:${id}`, { session_id: id, error: error instanceof Error ? error.message : "会话暂不可读" }); }
    }
    const sessions = records.map(record => {
      let checkpointBusy = false;
      if (record.runtime_session_id) {
        const status = statuses.get(`${record.runtime_id}:${record.runtime_session_id}`);
        if (status && !("error" in status)) {
          checkpointBusy = status.checkpoint_busy;
          const next = status.recovery ? "reconcile-required" : status.latest_phase ? sessionState({ phase: status.latest_phase }) : "idle";
          if (next !== record.state) record = execution.sessions.setState(boardId, record.session_id, next, record.updated_at);
        } else if (record.state !== "reconcile-required") {
          // One unreadable ledger must not hide other sessions or make the
          // directory call completed work safe to continue.
          record = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
        }
      }
      return { ...record, checkpoint_busy: checkpointBusy, goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null };
    });
    const methods = runtimes.some(runtime=>runtime.runtime_id === "prologue") ? await api.invoke(agent.listSkills, ["prologue", context.plugin_id]) : [];
    const mcp = runtimes.some(runtime=>runtime.runtime_id === "prologue" && runtime.capabilities.mcp !== "unsupported") ? await api.invoke(agent.listMcp, ["prologue", context.plugin_id]) : [];
    return { sessions, methods, mcp, models: await execution.models(),
      // One current directory per project: the one chosen in project settings (and by Coding's own workspace choice)
      // is where new rounds run and what Files and Git show. Only when none was chosen does the catalog's pick stand.
      workspace: await api.invoke(projectSettingsCapabilities.browsingWorkspace, []) ?? await api.invoke(projectsCapabilities.readWorkspace, []),
      workspaces: await api.invoke(projectSettingsCapabilities.workspaces, []),
      runtimes: await Promise.all(runtimes.map(async (runtime) => ({ ...runtime,
        roles: await api.invoke(agent.availableRoles, [runtime.runtime_id, context.plugin_id]),
      }))),
    };
  };
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
  const reportRoute = (save: boolean) => route(save ? "coding.save-report" : "coding.read-report", async (request, api, execution) =>
    roundReport(selected(request, execution), text(request.params.runId, "执行引用"), api!, save, request.query?.fixed === "1"));
  /** A round's report: the fixed version when there is one; built from the round and, when asked, fixed now. */
  const roundReport = async (record: CodingSessionRecord, runId: string, api: NonNullable<NonNullable<PluginStartContext["services"]>["capabilities"]>, save: boolean, fixedOnly = false) => {
    const artifacts = context.services!.artifacts;
    const existing = readCodingExecutionReport(artifacts, record.session_id, runId);
    if (existing) return existing;
    if (fixedOnly) throw new Error("原固定报告当前不可读，不能用执行中的新信息重新拼接替代");
    if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
    const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
    const snapshot = await api.invoke(agent.readSession, [session]);
    const ref = snapshot.runs.find(entry => entry.run_id === runId);
    if (!ref) throw new Error("这轮执行不属于当前会话");
    const run = await api.invoke(agent.readRun, [session, ref]);
    if (!isTerminalAgentPhase(run.phase)) throw new Error("这一轮尚未结束或仍需核对结果，暂不能保存报告");
    const commands = await Promise.all((run.command_outputs ?? []).map(async command => {
      try {
        const output = await api.invoke(agent.readCommandOutput, [session, { run_id: runId, call_id: command.call_id }]);
        return { call_id: command.call_id, output };
      } catch { return { call_id: command.call_id, output: null }; }
    }));
    // The round number keeps two fixed reports of one session apart wherever they are listed.
    const report = createCodingExecutionReport({ session_id: record.session_id, runtime_id: record.runtime_id, title: `${record.title} · 第 ${snapshot.runs.indexOf(ref) + 1} 轮`, run, commands, steps: codingReportSteps(context, record.session_id, run), ...runGoalContext(context, run) });
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
  };
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
    route("coding.writer-directories", async (request, api) => ({ directories: await api!.invoke(writerDirectoryCapabilities.list, { workspace_id: text(request.params.workspaceId, "主工作区") }) })),
    route("coding.prepare-writer-directory", async (request, api) => api!.invoke(writerDirectoryCapabilities.prepare, { workspace_id: text(request.params.workspaceId, "主工作区"), operation_id: text(bodyOf(request).operation_id, "操作标识", 80) })),
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
        metadata: { title: `${record.title} · 第 ${snapshot.runs.indexOf(ref) + 1} 轮固定变更`, session_id: record.session_id, run_id: runId } });
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
      return { materials: materialChoices(context, savedMaterials(context, record.session_id), execution.materialReferences?.(), sessionOutputs(execution), sessionTitle(execution), record.session_id) };
    }),
    route("coding.actions", async (request, api, execution) => {
      const record = selected(request, execution), runtimes = await api!.invoke(agent.listRuntimes, []);
      const tools = runtimes.some(runtime => runtime.runtime_id === record.runtime_id && runtime.supports_action_tools)
        ? await api!.invoke(agent.listActions, [record.runtime_id, context.plugin_id]) : [];
      const characterRef = savedCharacter(context, record.session_id);
      let character: ReturnType<NonNullable<CodingExecutionPorts["characters"]>["resolve"]> | undefined;
      let character_error: string | undefined;
      try { if (characterRef) character = execution.characters?.resolve(characterRef); }
      catch (error) { character_error = error instanceof Error ? error.message : "原角色不可用"; }
      if (characterRef && !character && !character_error) character_error = "原角色不可用";
      return { actions: tools.map(view => ({ ...view, availability: character_error
        ? { available: false, code: "agent.character_unavailable", reason: character_error }
        : character?.action_tools && !character.action_tools.some(ref => ref.capability_id === view.capability_id && ref.version === view.version && ref.provider_id === view.provider.provider_id)
          ? { available: false, code: "agent.character_scope", reason: "当前 Character 未开放此能力" } : view.availability })), selected: savedActions(context, record.session_id) };
    }),
    route("coding.state", async (_request, api, execution) => {
      // Every open page polls this, and each read asks the Host about every session, one call at a time in the
      // project's queue. However many pages ask, one read runs and at most one waits behind it; a request that arrives
      // mid-read gets the next one, so it still sees what was just changed. Each caller gets its own copy.
      const run = () => { stateRead = readState(api!, execution).finally(() => { stateRead = null; }); return stateRead; };
      if (!stateRead) return structuredClone(await run());
      stateNext ??= stateRead.catch(() => undefined).then(() => { stateNext = null; return stateRead ?? run(); });
      return structuredClone(await stateNext);
    }),
    route("coding.save-mcp", async (request, api) => {
      const body = bodyOf(request);
      const input = { id: body.id, expected_version: body.expected_version, label: body.label, enabled: body.enabled, timeout_ms: body.timeout_ms,
        transport: body.transport, executable: body.executable, argv: body.argv, endpoint: body.endpoint, auth: body.auth } as AgentMcpServerInput;
      if (input.transport === "stdio") {
        const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
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
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
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
        title: text(body.title ?? DEFAULT_SESSION_TITLE, "会话名称"), runtime_id: "prologue", at: new Date().toISOString() });
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
        // The planning rounds just before this one, back to the round that started planning, give the plan its task.
        const earlier: AgentRunView[] = [];
        for (let at = snapshot.runs.indexOf(ref) - 1; at >= 0; at--) {
          const view = await api!.invoke(agent.readRun, [session, snapshot.runs[at]!]);
          if (view.frozen.role_id !== "planner") break;
          earlier.unshift(view);
        }
        proposal = planFromRun(record.session_id, await api!.invoke(agent.readRun, [session, ref]), earlier);
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
    ...[false, true].map(prepare => route(prepare ? "coding.prepare-integration" : "coding.read-integration", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id || record.runtime_id !== "prologue") throw new Error("此会话没有可整合的原子任务");
      const source = { session_id: record.runtime_session_id, run_id: text(request.params.runId, "原执行"), subagent_id: text(request.params.childId, "原子任务") };
      if (!prepare) return api!.invoke(writerIntegrationCapabilities.read, source);
      const body = bodyOf(request);
      if (!Array.isArray(body.files)) throw new Error("请选择原成果文件");
      const files = body.files.map(file => ({ path: parseFilePath(file.path), revision: text(file.revision, "审查版本"),
        ...(typeof file.resolution === "string" ? { resolution: file.resolution.length <= 262_144 ? file.resolution : (() => { throw new Error("合并结果过长"); })() } : {}) }));
      return api!.invoke(writerIntegrationCapabilities.prepare, { ...source, operation_id: text(body.operation_id, "操作标识", 80), files });
    })),
    route("coding.evaluate-step", async (request, api, execution) => {
      const record = selected(request, execution), body = bodyOf(request);
      if (!record.runtime_session_id) throw new Error("此会话没有执行记录");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const ref = snapshot.runs.find(run => run.run_id === request.params.runId);
      if (!ref || snapshot.recovery || snapshot.checkpoint_busy) throw new Error("请先核对原执行及中断结果");
      const run = await api!.invoke(agent.readRun, [session, ref]);
      if (!isTerminalAgentPhase(run.phase)) throw new Error("请等待本轮结束并核对原步骤回报后评价");
      const entry = codingTaskBoardPlans(context, record.session_id, [run]).find(entry => entry.board);
      const board = entry?.board, node = board?.nodes.find(node => node.id === request.params.stepId);
      if (!board || !node || entry?.board_error || !node.reports.length) throw new Error("原步骤尚无可评价的回报");
      if (body.board_id !== board.board_id || body.board_version !== board.version) throw new Error("步骤回报已变化，请重新读取后评价");
      if (!["accepted", "needs-work"].includes(String(body.action)) || body.action === "accepted" && node.state !== "succeeded") throw new Error("只有模型报告成功的步骤可以验收通过；其他结果可要求返工");
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      if (notes.length > 4000 || body.action === "needs-work" && !notes) throw new Error("返工需写明原因，说明最多 4000 字符");
      const key = stepVerdictKey(record.session_id, ref.run_id, node.id), saved = context.services!.storage!.get(key);
      const revision = typeof saved === "string" ? JSON.parse(saved).revision : 0;
      if (body.expected_revision !== revision) throw new Error("评价已变化，请重新查看后提交");
      const verdict = { revision: revision + 1, status: body.action, notes, board_id: board.board_id, board_version: board.version, actor: request.actor_id, at: new Date().toISOString() };
      context.services!.storage!.set(key, JSON.stringify(verdict));
      return { verdict };
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
      return { characters: execution.characters?.list() ?? [], selected: savedCharacter(context, record.session_id), character_skill_ids: savedCharacterSkills(context, record.session_id), runtime_id: record.runtime_id };
    }),
    route("coding.read-session", async (request, api, execution) => {
      const record = selected(request, execution);
      const character = savedCharacter(context, record.session_id), character_title = characterTitle(context, character);
      const plan = execution.sessions.plan(boardId, record.session_id);
      const draft = context.services?.storage?.get(`draft:${record.session_id}`) ?? "";
      const savedConfiguration = context.services?.storage?.get(`configuration:${record.session_id}`);
      const configuration = typeof savedConfiguration === "string" ? nextConfiguration(JSON.parse(savedConfiguration)) : null;
      const savedMcp = context.services?.storage?.get(`mcp:${record.session_id}`);
      const action_tools = savedActions(context, record.session_id);
      const mcp_tools = typeof savedMcp === "string" ? mcpSelection(JSON.parse(savedMcp)) : [];
      const savedSources = context.services?.storage?.get(`mcp-sources:${record.session_id}`);
      const mcp_sources = typeof savedSources === "string" ? mcpSources(JSON.parse(savedSources)) : [];
      const materials = savedMaterials(context, record.session_id);
      const savedMethods = context.services?.storage?.get(`methods:${record.session_id}`);
      const methods = typeof savedMethods === "string" ? methodSelection(JSON.parse(savedMethods)) : [];
      const questionDrafts = context.services?.storage?.get(`question-drafts:${record.session_id}`);
      const question_drafts = typeof questionDrafts === "string" ? JSON.parse(questionDrafts) : {};
      if (!record.runtime_session_id) return { session: { ...record, goal_title: record.goal_id ? execution.goalTitle(record.goal_id) ?? null : null }, runs: [], draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      try {
        const snapshot = await api!.invoke(agent.readSession, [session]);
        // With a window, a refresh costs the same however long the session is: the latest rounds in full, the earlier
        // ones as summaries that are only resent when they changed. Without one, every round is read, as before.
        const size = request.query?.window === undefined ? undefined : Number(request.query.window);
        if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > 50)) throw new Error("一次读取的轮次必须为 1–50");
        const offset = size === undefined ? 0 : Math.max(0, snapshot.runs.length - size);
        const runs = await Promise.all(snapshot.runs.slice(offset).map((run) => api!.invoke(agent.readRun, [session, run])));
        // A round the page already holds unchanged travels as its fingerprint alone.
        const known = new Set(String(request.query?.known ?? "").split(",").filter(Boolean));
        const shown = size === undefined ? runs : runs.map(run => { const display = codingRunForDisplay(run); return known.has(display.fingerprint) ? { ref: display.ref, fingerprint: display.fingerprint, unchanged: true } : display; });
        const earlier = offset ? await summaries.read(session.session_id, snapshot.runs.slice(0, offset), ref => api!.invoke(agent.readRun, [session, ref])) : [];
        const earlierFingerprint = summariesFingerprint(earlier);
        const last = runs.at(-1);
        const state = snapshot.recovery ? "reconcile-required" : last ? sessionState(last) : "idle";
        const updated = state === record.state ? record : execution.sessions.setState(boardId, record.session_id, state, record.updated_at);
        const compactRequested = context.services?.storage?.get(`compact-next:${record.session_id}`) === "1";
        return { session: { ...updated, checkpoint_busy: snapshot.checkpoint_busy === true, goal_title: updated.goal_id ? execution.goalTitle(updated.goal_id) ?? null : null }, runs: shown, subagents: await subagentGroups(api!, record.session_id, session, runs), taskboard_plans: codingTaskBoardPlans(context, record.session_id, runs), draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan, checkpoint_busy: snapshot.checkpoint_busy === true,
          run_count: snapshot.runs.length, runs_offset: offset,
          ...(size === undefined ? {} : { earlier_fingerprint: earlierFingerprint, ...(request.query?.earlier === earlierFingerprint ? {} : { earlier }) }),
          usage_total: codingSessionUsage([...earlier.map(summary => summary.usage), ...runs.map(run => run.usage)], savedDigestUsage(record.session_id)),
          next_history: nextHistoryMode(last, compactRequested), compact_requested: compactRequested, budget: savedBudget(record.session_id),
          ...(snapshot.recovery ? { recovery_required: true, error: snapshot.recovery.reason } : {}) };
      } catch (error) {
        // Never replace a lost runtime reference with a new session: that would
        // silently lose history and could repeat effects after a restart.
        const session = execution.sessions.setState(boardId, record.session_id, "reconcile-required", record.updated_at);
        return { session, runs: [], draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan, recovery_required: true,
          error: (error as { code?: string }).code === "agent.session_unknown"
            ? "此会话的执行记录尚未恢复，不能把它当新任务重跑。原会话与草稿已保留。"
            : "此会话的执行记录暂时无法读取，不能将未知结果当作已完成。原会话与草稿已保留，请稍后重试。" };
      }
    }),
    // The files a person can name with @: read through the Host's read-only capability, briefly remembered.
    route("coding.files", async (request, api, execution) => {
      selected(request, execution);
      const workspaceId = text(request.query?.workspace_id, "工作区", 200);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw new Error("请先为这个项目选择已授权的工作区目录");
      const held = fileIndexes.get(workspaceId);
      if (held && Date.now() - held.at < 30_000) return await held.value;
      const value = workspaceFileIndex(query => api!.invoke(readWorkspaceFileCapability, query), workspaceId);
      fileIndexes.set(workspaceId, { at: Date.now(), value });
      try { return await value; } catch (error) { fileIndexes.delete(workspaceId); throw error; }
    }),
    // The definitions in one file a person can name as "@path#name", read through the same read-only capability.
    route("coding.symbols", async (request, api, execution) => {
      selected(request, execution);
      const workspaceId = text(request.query?.workspace_id, "工作区", 200), path = text(request.query?.path, "文件", 1000);
      const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
      if (!workspaces.some(entry => entry.workspace_id === workspaceId && entry.realpath_verified)) throw new Error("请先为这个项目选择已授权的工作区目录");
      if (path.split("/").includes("..")) throw new Error("文件路径无效");
      const file = await api!.invoke(readWorkspaceFileCapability, { workspace_id: workspaceId, path: path.split("/").filter(Boolean), kind: "text" });
      return { path, symbols: file.outcome === "text" ? symbolsIn(path, file.text) : [], ...(file.outcome === "text" ? {} : { unreadable: file.outcome }) };
    }),
    // A live round, as it happens: answers as soon as it changes from what the page holds (or after the wait).
    route("coding.live", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const since = typeof request.query?.since === "string" && request.query.since ? request.query.since : null;
      const wait = Math.min(Math.max(Number(request.query?.timeout ?? 20_000) || 0, 0), 25_000);
      const result = await api!.invoke(agent.waitRun, [session, { session_id: session.session_id, run_id: text(request.params.runId, "执行引用", 200) }, since, wait]);
      return { version: result.version, runs: [codingRunForDisplay(result.view)] };
    }),
    // Scrolling back reads earlier rounds a page at a time, with what the timeline shows beside them.
    route("coding.read-runs", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) return { runs: [], runs_offset: 0, subagents: [], taskboard_plans: [] };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const before = Number(request.query?.before ?? snapshot.runs.length), limit = Number(request.query?.limit ?? SESSION_PAGE);
      if (!Number.isSafeInteger(before) || before < 0 || before > snapshot.runs.length || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error("读取范围无效");
      const offset = Math.max(0, before - limit);
      const runs = await Promise.all(snapshot.runs.slice(offset, before).map(ref => api!.invoke(agent.readRun, [session, ref])));
      return { runs: runs.map(codingRunForDisplay), runs_offset: offset, run_count: snapshot.runs.length, subagents: await subagentGroups(api!, record.session_id, session, runs), taskboard_plans: codingTaskBoardPlans(context, record.session_id, runs) };
    }),
    // The whole session's TaskBoard: rounds that ran a confirmed plan or dispatched subagents are read in full, the rest
    // come as summaries, since the board shows none of their detail.
    route("coding.taskboard", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) return { runs: [], subagents: [], taskboard_plans: [] };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const light = await summaries.read(session.session_id, snapshot.runs, ref => api!.invoke(agent.readRun, [session, ref]));
      const prefix = `coding-plan:${record.session_id}:`;
      const tasked = snapshot.runs.filter((_, index) => light[index]!.frozen.text_materials.some(material => material.source_artifact_id.startsWith(prefix))
        || ["coordinator", "writers"].includes(light[index]!.frozen.role_id));
      const full = await Promise.all(tasked.map(ref => api!.invoke(agent.readRun, [session, ref])));
      return { runs: light, subagents: await subagentGroups(api!, record.session_id, session, full), taskboard_plans: codingTaskBoardPlans(context, record.session_id, full) };
    }),
    // Sessions working together: what this session delegated, what it was created for, and the sessions they touch.
    route("coding.delegations", async (request, _api, execution) => {
      const record = selected(request, execution);
      const { outgoing, incoming } = cooperation().forSession(record.session_id);
      const referenced = [...new Set(savedMaterials(context, record.session_id).flatMap(ref => /^coding-(report|changeset|plan):/.test(ref.artifact_id) ? [decodeURIComponent(ref.artifact_id.split(":")[1]!)] : []))]
        .filter(id => id !== record.session_id);
      const outputsBySession = new Map<string, Array<{ reference: { artifact_id: string; version: number }; kind: string }>>();
      for (const output of sessionOutputs(execution)) (outputsBySession.get(output.session_id) ?? outputsBySession.set(output.session_id, []).get(output.session_id)!).push({ reference: output.reference, kind: output.reference.artifact_id.split(":")[0]!.replace("coding-", "") });
      const related = [...new Set([...outgoing.map(item => item.to_session), incoming?.from_session, ...referenced].filter((id): id is string => Boolean(id)))].map(id => {
        let session: { title: string; state: string; updated_at: string } | null = null;
        try { session = execution.sessions.get(boardId, id); } catch { session = null; }
        const relation = [outgoing.some(item => item.to_session === id) ? "你委派给它" : "", incoming?.from_session === id ? "它委派给你" : "", referenced.includes(id) ? "你引用了它的成果" : ""].filter(Boolean);
        return { session_id: id, title: session?.title ?? null, state: session?.state ?? null, updated_at: session?.updated_at ?? null, relation, outputs: (outputsBySession.get(id) ?? []).slice(-3).reverse() };
      });
      return { outgoing: outgoing.map(item => delegationView(execution, item, request.actor_id)), incoming: incoming ? delegationView(execution, incoming, request.actor_id) : null, related };
    }),
    // Delegating creates a session with the task as its draft; nothing runs until that session's person sends it.
    route("coding.delegate", async (request, _api, execution) => {
      const record = selected(request, execution), body = bodyOf(request);
      const task = text(body.task, "委派的任务", 20_000), title = text(body.title ?? codingSessionTitleFrom(task), "委派标题", 80);
      const materials = materialSelection(body.materials ?? []);
      resolveMaterials(context, materials, sessionTitle(execution));
      const at = new Date().toISOString(), store = cooperation();
      const delegation = store.create({ from_session: record.session_id, title, task, materials, actor: request.actor_id, at });
      const target = execution.sessions.create({ board_id: boardId, session_id: crypto.randomUUID(), title: "委派：" + title, runtime_id: "prologue", at });
      context.services!.storage!.set(`draft:${target.session_id}`, task);
      if (materials.length) context.services!.storage!.set(`materials:${target.session_id}`, JSON.stringify(materials));
      // The work happens where the asking session works, with its model, unless the receiving person changes them.
      const configuration = context.services!.storage!.get(`configuration:${record.session_id}`);
      if (typeof configuration === "string") context.services!.storage!.set(`configuration:${target.session_id}`, configuration);
      store.bindTarget(delegation.delegation_id, target.session_id);
      const delivered = store.apply(delegation.delegation_id, delegation.revision, "delivered", "delivered", request.actor_id, at, item => { item.to_session = target.session_id; });
      return { delegation: delegationView(execution, delivered, request.actor_id), session: target };
    }),
    route("coding.delegation-action", async (request, _api, execution) => {
      const record = selected(request, execution), body = bodyOf(request), store = cooperation();
      const delegation = store.get(text(request.params.delegationId, "委派")), at = new Date().toISOString();
      if (!delegation) throw new Error("找不到这个委派");
      const revision = typeof body.expected_revision === "number" ? body.expected_revision : undefined;
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length > 2000) throw new Error("说明最多 2000 字");
      let next: CodingDelegation;
      if (body.action === "accept" || body.action === "reject") {
        if (delegation.to_session !== record.session_id) throw new Error("只有接收委派的会话可以接受或拒绝");
        if (body.action === "reject" && !reason) throw new Error("拒绝委派时请写明原因");
        next = body.action === "accept" ? store.apply(delegation.delegation_id, revision, "accepted", "accepted", request.actor_id, at)
          : store.apply(delegation.delegation_id, revision, "rejected", "rejected", request.actor_id, at, () => {}, reason);
      } else if (body.action === "cancel") {
        if (delegation.from_session !== record.session_id) throw new Error("只有发起委派的会话可以取消");
        next = store.apply(delegation.delegation_id, revision, "cancelled", "cancelled", request.actor_id, at, () => {}, reason || undefined);
      } else throw new Error("不支持的协作操作");
      return { delegation: delegationView(execution, next, request.actor_id) };
    }),
    // Handing a finished round back: its report is fixed now if it was not yet; a fixed change must already be saved.
    route("coding.delegation-deliver", async (request, api, execution) => {
      const record = selected(request, execution), body = bodyOf(request), store = cooperation();
      const delegation = store.get(text(request.params.delegationId, "委派"));
      if (!delegation || delegation.to_session !== record.session_id) throw new Error("只有接收委派的会话可以交付成果");
      const runId = text(body.run_id, "交付的轮次", 200), note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";
      const kind: "report" | "changeset" = body.kind === "changeset" ? "changeset" : body.kind === "report" ? "report" : (() => { throw new Error("请选择交付报告或固定变更"); })();
      let artifact, title;
      if (kind === "report") { const saved = await roundReport(record, runId, api!, true); if (!saved.reference) throw new Error("这一轮的报告没有固定下来"); artifact = saved.reference; title = saved.report.title; }
      else { const saved = readCodingChangeSet(context.services!.artifacts, record.session_id, runId); if (!saved) throw new Error("请先固定这一轮的变更，再交付"); artifact = saved.reference; title = "固定变更"; }
      const at = new Date().toISOString(), delivery = { delivery_id: crypto.randomUUID(), kind, artifact, run_id: runId, title, note, state: "sent" as const, sent_at: at };
      if (["received", "delivered", "accepted"].includes(delegation.state)) throw new Error("请先在这个会话里执行一轮，再交付成果");
      const next = store.apply(delegation.delegation_id, typeof body.expected_revision === "number" ? body.expected_revision : undefined, "delivery-sent", null, request.actor_id, at,
        item => { item.deliveries.push(delivery); }, note || undefined, artifact);
      return { delegation: delegationView(execution, next, request.actor_id) };
    }),
    // The asking session decides: taking a delivery completes the delegation and attaches it to the next round.
    route("coding.delegation-decide", async (request, _api, execution) => {
      const record = selected(request, execution), body = bodyOf(request), store = cooperation();
      const delegation = store.get(text(request.params.delegationId, "委派"));
      if (!delegation || delegation.from_session !== record.session_id) throw new Error("只有发起委派的会话可以决定是否收下交付");
      const delivery = delegation.deliveries.find(item => item.delivery_id === request.params.deliveryId);
      if (!delivery) throw new Error("找不到这次交付");
      if (delivery.state !== "sent") throw new Error("这次交付已经处理过");
      const reason = typeof body.reason === "string" ? body.reason.trim() : "", at = new Date().toISOString();
      const revision = typeof body.expected_revision === "number" ? body.expected_revision : undefined;
      if (body.decision === "reject") {
        if (!reason) throw new Error("不收下交付时请写明原因，对方会看到");
        const next = store.apply(delegation.delegation_id, revision, "delivery-rejected", null, request.actor_id, at, item => {
          Object.assign(item.deliveries.find(entry => entry.delivery_id === delivery.delivery_id)!, { state: "rejected", reason, decided_at: at, decided_by: request.actor_id }); }, reason, delivery.artifact);
        return { delegation: delegationView(execution, next, request.actor_id) };
      }
      if (body.decision !== "accept") throw new Error("请选择收下或不收下");
      resolveMaterials(context, [delivery.artifact], sessionTitle(execution));
      const next = store.apply(delegation.delegation_id, revision, "delivery-accepted", "completed", request.actor_id, at, item => {
        Object.assign(item.deliveries.find(entry => entry.delivery_id === delivery.delivery_id)!, { state: "accepted", decided_at: at, decided_by: request.actor_id }); }, undefined, delivery.artifact);
      const saved = savedMaterials(context, record.session_id);
      if (!saved.some(ref => ref.artifact_id === delivery.artifact.artifact_id && ref.version === delivery.artifact.version) && saved.length < 30)
        context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify([...saved, delivery.artifact]));
      return { delegation: delegationView(execution, next, request.actor_id), attached: true };
    }),
    // Like /compact: the next round starts from the digest of earlier rounds instead of replaying them verbatim.
    route("coding.compact-next", async (request, _api, execution) => {
      const record = selected(request, execution);
      const on = bodyOf(request).on;
      if (typeof on !== "boolean") throw new Error("请说明是否在下一轮整理上下文");
      if (on && !record.runtime_session_id) throw new Error("这个会话还没有执行过，没有可整理的上下文");
      if (on) context.services!.storage!.set(`compact-next:${record.session_id}`, "1");
      else context.services!.storage!.delete(`compact-next:${record.session_id}`);
      return { compact_requested: on };
    }),
    route("coding.recovery", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚无可核对的运行记录");
      return api!.invoke(agent.inspectRecovery, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
    }),
    route("coding.plan-amendments", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const ref = snapshot.runs.find(entry => entry.run_id === request.params.runId);
      if (!ref) throw new Error("这轮执行不属于当前会话");
      const body = bodyOf(request), amendment = stepAmendment(body.amendment), version = body.expected_version;
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw new Error("计划图版本已失效，请刷新后再调整");
      const before = (await api!.invoke(agent.readRun, [session, ref])).step_board;
      const board = await api!.invoke(agent.amendStepBoard, [session, ref, amendment, version]);
      // The live round learns of the change through the same supplemental channel a person already uses.
      const note = amendmentNote(amendment, before ?? board);
      try { await api!.invoke(agent.controlRun, [session, ref, { kind: "steer", text: note }]); return { board, steered: true }; }
      catch (error) { return { board, steered: false, steer_error: error instanceof Error ? error.message : String(error) }; }
    }),
    route("coding.continuation", async (request, api, execution) => {
      const record = selected(request, execution);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      if (snapshot.recovery || snapshot.checkpoint_busy) throw new Error("请先核对中断或回退结果，再从断点继续");
      const index = snapshot.runs.findIndex(ref => ref.run_id === request.params.runId);
      if (index < 0) throw new Error("这轮执行不属于当前会话");
      if (index !== snapshot.runs.length - 1) throw new Error("只能从最新一轮继续");
      const ref = snapshot.runs[index]!, run = await api!.invoke(agent.readRun, [session, ref]);
      const reviews = await api!.invoke(agent.readRunReviews, [session, ref]);
      // A receipt that cannot be read is reported as such, never skipped: the continuation must not overstate what ran.
      const commands = await Promise.all((run.command_outputs ?? []).map(async command => {
        try { return { call_id: command.call_id, output: await api!.invoke(agent.readCommandOutput, [session, { run_id: ref.run_id, call_id: command.call_id }]) }; }
        catch { return { call_id: command.call_id, output: null }; }
      }));
      const plan = run.step_board && !run.step_board.terminal ? codingTaskBoardPlans(context, record.session_id, [run]).find(entry => entry.board && entry.revision) : undefined;
      // A round that dispatched subtasks hands them on as facts; unreadable is said, never read as "none". A plan's
      // subtasks count from every round of that plan, newest first: one finished two rounds ago must not be sent again.
      const planRuns = plan && run.step_board
        ? (await Promise.all(snapshot.runs.map(each => each.run_id === ref.run_id ? run : api!.invoke(agent.readRun, [session, each]))))
          .filter(each => each.step_board?.board_id === run.step_board!.board_id).reverse()
        : [run];
      const withChildren = planRuns.filter(each => ["coordinator", "writers"].includes(each.frozen.role_id));
      const subagents = withChildren.length
        ? await Promise.all(withChildren.map(each => api!.invoke(agent.listSubagents, [session, each.ref]))).then(lists => lists.flat(), () => null) : [];
      const next = codingContinuation({ number: index + 1, run, reviews, commands, plan_unfinished: Boolean(plan), subagents });
      // A plan run in parallel goes on in parallel; any other plan continues as one execution round.
      return plan ? { ...next, intent: next.intent === "parallel" ? "parallel" : "execute", plan_revision: plan.revision, continue_step_board_of: run.ref.run_id } : next;
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
    route("coding.update-session", async (request, api, execution) => {
      const record = selected(request, execution);
      const body = bodyOf(request);
      if (body.archive === true) {
        if (busy.has(record.session_id)) throw Object.assign(new Error("会话正在提交任务，请稍后归档"), { code: "agent.session_busy" });
        if (record.runtime_session_id) {
          const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
          const snapshot = await api!.invoke(agent.readSession, [session]);
          if (snapshot.checkpoint_busy || snapshot.recovery || snapshot.latest_run && !isTerminalAgentPhase(snapshot.latest_run.phase)) {
            throw Object.assign(new Error("请先完成或停止当前执行，再归档会话"), { code: "agent.session_busy" });
          }
        }
        if (busy.has(record.session_id)) throw Object.assign(new Error("会话正在提交任务，请稍后归档"), { code: "agent.session_busy" });
        return { session: execution.sessions.archive(boardId, record.session_id, new Date().toISOString()) };
      }
      if (record.archived) throw new Error("会话已归档，不能再修改");
      const materials = body.materials === undefined ? undefined : materialSelection(body.materials);
      const configuration = body.configuration === undefined ? undefined : nextConfiguration(body.configuration);
      const character = body.character === undefined ? undefined : characterSelection(body.character);
      const characterSkills = body.character_skill_ids === undefined ? undefined : characterSkillSelection(body.character_skill_ids);
      const actionTools = body.action_tools === undefined ? undefined : parseExactActionReferences(body.action_tools);
      if (actionTools !== undefined) context.services!.storage!.set(`actions:${record.session_id}`, JSON.stringify(actionTools));
      if (configuration) context.services!.storage!.set(`configuration:${record.session_id}`, JSON.stringify(configuration));
      if (body.mcp_sources !== undefined) context.services!.storage!.set(`mcp-sources:${record.session_id}`,JSON.stringify(mcpSources(body.mcp_sources)));
      if (body.mcp_tools !== undefined) context.services!.storage!.set(`mcp:${record.session_id}`, JSON.stringify(mcpSelection(body.mcp_tools)));
      if (body.methods !== undefined) context.services!.storage!.set(`methods:${record.session_id}`, JSON.stringify(methodSelection(body.methods)));
      if (character !== undefined) context.services!.storage!.set(`character:${record.session_id}`, JSON.stringify(character));
      if (characterSkills !== undefined) context.services!.storage!.set(`character-skills:${record.session_id}`, JSON.stringify(characterSkills));
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
      // The person's budget for this session: reaching it is reported, never enforced (the person's choice).
      if (body.budget !== undefined) {
        const tokens = (body.budget as { tokens?: unknown } | null)?.tokens;
        if (body.budget === null || tokens === null) context.services!.storage!.delete(`budget:${record.session_id}`);
        else if (typeof tokens !== "number" || !Number.isSafeInteger(tokens) || tokens < 1_000 || tokens > 10_000_000_000) throw new Error("预算须为 1000 到 100 亿之间的 token 数");
        else context.services!.storage!.set(`budget:${record.session_id}`, JSON.stringify({ tokens }));
      }
      const title = body.title === undefined ? undefined : text(body.title, "会话名称");
      if (materials) context.services!.storage!.set(`materials:${record.session_id}`, JSON.stringify(materials));
      return { session: title === undefined ? record : execution.sessions.rename(boardId, record.session_id, title, new Date().toISOString()) };
    }),
    route("coding.start-run", async (request, api, execution) => {
      const record = selected(request, execution);
      if (record.archived) throw new Error("会话已归档，不能再运行");
      if (busy.has(record.session_id)) throw Object.assign(new Error("这个会话正在提交任务"), { code: "agent.session_busy" });
      busy.add(record.session_id);
      try {
        const body = bodyOf(request);
        // Continuing an earlier round's unfinished graph uses that round's own confirmed revision, whatever the draft is now.
        const continueOf = body.continue_step_board_of === undefined ? undefined : text(body.continue_step_board_of, "被继续的轮次", 200);
        if (continueOf !== undefined && (typeof body.plan_revision !== "number" || !Number.isSafeInteger(body.plan_revision) || !["execute", "parallel"].includes(String(body.intent)))) throw new Error("继续计划需要原计划修订，并以执行或并行写入方式开始");
        const draft = body.plan_revision === undefined || continueOf !== undefined ? null : execution.sessions.plan(boardId, record.session_id);
        if (continueOf === undefined && body.plan_revision !== undefined && (!draft?.confirmed || draft.revision !== body.plan_revision || !["execute", "parallel"].includes(String(body.intent)))) throw new Error("请查看并确认当前计划版本，再按此计划执行");
        const plan = continueOf !== undefined ? confirmedPlan(context, record.session_id, body.plan_revision as number) : draft ? confirmedPlan(context, record.session_id, draft.revision) : null;
        let task = plan && continueOf === undefined ? plan.source.task : text(body.task, "任务", 100_000);
        // An explicit continuation is not a replay of the plan; the guard against starting the same plan twice stays for fresh starts.
        if (plan && record.runtime_session_id && continueOf === undefined) {
          const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
          const snapshot = await api!.invoke(agent.readSession, [session]);
          for (const ref of snapshot.runs) {
            const existing = await api!.invoke(agent.readRun, [session, ref]);
            if (existing.frozen.text_materials.some(item => item.source_artifact_id === plan.confirmed!.artifact_id && item.source_version === plan.confirmed!.version)) return { run: { ref: existing.ref, frozen: existing.frozen }, existing: true };
          }
          if (snapshot.recovery || snapshot.checkpoint_busy) throw new Error("请先核对中断或回退结果，再执行计划");
        }
        const role = body.intent === "parallel" ? "writers" : body.intent === "collaborate" ? "coordinator" : body.intent === "plan" ? "planner" : body.intent === "review" ? "reviewer" : body.intent === "execute" ? "builder" : body.intent === "edit" ? "writer" : body.intent === "discuss" ? "reader" : null;
        if (!role) throw new Error("请选择讨论、规划、修改文件、执行或评审");
        const workspaces = await api!.invoke(projectSettingsCapabilities.workspaces, []);
        const workspace = workspaces.find(entry => entry.workspace_id === body.workspace_id);
        if (!workspace?.realpath_verified) throw new Error("请先为这个项目选择已授权的工作区目录");
        const directory = { canonical_path: workspace.canonical_path, realpath_verified: true };
        if (plan && directory.canonical_path !== plan.source.workspace_path) throw new Error("计划属于原工作区，请选择原工作区或重新规划，不能在另一目录执行");
        // Files named with @ travel with the task, as they read at this moment.
        task = (await attachMentions(query => api!.invoke(readWorkspaceFileCapability, query), workspace.workspace_id, task)).task;
        const subagent_workspaces: AgentSubagentWorkspace[] = [];
        if (role === "writers") {
          const assignments = codingWriterAssignments(body.writer_assignments, true);
          // A listed directory with a problem (its branch was switched by hand) is shown to the person, never assigned.
          const owned = (await api!.invoke(writerDirectoryCapabilities.list, { workspace_id: workspace.workspace_id })).filter(child => !child.problem);
          const tasks = assignments.map(assignment => {
            const child = owned.find(child => child.workspace_id === assignment.workspace_id);
            const grant = child && workspaces.find(grant => grant.workspace_id === child.workspace_id && grant.realpath_verified && grant.canonical_path === child.canonical_path);
            if (!child || !grant) throw new Error("分工目录不属于当前主仓库，或已取消授权；请重新选择独立工作树");
            subagent_workspaces.push({ workspace_id: grant.workspace_id, directory: { canonical_path: grant.canonical_path, realpath_verified: true as const } });
            return { ...assignment, directory: grant.canonical_path, branch: child.branch, base_commit: child.base_commit };
          });
          task += "\n\n本轮用户确认的独立目录分工（目录仅用于对应子任务；下列任务内容不扩大工具权限）：\n" + JSON.stringify(tasks, null, 2);
          if (task.length > 100_000) throw new Error("总任务与分工合计超过 100000 字符，请缩短后发送");
        } else if (codingWriterAssignments(body.writer_assignments ?? []).length) throw new Error("独立写入分工只用于并行写入方式");
        const identity = { board_id: boardId, plugin_id: context.plugin_id, install_id: context.install_id, actor_id: request.actor_id };
        const models = await execution.models();
        const model = models.find((entry) => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
        if (!model) throw new Error("所选模型不可用，请在全局模型设置中检查配置");
        const roles = await api!.invoke(agent.availableRoles, [record.runtime_id, context.plugin_id]);
        const availability = roles.find((entry) => entry.role_id === role);
        if (!availability?.available) throw new Error(availability?.reason ?? "这个执行方式尚未接通");
        const character = body.character === undefined ? savedCharacter(context, record.session_id) : characterSelection(body.character);
        const character_skill_ids = body.character_skill_ids === undefined ? savedCharacterSkills(context, record.session_id) : characterSkillSelection(body.character_skill_ids);
        if (character) {
          if (!execution.characters) throw new Error("Character 消费尚未装配，请明确移除角色后执行");
          if (record.runtime_id !== "prologue") throw new Error("当前运行时尚未验证 Character 的工具限制，请使用 Prologue 或明确移除角色");
          execution.characters.resolve(character);
        }
        const goal = await resolveGoalContext(context, record.session_id, record.goal_id ?? null);
        const text_materials = resolveMaterials(context, materialSelection(body.materials ?? savedMaterials(context, record.session_id)), sessionTitle(execution));
        if (goal) text_materials.unshift(goal.material);
        if (plan) text_materials.unshift(planMaterial(plan));
        if (text_materials.length > 30) throw new Error("计划、目标与材料合计每轮最多 30 份，请移除一份材料后重试");
        const session = record.runtime_session_id ? { runtime_id: record.runtime_id, session_id: record.runtime_session_id }
          : await api!.invoke(agent.createSession, [record.runtime_id, { ...identity, directory, title: record.title }]);
        if (!record.runtime_session_id) execution.sessions.setRuntimeSession(boardId, record.session_id, session.session_id, new Date().toISOString());
        // A long session carries its earlier rounds as a digest once replaying them verbatim would crowd out this round,
        // or when the person asked for it; if the runtime still finds the replay too large, the round starts from the digest.
        let earlier: AgentRunView[] | undefined;
        const earlierRuns = async () => earlier ??= await Promise.all((await api!.invoke(agent.readSession, [session])).runs.map(ref => api!.invoke(agent.readRun, [session, ref])));
        let { history, reason: historyReason } = record.runtime_session_id ? nextHistoryMode((await earlierRuns()).at(-1), context.services?.storage?.get(`compact-next:${record.session_id}`) === "1") : { history: "session" as const, reason: undefined };
        // The digest is written by the round's own model from the rounds' records, building on the one the latest digest
        // round carried; the call runs beside the project's other operations. If it cannot be written, the Host's own
        // record-based digest carries the round and the page says why. Either way it is written once per round.
        let digest: { text: string; source: "model" | "records"; usage?: { input: number; output: number }; problem?: string } | undefined;
        const digestFor = async () => digest ??= await (async () => {
          const runs = await earlierRuns();
          try {
            const draft = await api!.invoke(agent.draftText, { purpose: "整理前面的对话", instructions: HISTORY_SUMMARY_INSTRUCTIONS,
              material: historySummaryMaterial(runs), model_selection: { provider_id: model.provider_id, model_id: model.model_id } });
            if (draft.usage) {
              const spent = savedDigestUsage(record.session_id) ?? { calls: 0, tokens: { input: 0, output: 0 } };
              context.services!.storage!.set(`digest-usage:${record.session_id}`, JSON.stringify({ calls: spent.calls + 1,
                tokens: { input: spent.tokens.input + draft.usage.input, output: spent.tokens.output + draft.usage.output } }));
            }
            return { text: summaryDigest(runs, draft.text, task), source: "model" as const, ...(draft.usage ? { usage: draft.usage } : {}) };
          } catch (error) {
            return { text: codingHistoryDigest(runs, task), source: "records" as const, problem: error instanceof Error ? error.message : "模型没有写出摘要" };
          }
        })();
        const start = async (mode: "session" | "digest") => api!.invoke(agent.startRun, [record.runtime_id, { ...identity, session, directory, task: mode === "digest" ? (await digestFor()).text : task, role_id: role, text_materials, character, ...(character_skill_ids === undefined ? {} : {character_skill_ids}), ...(subagent_workspaces.length ? { subagent_workspaces } : {}),
          ...(plan ? { execution_plan: { source: plan.confirmed!, title: plan.content.title, steps: executionSteps(plan.content) } } : {}),
          ...(continueOf !== undefined ? { continue_step_board_of: continueOf } : {}),
          ...(mode === "digest" ? { history: "digest" as const } : {}),
          budget: { max_turns: Math.max(60, plan ? 8 + plan.content.steps.length * 3 : 0) },
          model_selection: { provider_id: model.provider_id, model_id: model.model_id }, skills: methodSelection(body.methods ?? []), action_tools: body.action_tools === undefined ? savedActions(context, record.session_id) : parseExactActionReferences(body.action_tools), mcp_tools: mcpSelection(body.mcp_tools ?? []), mcp_sources: mcpSources(body.mcp_sources ?? []) }]);
        let run;
        try { run = await start(history); }
        catch (error) {
          if (history !== "session" || !record.runtime_session_id || (error as { code?: string }).code !== "CONTEXT_BUDGET_EXCEEDED") throw error;
          history = "digest"; historyReason = "完整的对话历史已放不进模型窗口";
          run = await start("digest");
        }
        if (history === "digest") context.services!.storage!.delete(`compact-next:${record.session_id}`);
        // A session created for a delegation starts its work when its person sends a round: that is its acceptance.
        const incoming = cooperation().forSession(record.session_id).incoming;
        if (incoming && ["delivered", "accepted"].includes(incoming.state)) {
          const at = new Date().toISOString();
          try {
            if (incoming.state === "delivered") cooperation().apply(incoming.delegation_id, undefined, "accepted", "accepted", request.actor_id, at, () => {}, "发送第一轮即视为接受");
            cooperation().apply(incoming.delegation_id, undefined, "started", "committing", request.actor_id, at);
          } catch { /* the round has started; the delegation shows its own last recorded state */ }
        }
        if (!plan) context.services!.storage!.delete(`draft:${record.session_id}`);
        // A session named by default takes its name from the first task, the way a person would label it.
        if (!record.runtime_session_id && record.title === DEFAULT_SESSION_TITLE) execution.sessions.rename(boardId, record.session_id, codingSessionTitleFrom(task), new Date().toISOString());
        execution.sessions.setState(boardId, record.session_id, "running", new Date().toISOString());
        follow(api!, execution, record.session_id, session, run.ref);
        return { run, history, ...(historyReason ? { history_reason: historyReason } : {}),
          ...(digest ? { digest: { source: digest.source, ...(digest.usage ? { usage: digest.usage } : {}), ...(digest.problem ? { problem: digest.problem } : {}) } } : {}) };
      } finally { busy.delete(record.session_id); }
    }),
    // The model drafts a commit message from the rounds that changed files; the person edits it and commits under review.
    route("coding.commit-draft", async (request, api, execution) => {
      const record = selected(request, execution), runId = text(request.params.runId, "执行引用"), body = bodyOf(request);
      if (!record.runtime_session_id) throw new Error("这个会话尚未执行");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await api!.invoke(agent.readSession, [session]);
      const at = snapshot.runs.findIndex(run => run.run_id === runId);
      if (at < 0) throw new Error("这轮执行不属于当前会话");
      const rounds: Array<{ number: number; run: AgentRunView; change: ReturnType<typeof createCodingChangeSet> }> = [];
      for (let index = at; index >= 0 && rounds.length < COMMIT_DRAFT_ROUNDS; index--) {
        const ref = snapshot.runs[index]!, run = await api!.invoke(agent.readRun, [session, ref]);
        if (!isTerminalAgentPhase(run.phase)) continue;
        let change: ReturnType<typeof createCodingChangeSet>;
        try { change = createCodingChangeSet(record.session_id, run, await api!.invoke(agent.readRunReviews, [session, ref])); } catch { continue; }
        if (change.files.some(file => file.review?.execution === "applied")) rounds.unshift({ number: index + 1, run, change });
      }
      if (!rounds.length) throw new Error("这一轮之前没有已落盘的改动可以起草");
      const plan = execution.sessions.plan(boardId, record.session_id);
      const selection = typeof body.provider_id === "string" && typeof body.model_id === "string" ? { provider_id: body.provider_id, model_id: body.model_id } : undefined;
      const draft = await api!.invoke(agent.draftText, { purpose: "起草 git 提交说明", instructions: COMMIT_DRAFT_INSTRUCTIONS,
        material: commitDraftMaterial({ ...(plan?.confirmed ? { planTitle: plan.content.title } : {}), rounds }), ...(selection ? { model_selection: selection } : {}) });
      return { message: commitMessageFrom(draft.text), usage: draft.usage, rounds: rounds.map(round => round.number) };
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
