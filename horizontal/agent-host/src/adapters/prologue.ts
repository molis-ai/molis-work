import { agentErrors } from "../errors.js";
import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { isTerminalAgentPhase, parseAgentRunBudget } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type {
  AgentSkillLibrary,
  AgentMcpLibrary,
  AgentCommandOutput,
  AgentCommandOutputRef,
  AgentCreateSessionRequest,
  AgentRunControl,
  AgentRunHandle,
  AgentRunRef,
  AgentRunView,
  AgentRuntimeAdapter,
  AgentRuntimeDescriptor,
  AgentRuntimeHealth,
  AgentSessionRef,
  AgentSessionView,
  AgentSessionStatus,
  AgentStartRequest,
  AgentStartExecution,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { freezeExecutionPlan } from "../execution-plan.js";
import { assertSessionCreation } from "./prologue-frozen.js";
import { switchRunModel } from "./prologue-model-switch.js";
import { controlFailure } from "./prologue-control-errors.js";
import { PrologueMemoryUsage } from "./prologue-memory-usage.js";
import { restorePrologueRun } from "./prologue-restored-session.js";
import { readSupplementaryInput } from "./prologue-original-inputs.js";
import { inputsPort } from "./prologue-inputs.js";
import { settleProloguePending } from "./prologue-stream.js";
import { guardedCheckpoints, guardedRecovery, guardedSubagents, prologueDescriptor, PROLOGUE_RUNTIME_ID } from "./prologue-adapter-capabilities.js";
import type { PrologueAdapterOptions, PrologueAdapterPorts, PrologueRuntimePort } from "./prologue-ports.js";
import { isEnded, PrologueRunStore } from "./prologue-run-store.js";
import { startPrologueRun } from "./prologue-run-start.js";

export { PROLOGUE_RUNTIME_ID } from "./prologue-adapter-capabilities.js";
export type {
  PrologueAdapterOptions,
  PrologueAdapterPorts,
  PrologueControlPort,
  PrologueModelConfiguration,
  PrologueRestoredSession,
  PrologueRunPort,
  PrologueRunTiming,
  PrologueRuntimePort,
  PrologueStartInput,
} from "./prologue-ports.js";

/**
 * The only seam to Prologue.
 *
 * The ports (prologue-ports.ts) are what this adapter needs, not a mirror of the
 * SDK: the SDK's own shapes stay in the composition file, so this logic is
 * testable without a model, a network or a disk.
 *
 * Model, endpoint and credentials are Host facts supplied through ports. Role
 * and prompts arrive already frozen by the Host. This adapter invents neither.
 * The sessions and runs it holds are in its store (prologue-run-store.ts); a
 * round starts in prologue-run-start.ts.
 */
export class PrologueAgentAdapter implements AgentRuntimeAdapter {
  readonly sessionLifecycle?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSessionLifecycle;
  readonly subagents?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSubagentsCapability;
  readonly projectWork?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentProjectWorkCapability;
  readonly messages?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentSessionMessagesCapability;
  readonly collaboration?: import("@molis-ai/molis-work-contracts/services/agent-collaboration").AgentCollaborationPort;
  readonly background?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentBackgroundCapability;
  readonly inputs = {
    ...inputsPort(async run => { await this.read(run); const record = this.#store.requireRun(run.run_id); return { ended: isEnded(record.view.phase), control: record.control, turns: record.view.turns }; }, () => this.#runtime.queue, runId => this.#store.publish(runId)),
    read: (ref: import("@molis-ai/molis-work-contracts/services/agent-inputs").AgentInputRef) => readSupplementaryInput(ref, {
      locate: async input => this.#runtime.sessions.locateInput?.(input.session_id, input.input_id),
      latest: async id => this.#store.sessions.get(id)?.runs.at(-1) ?? (await this.#runtime.sessions.readStatus?.(id))?.latest?.ref,
      read: run => this.read(run),
    }),
  };
  readonly descriptor: AgentRuntimeDescriptor;
  readonly skillLibrary?: AgentSkillLibrary;
  readonly mcpLibrary?: AgentMcpLibrary;
  readonly recovery?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryCapability;
  readonly schedule?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentScheduleCapability;
  readonly memory?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryCapability;
  readonly documents?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentDocumentCapability;
  readonly checkpoints?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCheckpointsCapability;
  readonly #runtime: PrologueRuntimePort;
  readonly #ports: PrologueAdapterPorts;
  readonly #store: PrologueRunStore;
  readonly #memoryUsage: PrologueMemoryUsage;
  readonly #answerPending: PrologueAdapterOptions["answerPending"];
  readonly #detachApprovalAnswers: (() => void) | undefined;

  constructor(options: PrologueAdapterOptions) {
    const runtime = options.runtime;
    this.#runtime = runtime;
    this.#ports = options;
    this.#memoryUsage = new PrologueMemoryUsage(options.memoryUsage);
    this.#store = new PrologueRunStore(runtime, options.now ?? (() => new Date()), options.approvals, this.#memoryUsage);
    if (runtime.sessions.lifecycle) this.sessionLifecycle = this.#store.cache.bind(runtime.sessions.lifecycle);
    if (runtime.projectWork) this.projectWork = runtime.projectWork;
    if (runtime.messages) this.messages = runtime.messages;
    // A plan change goes through the adapter, which knows which round's graph may still change.
    if (runtime.collaboration) this.collaboration = { ...runtime.collaboration, revise: (run, amendment, version, actor) => this.#revise(run, amendment, version, actor) };
    if (runtime.background) this.background = runtime.background;
    if (runtime.schedule) this.schedule = runtime.schedule;
    if (runtime.memory) this.memory = runtime.memory;
    if (runtime.documents) this.documents = runtime.documents;
    if (runtime.subagents) this.subagents = guardedSubagents(runtime.subagents, run => this.read(run));
    if (runtime.recovery) this.recovery = guardedRecovery(this.#store, runtime, runtime.recovery);
    if (runtime.checkpoints) this.checkpoints = guardedCheckpoints(this.#store, runtime.checkpoints);
    this.skillLibrary = runtime.skillLibrary;
    this.mcpLibrary = runtime.mcpLibrary;
    this.#answerPending = options.answerPending;
    this.#detachApprovalAnswers = options.approvals?.subscribeAnswered((run, pendingId) => {
      const record = this.#store.runs.get(run.run_id);
      if (record?.view.ref.session_id === run.session_id && settleProloguePending(record.state, pendingId)) this.#store.publish(run.run_id);
    });
    this.descriptor = prologueDescriptor(options);
  }

  async health(): Promise<AgentRuntimeHealth> {
    const configuration = await this.#ports.modelConfiguration();
    if (configuration === null) {
      return {
        ok: false,
        status: "needs_setup",
        message: "还没有配置可用的模型",
        action: "在全局设置里选择模型并填写凭据",
      };
    }
    return { ok: true, status: "ready", message: `已配置 ${configuration.model}` };
  }

  async createSession(input: AgentCreateSessionRequest, execution?: AgentStartExecution): Promise<AgentSessionRef> {
    assertSessionCreation(input, this.#runtime.workspaceNone, this.descriptor.supports_workspace_business);
    await execution?.beforeStart?.(); requireSynchronous(execution?.assertBeforeStart?.(), "最终授权检查必须同步完成");
    const session = await this.#runtime.sessions.create(input, execution);
    this.#store.rememberSession(session.ref.id, { title: input.title, workspace: input.workspace ?? "required", runs: [], owner: { project_id: input.project_id, plugin_id: input.plugin_id, install_id: input.install_id, actor_id: input.actor_id } });
    return { session_id: session.ref.id, runtime_id: PROLOGUE_RUNTIME_ID };
  }

  async readSession(session: AgentSessionRef): Promise<AgentSessionView> {
    const current = this.#store.cache.capture(session.session_id);
    const record = await this.#store.loadSession(session.session_id);
    const latest = record.runs.at(-1), view = latest ? structuredClone(this.#store.requireRun(latest.run_id).view) : null;
    // Read only while no round is live (ended, or stopped for checking): what a live round takes is its own (specs/ai-input-receipts D31).
    const queued = view && !isTerminalAgentPhase(view.phase) && view.phase !== "reconcile-required" ? undefined : await this.#runtime.sessions.queued?.(session.session_id);
    current(); return {
      session: { ...session }, owner: { ...record.owner }, workspace: record.workspace, title: record.title,
      runs: record.runs.map((ref) => ({ ...ref })),
      checkpoint_busy: this.#runtime.checkpoints?.busy?.(session) ?? false,
      latest_run: view,
      ...(record.recovery ? { recovery: { ...record.recovery } } : {}), ...(queued ? { queued_inputs: queued } : {}),
    };
  }

  async readOriginalInput(ref: Parameters<NonNullable<AgentRuntimeAdapter["readOriginalInput"]>>[0]) {
    const current = this.#store.cache.capture(ref.session_id), result = await this.#runtime.sessions.readOriginalInput?.({ ...ref });
    current(); return result;
  }

  async readSessionStatus(session: AgentSessionRef): Promise<{ owner: AgentSessionView["owner"]; status: AgentSessionStatus }> {
    const current = this.#store.cache.capture(session.session_id);
    let projected: Awaited<ReturnType<NonNullable<PrologueRuntimePort["sessions"]["readStatus"]>>>;
    if (!this.#store.sessions.has(session.session_id) && this.#runtime.sessions.readStatus) {
      // A detail restore already under way must win over a second cold projection.
      const restoring = this.#store.restoring(session.session_id);
      if (restoring) await restoring;
      else {
        const saved = await this.#runtime.sessions.readStatus(session.session_id);
        if (!saved) { this.#store.requireSession(session.session_id); throw agentErrors.session_unknown("找不到这条会话"); }
        // A start/detail read may have completed while the SDK reads were in flight.
        if (!this.#store.sessions.has(session.session_id)) projected = saved;
      }
    }
    const record = projected ? undefined : await this.#store.loadSession(session.session_id);
    const latest = record?.runs.at(-1);
    const planned = record ? [...record.runs].reverse().find(ref => this.#store.requireRun(ref.run_id).view.frozen.execution_plan) : projected?.planned;
    // Who holds the unfinished steps of the latest planned round: a directory shows what waits on the person.
    let steps: AgentSessionStatus["steps"];
    if (planned && this.#runtime.readStepBoard) {
      try {
        const board = await this.#runtime.readStepBoard(planned);
        const open = board && !board.terminal ? board.nodes.filter(node => !["succeeded", "failed", "cancelled"].includes(node.state)) : [];
        const count = (kind: string) => open.filter(node => node.owner?.kind === kind).length;
        if (open.length) steps = { mine: count("person"), subtasks: count("subtask"), unowned: count("none") };
      } catch { /* an unreadable graph shows no counts, never made-up ones */ }
    }
    // A live run may end while the step graph is being read; sample its phase at return.
    const facts = record ?? projected!;
    const phase = record ? (latest ? this.#store.requireRun(latest.run_id).view.phase : null)
      : (projected!.latest ? restorePrologueRun(projected!.latest, waiting => this.#runtime.unexecutedApprovalCall?.(projected!.latest!.ref, waiting)).state.phase : null);
    current(); return { owner: { ...facts.owner }, status: { session_id: session.session_id, latest_phase: phase,
      recovery: Boolean(facts.recovery), checkpoint_busy: this.#runtime.checkpoints?.busy?.(session) ?? false,
      ...(steps && (steps.mine || steps.subtasks || steps.unowned) ? { steps } : {}) } };
  }

  async start(request: AgentStartRequest, execution?: AgentStartExecution): Promise<AgentRunHandle> {
    request = { ...request, budget: parseAgentRunBudget(request.budget),
      ...(request.original_input ? { original_input: structuredClone(request.original_input) } : {}),
      ...(request.continued_from ? { continued_from: structuredClone(request.continued_from) } : {}) };
    request = { ...request, execution_plan: freezeExecutionPlan(request), text_materials: structuredClone(request.text_materials ?? []) };
    const session = await this.#store.loadSession(request.session.session_id);
    if (session.workspace !== (request.workspace ?? "required") || request.role?.workspace === "none" && request.workspace !== "none"
      || request.role?.workspace === "business" && request.workspace !== "business") {
      throw agentErrors.session_unknown("不能改变原会话的工作区方式");
    }
    if (request.workspace === "none" && (!this.#runtime.workspaceNone || request.role?.workspace !== "none" || request.directory !== undefined
      || request.role.execution !== "read-only" || request.role.host_tools.length || request.role.actions?.tools.length || request.role.subagents?.length
      || request.action_tools?.length || request.mcp_tools?.length || request.mcp_sources?.length || request.skills?.length || request.execution_plan || request.subagent_workspaces?.length)) {
      throw agentErrors.capability_unavailable("无工作区会话只能进行宿主冻结的无工具推理");
    }
    // Business work: no directory, the Host's frozen actions and root-free tools only; nothing file- or child-shaped.
    if (request.workspace === "business" && (!this.descriptor.supports_workspace_business || request.role?.workspace !== "business" || request.directory !== undefined
      || !["read-only", "operate"].includes(request.role.execution) || request.role.host_tools.some(tool => !(BUSINESS_HOST_TOOLS as readonly string[]).includes(tool))
      || request.role.subagents?.length || request.role.subagent_workspaces?.length || request.mcp_tools?.length || request.mcp_sources?.length
      || request.execution_plan || request.subagent_workspaces?.length)) {
      throw agentErrors.capability_unavailable("业务会话只能使用宿主冻结的业务动作与不碰目录的工具");
    }
    if (session.recovery) throw agentErrors.session_busy(session.recovery.reason);
    if (this.#runtime.checkpoints?.busy?.(request.session) || this.#store.startingSessions.has(request.session.session_id)
      || !this.#store.latestEnded(session)) {
      throw agentErrors.session_busy("这个会话仍在执行或保存上一轮；可以补充要求，结束后再开新一轮");
    }
    return this.#store.withSessionHeld(request.session.session_id, async () => {
      try { return await startPrologueRun({ runtime: this.#runtime, ports: this.#ports, descriptor: this.descriptor, store: this.#store, read: run => this.read(run) }, request, session, execution); }
      catch (error) {
        // A durable start intent may exist even when no handle was returned.
        if (this.#runtime.sessions.restore) this.#store.invalidateSession(request.session.session_id);
        throw error;
      }
    });
  }

  async read(run: AgentRunRef): Promise<AgentRunView> {
    const current = this.#store.cache.capture(run.session_id);
    const session = await this.#store.loadSession(run.session_id);
    if (!session.runs.some(item => item.run_id === run.run_id)) throw agentErrors.run_unknown("这次执行不属于此会话");
    const record = this.#store.requireRun(run.run_id);
    current(); await this.#memoryUsage.record(record, session.owner);
    const view = structuredClone(record.view);
    if (view.frozen.execution_plan) {
      try {
        view.step_board = await this.#runtime.readStepBoard?.(run);
        if (!view.step_board) throw new Error("原步骤图不可读取");
      } catch { view.step_board_error = "原步骤回报暂不可读；不能据此判断完成情况。"; }
    }
    if (this.#runtime.readPendingQuestion) {
      view.awaiting_input = (await Promise.all(view.awaiting_input.map(async (question): Promise<AgentPendingQuestion | null> => {
        try {
          if (question.pending_revision === undefined) throw new Error("旧问题缺少精确版本，不能提交答案");
          const original = await this.#runtime.readPendingQuestion!(run, question.pending_id, question.pending_revision);
          return original === null ? null : { ...original, sequence: question.sequence };
        } catch (error) {
          return { ...question, answerable: false, unavailable_reason: error instanceof Error ? error.message : "原问题暂时不可读取" };
        }
      }))).filter((question): question is AgentPendingQuestion => question !== null);
    }
    current(); return view;
  }

  observe(run: AgentRunRef, listener: (view: AgentRunView) => void): () => void {
    this.#store.cache.capture(run.session_id)();
    const record = this.#store.requireRun(run.run_id);
    record.listeners.add(listener);
    listener(structuredClone(record.view));
    return () => {
      record.listeners.delete(listener);
    };
  }

  /**
   * A person adjusts a plan graph while its round runs, or between rounds while the graph is unfinished and belongs to
   * the session's latest plan round (later rounds, if any, were only conversation and have ended): "继续计划" carries on
   * from that same graph, so a blocked step is decided (or a step skipped or added) before the plan continues. An
   * earlier plan's graph, or a finished one, stays the record it was.
   */
  async #revise(run: AgentRunRef, amendment: import("@molis-ai/molis-work-contracts/services/agent-host").AgentStepAmendment, expectedVersion: number, actorId: string) {
    const current = await this.read(run);
    if (isEnded(current.phase)) {
      const record = await this.#store.loadSession(run.session_id);
      const at = record.runs.findIndex(entry => entry.run_id === run.run_id);
      const later = record.runs.slice(at + 1).map(entry => this.#store.requireRun(entry.run_id).view);
      if (later.some(view => view.frozen.execution_plan || !isEnded(view.phase))) throw agentErrors.session_busy("这一轮之后已有新的计划轮或仍在进行的一轮，它的计划图不再调整；请在最新的计划轮上调整");
      if (!current.step_board || current.step_board.terminal) throw agentErrors.session_busy("这一轮的计划图已经结束，不再调整；请调整计划后开始新一轮");
    }
    return this.#runtime.collaboration!.revise(run, amendment, expectedVersion, actorId, () => this.#store.requireRun(run.run_id).state.turns);
  }

  async control(run: AgentRunRef, control: AgentRunControl): Promise<void> {
    try {
      await this.read(run);
      const record = this.#store.requireRun(run.run_id);
      switch (control.kind) {
        case "stop":
          await record.control.stop("stopped");
          break;
        case "cancel":
          await record.control.stop("cancelled");
          break;
        case "pause":
          record.control.pause();
          break;
        case "resume":
          record.control.resume();
          break;
        case "switch-model":
          await switchRunModel({ record, selection: control, configure: this.#ports.modelConfiguration, defaultWindow: this.#runtime.defaultContextWindowTokens,
            requested: model => { record.state.model_requested = model; } });
          break;
        case "answer": {
          const answer = this.#answerPending;
          if (answer === undefined) throw agentErrors.capability_unavailable("没有接上回答通道，这条问题回答不了");
          const question = record.state.awaiting_input.find(item => item.pending_id === control.pending_id);
          if (!question || isEnded(record.view.phase) || question.pending_revision !== control.pending_revision) {
            throw agentErrors.pending_not_open("这条问题不属于本轮当前等待，不能提交答案");
          }
          // The Run owns whether the question is closed; drop it from the view only after the execution owner accepted the
          // answer. A parked Run ended with it: the session is read again, its next round no longer waits for checking.
          if (await answer(run, control) === "queued") await this.#store.reloadSession(run.session_id);
          else settleProloguePending(record.state, control.pending_id);
          break;
        }
      }
      this.#store.publish(run.run_id);
    } catch (error) { throw controlFailure(error); }
  }

  async readCommandOutput(
    session: AgentSessionRef,
    ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput> {
    const current = this.#store.cache.capture(session.session_id);
    const record = await this.#store.loadSession(session.session_id);
    if (!record.runs.some(run => run.run_id === ref.run_id)) throw agentErrors.run_unknown("这轮执行不属于所选会话");
    if (!this.#runtime.readCommandOutput) throw agentErrors.capability_unavailable("这个 Runtime 没有接通命令回执");
    current(); const output = await this.#runtime.readCommandOutput(session.session_id, ref);
    current(); return output;
  }

  /** Release the underlying Runtime. The Host owns when this happens. */
  async close(): Promise<void> {
    this.#detachApprovalAnswers?.();
    for (const record of this.#store.runs.values()) record.memory = undefined;
    await Promise.all([...this.#store.runs.values()].map(record => record.timingCommit));
    try {
      await this.#runtime.shutdown();
      for (const record of this.#store.runs.values()) record.unsubscribe();
    } finally {
      await Promise.all([...this.#store.runs.values()].map(record => record.timingCommit));
      await this.#memoryUsage.flush();
    }
  }
}
