import { agentTextMaterialContent, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type {
  AgentSkillLibrary,
  AgentMcpLibrary,
  AgentMcpToolRef,
  AgentMcpSourceRef,
  AgentCommandOutput,
  AgentCommandOutputRef,
  AgentPendingQuestion,
  AgentCreateSessionInput,
  AgentHostErrorCode,
  AgentRunControl,
  AgentRunHandle,
  AgentRunRef,
  AgentRunView,
  AgentRuntimeAdapter,
  AgentRuntimeCapabilityMatrix,
  AgentRuntimeDescriptor,
  AgentRuntimeHealth,
  AgentSessionRef,
  AgentSessionView,
  AgentStartRequest,
} from "@molis-ai/molis-work-contracts/services/agent-host";

import { emptyCapabilityMatrix } from "../capabilities.js";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import {
  applyPrologueEvent,
  closeInterruptedPrologueStream,
  emptyPrologueStreamState,
  prologuePhaseOf,
  settleProloguePending,
  type PrologueControlState,
  type PrologueEvent,
  type PrologueStreamState,
} from "./prologue-stream.js";

/**
 * The only seam to Prologue.
 *
 * The port below is what this adapter needs, not a mirror of the SDK: the SDK's
 * own shapes stay in the composition file, so this logic is testable without a
 * model, a network or a disk.
 *
 * Model, endpoint and credentials are Host facts supplied through ports. Role
 * and prompts arrive already frozen by the Host. This adapter invents neither.
 */

export const PROLOGUE_RUNTIME_ID = "prologue";

export class PrologueAdapterError extends Error {
  constructor(
    readonly code: Extract<AgentHostErrorCode,
      | "agent.model_not_configured"
      | "agent.role_not_frozen"
      | "agent.session_unknown"
      | "agent.session_busy"
      | "agent.run_unknown"
      | "agent.pending_not_open"
      | "agent.capability_unavailable">,
    message: string,
  ) {
    super(message);
    this.name = "PrologueAdapterError";
  }
}

/** What the Host must supply before a Run can start. The adapter reads, never stores. */
export interface PrologueModelConfiguration {
  protocol: string;
  endpoint: string;
  model: string;
  /** Opaque credential reference. The adapter never sees the secret itself. */
  credential_ref: string;
  /**
   * Prompt cache mode for this Run. Absent is `off`, and `off` must behave
   * exactly as if caching did not exist — no field is sent at all.
   */
  prompt_cache?: "off" | "best-effort" | "required";
}

export interface PrologueAdapterPorts {
  /** The current model configuration, or null when the user has not set one. */
  modelConfiguration(selection?: AgentStartRequest["model_selection"]): Promise<PrologueModelConfiguration | null>;
}

export interface PrologueRunPort {
  ref: { id: string };
  subscribe(listener: (event: PrologueEvent) => void): () => void;
  cancel(): Promise<void>;
}

export interface PrologueControlPort {
  state: PrologueControlState;
  stop(reason: "stopped" | "cancelled"): void | Promise<void>;
  pause(): void;
  resume(): void;
  steer(input: { text: string }): void | Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface PrologueStartInput {
  /** Host provenance, persisted before execution; never credentials or event history. */
  provenance: { frozen: AgentRunView["frozen"]; started_at: string };
  session_id: string;
  /** Authorized root this Run may touch, already resolved by the Host. */
  root_path: string;
  model: PrologueModelConfiguration;
  /** Character frozen from the Plugin's own role declaration. */
  character: {
    id: string;
    version: number;
    name: string;
    /** Composed prompt bodies. The composition stages them as a resource. */
    instructions: string;
    tools: string[];
  };
  compaction?: { prompt: string; above_tokens: number };
  task: string;
  text_materials?: readonly AgentTextMaterial[];
  skills?: readonly AgentSkillDefinition[];
  mcp_tools?: readonly AgentMcpToolRef[];
  mcp_sources?: readonly AgentMcpSourceRef[];
  /** Read-only work never asks to write; the Host decides this, not the model. */
  mode: "plan" | "build";
}

/** Host observation times only; the SDK ledger owns content and execution state. */
export interface PrologueRunTiming {
  turns: Array<{ turn_id: string; at: string | null }>;
  activity: Array<{ call_id: string; at: string | null }>;
  ended_at: string | null;
}

export interface PrologueRuntimePort {
  recovery?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryCapability;
  checkpoints?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCheckpointsCapability;
  skillLibrary?: AgentSkillLibrary;
  mcpLibrary?: AgentMcpLibrary;
  saveRunTiming?(run: AgentRunRef, timing: PrologueRunTiming): Promise<void>;
  /** This runtime prepares selected bounded text methods through SDK public APIs. */
  inlineMethods?: boolean;
  /** Node composition actually supplies a cancellable SDK ContextCompactor. */
  compaction?: boolean;
  /** null only when the original owner confirms the question was answered. */
  readPendingQuestion?(run: AgentRunRef, pendingId: string, revision: number): Promise<AgentPendingQuestion | null>;
  readCommandOutput?(sessionId: string, ref: AgentCommandOutputRef): Promise<AgentCommandOutput>;
  sessions: {
    create(input: AgentCreateSessionInput): Promise<{ ref: { id: string } }>;
    restore?(sessionId: string): Promise<PrologueRestoredSession | undefined>;
  };
  startAgentRun(input: PrologueStartInput): Promise<{
    run: PrologueRunPort;
    control: PrologueControlPort;
  }>;
  shutdown(): Promise<unknown>;
}

export interface PrologueRestoredSession {
  title: string;
  owner: AgentSessionView["owner"];
  recovery?: AgentSessionView["recovery"];
  runs: Array<{
    ref: AgentRunRef;
    frozen: AgentRunView["frozen"];
    started_at: string;
    task: string;
    stop_intent?: "stopped" | "cancelled";
    timing?: PrologueRunTiming;
    original_questions?: Array<{ pending_id: string; pending_revision: number; kind: string; why: string }>;
    /** May be a durable incomplete prefix. Only an actual terminal event proves an ended Run. */
    events?: readonly PrologueEvent[];
  }>;
}

interface SessionRecord {
  title: string;
  runs: AgentRunRef[];
  owner: AgentSessionView["owner"];
  recovery?: AgentSessionView["recovery"];
}

export interface PrologueAdapterOptions extends PrologueAdapterPorts {
  runtime: PrologueRuntimePort;
  providerVersion?: string;
  /**
   * The bridge that puts this Runtime's pending effects in front of the user.
   *
   * Attaching it is what makes writes and commands honestly supported: with it,
   * every effect stops at the Host's review queue and waits for a decision.
   * Without it those capabilities stay `unsupported`, because a Run could
   * otherwise write with no recorded approval.
   */
  approvals?: PrologueApprovalBridge;
  /** Delivers an answer to one pending question the Run is stopped on. */
  answerPending?(run: AgentRunRef, answer: Extract<AgentRunControl, { kind: "answer" }>): Promise<void>;
  /**
   * Narrows the matrix further. Writes and commands stay off until the
   * approval bridge is attached for this Runtime.
   */
  capabilities?: Partial<AgentRuntimeCapabilityMatrix>;
  now?: () => Date;
}

/** Writes require the Host approval owner; commands additionally require durable receipts. */
function currentCapabilities(approvalsAttached: boolean, receiptsAttached: boolean): AgentRuntimeCapabilityMatrix {
  const matrix = emptyCapabilityMatrix();
  if (approvalsAttached) matrix["text-edit"] = "supported";
  if (receiptsAttached) matrix["command.receipts"] = "supported";
  if (approvalsAttached && receiptsAttached) matrix.command = "supported";
  matrix["session.create"] = "supported";
  matrix["session.read"] = "supported";
  matrix["run.start"] = "supported";
  matrix["run.observe"] = "supported";
  matrix["run.control"] = "supported";
  // A compactor must be installed before advertising context compaction.
  matrix.compaction = "unsupported";
  matrix.usage = "supported";
  return matrix;
}

interface RunRecord {
  view: AgentRunView;
  state: PrologueStreamState;
  control: PrologueControlPort;
  unsubscribe: () => void;
  listeners: Set<(view: AgentRunView) => void>;
  timingCommit?: Promise<void>;
  timingReady?: boolean;
  timingError?: string;
  observedEndAt?: string;
}

export class PrologueAgentAdapter implements AgentRuntimeAdapter {
  readonly descriptor: AgentRuntimeDescriptor;
  readonly skillLibrary?: AgentSkillLibrary;
  readonly mcpLibrary?: AgentMcpLibrary;
  readonly recovery?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecoveryCapability;
  readonly #runtime: PrologueRuntimePort;
  readonly #ports: PrologueAdapterPorts;
  readonly #now: () => Date;
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #restoring = new Map<string, Promise<SessionRecord>>();
  readonly #runs = new Map<string, RunRecord>();
  readonly #startingSessions = new Set<string>();
  readonly checkpoints?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentCheckpointsCapability;
  readonly #approvals: PrologueApprovalBridge | undefined;
  readonly #answerPending: PrologueAdapterOptions["answerPending"];
  readonly #detachApprovalAnswers: (() => void) | undefined;

  constructor(options: PrologueAdapterOptions) {
    this.#runtime = options.runtime;
    if (options.runtime.recovery) this.recovery = {
      inspect: async session => { await this.#loadSession(session.session_id); return options.runtime.recovery!.inspect(session); },
      close: async (session, runId, expectedVersion) => {
        const held = await this.#loadSession(session.session_id);
        if (!held.runs.some(run => run.run_id === runId)) throw new PrologueAdapterError("agent.run_unknown", "这轮执行不属于当前会话");
        const latest = held.runs.at(-1);
        const phase = latest && this.#requireRun(latest.run_id).view.phase;
        if (this.#startingSessions.has(session.session_id) || options.runtime.checkpoints?.busy?.(session)
          || phase && phase !== "reconcile-required" && !isEnded(phase)) throw new PrologueAdapterError("agent.session_busy", "会话仍在执行或回退，不能关闭中断轮次");
        this.#startingSessions.add(session.session_id);
        try {
          const report = await options.runtime.recovery!.close(session, runId, expectedVersion);
          this.#sessions.delete(session.session_id);
          await this.#loadSession(session.session_id);
          return report;
        } finally { this.#startingSessions.delete(session.session_id); }
      },
    };
    if (options.runtime.checkpoints) this.checkpoints = {
      busy: session => options.runtime.checkpoints!.busy?.(session) ?? false,
      list: async session => { await this.#loadSession(session.session_id); return options.runtime.checkpoints!.list(session); },
      prepareRewind: async (session, checkpointId) => {
        const held = await this.#loadSession(session.session_id);
        const latest = held.runs.at(-1);
        if (held.recovery || this.#startingSessions.has(session.session_id) || options.runtime.checkpoints!.busy?.(session)
          || latest && !isEnded(this.#requireRun(latest.run_id).view.phase)) throw new PrologueAdapterError("agent.session_busy", "会话仍有执行、回退或待核对结果，不能回退文件");
        this.#startingSessions.add(session.session_id);
        try { return await options.runtime.checkpoints!.prepareRewind(session, checkpointId); }
        finally { this.#startingSessions.delete(session.session_id); }
      },
    };
    this.skillLibrary = options.runtime.skillLibrary;
    this.mcpLibrary = options.runtime.mcpLibrary;
    this.#ports = options;
    this.#now = options.now ?? (() => new Date());
    this.#approvals = options.approvals;
    this.#answerPending = options.answerPending;
    this.#detachApprovalAnswers = options.approvals?.subscribeAnswered((run, pendingId) => {
      const record = this.#runs.get(run.run_id);
      if (record?.view.ref.session_id === run.session_id && settleProloguePending(record.state, pendingId)) this.#publish(run.run_id);
    });
    const capabilities = currentCapabilities(options.approvals !== undefined, options.runtime.readCommandOutput !== undefined);
    if (options.runtime.mcpLibrary && options.approvals) capabilities.mcp = "partial";
    if (options.runtime.checkpoints) capabilities.checkpoint = "supported";
    if (options.runtime.compaction) capabilities.compaction = "supported";
    if (options.runtime.inlineMethods) capabilities.skills = "partial";
    if (options.runtime.sessions.restore) capabilities["session.resume"] = "partial";
    const rank = { unsupported: 0, partial: 1, supported: 2 };
    for (const key of Object.keys(options.capabilities ?? {}) as Array<keyof AgentRuntimeCapabilityMatrix>) {
      const requested = options.capabilities![key];
      if (requested && rank[requested] < rank[capabilities[key]]) capabilities[key] = requested;
    }
    this.descriptor = {
      runtime_id: PROLOGUE_RUNTIME_ID,
      display_name: "Prologue",
      provider_version: options.providerVersion ?? "0.0.0-rc.1",
      capabilities,
    };
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

  async createSession(input: AgentCreateSessionInput): Promise<AgentSessionRef> {
    const session = await this.#runtime.sessions.create(input);
    this.#sessions.set(session.ref.id, { title: input.title, runs: [], owner: { board_id: input.board_id, plugin_id: input.plugin_id, install_id: input.install_id } });
    return { session_id: session.ref.id, runtime_id: PROLOGUE_RUNTIME_ID };
  }

  async readSession(session: AgentSessionRef): Promise<AgentSessionView> {
    const record = await this.#loadSession(session.session_id);
    const latest = record.runs.at(-1);
    return {
      session: { ...session },
      owner: { ...record.owner },
      title: record.title,
      runs: record.runs.map((ref) => ({ ...ref })),
      checkpoint_busy: this.#runtime.checkpoints?.busy?.(session) ?? false,
      latest_run: latest ? structuredClone(this.#requireRun(latest.run_id).view) : null,
      ...(record.recovery ? { recovery: { ...record.recovery } } : {}),
    };
  }

  async start(request: AgentStartRequest): Promise<AgentRunHandle> {
    request = { ...request, text_materials: structuredClone(request.text_materials ?? []) };
    const session = await this.#loadSession(request.session.session_id);
    if (session.recovery) throw new PrologueAdapterError("agent.session_busy", session.recovery.reason);
    const latest = session.runs.at(-1);
    if (this.#runtime.checkpoints?.busy?.(request.session) || this.#startingSessions.has(request.session.session_id)
      || (latest !== undefined && !isEnded(this.#requireRun(latest.run_id).view.phase))) {
      throw new PrologueAdapterError("agent.session_busy", "这个会话仍在执行或保存上一轮；可以补充要求，结束后再开新一轮");
    }
    this.#startingSessions.add(request.session.session_id);
    try { return await this.#start(request, session); }
    catch (error) {
      // A durable start intent may exist even when no handle was returned.
      if (this.#runtime.sessions.restore) this.#sessions.delete(request.session.session_id);
      throw error;
    }
    finally { this.#startingSessions.delete(request.session.session_id); }
  }

  async #start(request: AgentStartRequest, session: SessionRecord): Promise<AgentRunHandle> {
    const textMaterials = request.text_materials ?? [];
    if (textMaterials.length > 30 || new Set(textMaterials.map(item => item.material_id)).size !== textMaterials.length) throw new Error("材料过多或选择重复");
    textMaterials.forEach(agentTextMaterialContent);
    const model = await this.#ports.modelConfiguration(request.model_selection);
    if (model === null) {
      throw new PrologueAdapterError("agent.model_not_configured", "还没有配置可用的模型");
    }
    const role = request.role;
    if (role === undefined) {
      throw new PrologueAdapterError(
        "agent.role_not_frozen",
        "宿主没有冻结角色定义，不能在没有角色 Prompt 的情况下起跑",
      );
    }
    // Only the Host decides whether this Run may write. A role the Host froze
    // as read-only plans; it never builds because the model asked to.
    const mode = role.execution === "read-only" ? "plan" : "build";
    if (mode === "build" && this.descriptor.capabilities["text-edit"] === "unsupported") {
      throw new PrologueAdapterError(
        "agent.capability_unavailable",
        "这个 Runtime 尚未接通副作用审批，不能运行会写入的角色",
      );
    }

    if ((request.skills?.length ?? 0) !== (role.skills?.length ?? 0)
      || role.skills?.some(skill => !request.skills?.some(ref => ref.skill_id === skill.skill_id && ref.version === skill.version))
      || ((role.skills?.length ?? 0) > 0 && !this.#runtime.inlineMethods)) {
      throw new PrologueAdapterError("agent.capability_unavailable", "方法未由宿主解析或当前运行时不能展开方法");
    }
    if ((request.mcp_tools?.length || request.mcp_sources?.length) && this.descriptor.capabilities.mcp === "unsupported") throw new PrologueAdapterError("agent.capability_unavailable", "此运行时尚未接通 MCP 审查");
    if (role.compaction && !this.#runtime.compaction) throw new PrologueAdapterError("agent.capability_unavailable", "上下文整理尚未接通");
    const at = this.#now().toISOString();
    const state = emptyPrologueStreamState();
    const frozen = {
      role_id: role.role_id,
      role_version: role.version,
      execution: role.execution,
      model_id: model.model,
      ...(role.compaction ? { compaction: { prompt_id: role.compaction.prompt.prompt_id, version: role.compaction.prompt.version, above_tokens: role.compaction.above_tokens } } : {}),
      prompts: role.prompts.map((prompt) => ({
        prompt_id: prompt.prompt_id,
        version: prompt.version,
        layer: promptLayerOf(prompt),
      })),
      skills: (role.skills ?? []).map(({ body: _body, ...definition }) => ({ ...definition, tools: [...definition.tools] })),
      mcp_tools: request.mcp_tools ?? [],
      mcp_sources: request.mcp_sources ?? [],
      host_tools: [...role.host_tools],
      text_materials: textMaterials.map((material) => ({
        material_id: material.material_id,
        title: material.title,
        source_artifact_id: material.source_artifact_id,
        source_version: material.source_version,
      })),
      budget: request.budget ?? null,
      directory: request.directory,
    };

    const started = await this.#runtime.startAgentRun({
      provenance: { frozen, started_at: at },
      session_id: request.session.session_id,
      root_path: request.directory.canonical_path,
      model,
      character: {
        id: role.role_id,
        version: role.version,
        name: role.role_id,
        instructions: role.prompts.map((prompt) => prompt.body).join("\n\n"),
        tools: [...role.host_tools],
      },
      ...(role.compaction ? { compaction: { prompt: role.compaction.prompt.body, above_tokens: role.compaction.above_tokens } } : {}),
      task: request.task,
      text_materials: textMaterials,
      skills: role.skills ?? [],
      mcp_tools: request.mcp_tools ?? [],
      mcp_sources: request.mcp_sources ?? [],
      mode,
    });

    const ref: AgentRunRef = {
      run_id: started.run.ref.id,
      session_id: request.session.session_id,
    };
    const view: AgentRunView = {
      ref,
      phase: "starting",
      frozen,
      turns: [{ turn_id: "user-1", kind: "user", text: request.task, at, sequence: 0 }],
      activity: [],
      usage: state.usage,
      awaiting_input: [],
      started_at: at,
      ended_at: null,
    };
    state.turns.push(view.turns[0]!);

    const record: RunRecord = {
      view,
      state,
      control: started.control,
      unsubscribe: () => {},
      listeners: new Set(),
    };
    this.#runs.set(ref.run_id, record);
    session.runs.push(ref);

    let initialPromptPending = true;
    const unsubscribeEvents = started.run.subscribe((event) => {
      // The Host already displays the submitted task before SDK replay starts.
      if (event.type === "prompt" && event.role === "user" && initialPromptPending) {
        initialPromptPending = false;
        if (event.text === request.task) return;
      }
      if (!applyPrologueEvent(record.state, event, this.#now().toISOString())) return;
      // An effect the Run is stopped on goes in front of the user before
      // anything else happens. Failing to mirror it must not look like the
      // effect was allowed, so the failure is recorded on the run instead.
      if (isAwaitingApproval(event)) void this.#mirror(ref, event);
      this.#publish(ref.run_id);
    });
    const unsubscribeControl = started.control.subscribe(() => this.#publish(ref.run_id));
    record.unsubscribe = () => { unsubscribeEvents(); unsubscribeControl(); };
    this.#publish(ref.run_id);
    return { ref, frozen };
  }

  async read(run: AgentRunRef): Promise<AgentRunView> {
    const session = await this.#loadSession(run.session_id);
    if (!session.runs.some(item => item.run_id === run.run_id)) throw new PrologueAdapterError("agent.run_unknown", "这次执行不属于此会话");
    const record = this.#requireRun(run.run_id);
    const view = structuredClone(record.view);
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
    return view;
  }

  observe(run: AgentRunRef, listener: (view: AgentRunView) => void): () => void {
    const record = this.#requireRun(run.run_id);
    record.listeners.add(listener);
    listener(structuredClone(record.view));
    return () => {
      record.listeners.delete(listener);
    };
  }

  async control(run: AgentRunRef, control: AgentRunControl): Promise<void> {
    await this.read(run);
    const record = this.#requireRun(run.run_id);
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
      case "steer":
        await record.control.steer({ text: control.text });
        break;
      case "answer": {
        const answer = this.#answerPending;
        if (answer === undefined) {
          throw new PrologueAdapterError(
            "agent.capability_unavailable",
            "没有接上回答通道，这条问题回答不了",
          );
        }
        const question = record.state.awaiting_input.find(item => item.pending_id === control.pending_id);
        if (!question || isEnded(record.view.phase) || question.pending_revision !== control.pending_revision) {
          throw new PrologueAdapterError("agent.pending_not_open", "这条问题不属于本轮当前等待，不能提交答案");
        }
        await answer(run, control);
        // The Run owns whether the question is closed; drop it from the view
        // only after the execution owner accepted the answer.
        settleProloguePending(record.state, control.pending_id);
        break;
      }
    }
    this.#publish(run.run_id);
  }

  async readCommandOutput(
    session: AgentSessionRef,
    ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput> {
    const record = await this.#loadSession(session.session_id);
    if (ref.run_id && !record.runs.some(run => run.run_id === ref.run_id)) throw new PrologueAdapterError("agent.run_unknown", "这轮执行不属于所选会话");
    if (!this.#runtime.readCommandOutput) throw new PrologueAdapterError("agent.capability_unavailable", "这个 Runtime 没有接通命令回执");
    return this.#runtime.readCommandOutput(session.session_id, ref);
  }

  /** Release the underlying Runtime. The Host owns when this happens. */
  async close(): Promise<void> {
    this.#detachApprovalAnswers?.();
    for (const record of this.#runs.values()) record.unsubscribe();
    await Promise.all([...this.#runs.values()].map(record => record.timingCommit));
    await this.#runtime.shutdown();
  }

  /**
   * Control owns pause/stop intent. A terminal event is published only after
   * Prologue has committed the session ledger. Never expose a terminal control
   * state before that event: the next Run would read incomplete history.
   */
  #publish(runId: string, stampTerminal = true): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    const controlPhase = prologuePhaseOf(record.control.state);
    const awaitingCommit = isEnded(controlPhase) && !isEnded(record.state.phase);
    let phase = controlPhase === "running" || awaitingCommit ? record.state.phase : controlPhase;
    let stopReason = awaitingCommit
      ? controlPhase === "stopped" || controlPhase === "cancelled"
        ? "已请求停止，正在收尾并保存执行记录"
        : "正在保存本轮执行记录"
      : phase === "stopped" ? "已停止" : record.state.stop_reason;
    if (stampTerminal && isEnded(phase) && this.#runtime.saveRunTiming && !record.timingReady) {
      if (!record.timingCommit) {
        record.observedEndAt = record.view.ended_at ?? this.#now().toISOString();
        const timing: PrologueRunTiming = {
          turns: record.state.turns.map(({ turn_id, at }) => ({ turn_id, at })),
          activity: record.state.activity.map(({ call_id, at }) => ({ call_id, at })),
          ended_at: record.observedEndAt,
        };
        record.timingCommit = Promise.resolve()
          .then(() => this.#runtime.saveRunTiming!(record.view.ref, timing))
          .catch(() => { record.timingError = "显示时间未能保存；执行结果已保存在运行时，重启后部分时间可能未知。"; })
          .then(() => { record.timingReady = true; this.#publish(runId); });
      }
      phase = "running";
      stopReason = "执行已结束，正在保存显示时间";
    }
    if (record.timingError) stopReason = [stopReason, record.timingError].filter(Boolean).join("；");
    record.view = {
      ...record.view,
      phase: phase === "starting" ? "running" : phase,
      turns: [...record.state.turns, ...(record.state.streaming === "" ? [] : [{
        turn_id: `assistant-${record.state.turns.length + 1}`,
        kind: "assistant" as const,
        text: record.state.streaming,
        at: record.state.streaming_at,
        sequence: record.state.streaming_sequence,
      }])],
      activity: [...record.state.activity],
      command_outputs: record.state.command_calls.map(call_id => ({ call_id, run_id: runId })),
      usage: record.state.usage,
      // read() resolves frozen questions through the original Pending owner.
      awaiting_input: record.state.awaiting_input.map((question) => ({
        pending_id: question.pending_id,
        pending_revision: question.pending_revision,
        sequence: question.sequence,
        kind: question.kind,
        prompt: question.why,
        options: [],
        allows_free_text: question.kind === "text",
        ...(this.#runtime.readPendingQuestion ? { answerable: false, unavailable_reason: "正在读取原问题" } : {}),
      })),
      stop_reason: stopReason,
      ...(stampTerminal && isEnded(phase) && record.view.ended_at === null
        ? { ended_at: record.observedEndAt ?? this.#now().toISOString() }
        : {}),
    };
    const snapshot = structuredClone(record.view);
    for (const listener of record.listeners) listener(structuredClone(snapshot));
  }

  async #mirror(run: AgentRunRef, event: AwaitingApproval): Promise<void> {
    const bridge = this.#approvals;
    if (bridge === undefined) return;
    try {
      await bridge.mirrorPending({
        pendingRef: event.pendingRef,
        owner: this.#requireSession(run.session_id).owner,
        run: { ...run },
      });
    } catch (error) {
      const record = this.#runs.get(run.run_id);
      if (record) {
        record.state.activity.push({
          call_id: `approval-mirror-${event.pendingRef.id}`,
          sequence: record.state.next_sequence++,
          name: "approval",
          target: event.effectRef.id,
          state: "failed",
          summary: `没能把这笔待批送进审查面：${error instanceof Error ? error.message : String(error)}`,
          at: this.#now().toISOString(),
        });
        this.#publish(run.run_id);
      }
    }
  }

  #requireSession(sessionId: string) {
    const record = this.#sessions.get(sessionId);
    if (!record) throw new PrologueAdapterError("agent.session_unknown", "找不到这条会话");
    return record;
  }

  async #loadSession(sessionId: string): Promise<SessionRecord> {
    const existing = this.#sessions.get(sessionId);
    if (existing) return existing;
    const held = this.#restoring.get(sessionId);
    if (held) return held;
    const loading = this.#restoreSession(sessionId);
    this.#restoring.set(sessionId, loading);
    try { return await loading; }
    finally { this.#restoring.delete(sessionId); }
  }

  async #restoreSession(sessionId: string): Promise<SessionRecord> {
    const restored = await this.#runtime.sessions.restore?.(sessionId);
    if (!restored) return this.#requireSession(sessionId);
    const session: SessionRecord = { title: restored.title, owner: restored.owner, runs: [],
      ...(restored.recovery ? { recovery: restored.recovery } : {}) };
    for (const saved of restored.runs) {
      const state = emptyPrologueStreamState();
      state.turns.push({ turn_id: "user-1", kind: "user", text: saved.task, at: saved.started_at, sequence: 0 });
      let firstPrompt = true;
      let endedAt: string | null = null;
      for (const event of saved.events ?? []) {
        if (event.type === "prompt" && event.role === "user" && firstPrompt) {
          firstPrompt = false;
          if (event.text === saved.task) continue;
        }
        const atMs = (event as { atMs?: unknown }).atMs;
        const at = typeof atMs === "number" && Number.isFinite(atMs) ? new Date(atMs).toISOString() : null;
        applyPrologueEvent(state, event, at);
        if (isEnded(state.phase) && typeof atMs === "number") endedAt = at;
      }
      if (saved.timing) {
        const turns = new Map(saved.timing.turns.map(item => [item.turn_id, item.at]));
        const activity = new Map(saved.timing.activity.map(item => [item.call_id, item.at]));
        state.turns = state.turns.map(item => turns.has(item.turn_id) ? { ...item, at: turns.get(item.turn_id)! } : item);
        state.activity = state.activity.map(item => activity.has(item.call_id) ? { ...item, at: activity.get(item.call_id)! } : item);
        if (isEnded(state.phase)) endedAt = saved.timing.ended_at;
      }
      for (const question of saved.original_questions ?? []) {
        if (!state.awaiting_input.some(held => held.pending_id === question.pending_id)) state.awaiting_input.push({ ...question, sequence: state.next_sequence++ });
      }
      if (!saved.events || !isEnded(state.phase)) {
        closeInterruptedPrologueStream(state);
        state.phase = "reconcile-required";
        state.stop_reason = "这轮执行在中断前没有提交完整事件账，已发生的操作需要核对；不会自动重跑。";
      }
      if (state.phase === "cancelled" && saved.stop_intent === "stopped") {
        state.phase = "stopped";
        state.stop_reason = "已停止";
      }
      // Replayed records are immutable observations. A new Run continues the
      // same SDK session; old control handles cannot be resurrected.
      const unavailable = (): never => { throw new PrologueAdapterError("agent.capability_unavailable", "历史执行没有活动控制句柄，不能重放停止、回答或继续指令"); };
      const control: PrologueControlPort = { state: state.phase === "reconcile-required" ? "reconcile-required" : "running",
        stop: unavailable, pause: unavailable, resume: unavailable, steer: unavailable, subscribe: () => () => {} };
      const view: AgentRunView = { ref: saved.ref, frozen: saved.frozen, started_at: saved.started_at, ended_at: endedAt,
        phase: state.phase, turns: [], activity: [], usage: state.usage, awaiting_input: [] };
      this.#runs.set(saved.ref.run_id, { view, state, control, unsubscribe: () => {}, listeners: new Set(), timingReady: true });
      session.runs.push(saved.ref);
      this.#publish(saved.ref.run_id, false);
    }
    this.#sessions.set(sessionId, session);
    return session;
  }

  #requireRun(runId: string): RunRecord {
    const record = this.#runs.get(runId);
    if (!record) throw new PrologueAdapterError("agent.run_unknown", "找不到这次执行");
    return record;
  }
}

/** The open catch-all branch in `PrologueEvent` means narrowing needs a real guard. */
type AwaitingApproval = Extract<PrologueEvent, { type: "awaiting-approval" }>;

function isAwaitingApproval(event: PrologueEvent): event is AwaitingApproval {
  if (event.type !== "awaiting-approval") return false;
  const candidate = event as Partial<AwaitingApproval>;
  return typeof candidate.why === "string"
    && typeof candidate.pendingRef?.id === "string"
    && typeof candidate.effectRef?.id === "string";
}

function isEnded(phase: string): boolean {
  return phase === "completed" || phase === "failed"
    || phase === "cancelled" || phase === "stopped";
}
