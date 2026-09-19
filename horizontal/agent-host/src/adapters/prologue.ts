import type {
  AgentCommandOutput,
  AgentCommandOutputRef,
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
  emptyPrologueStreamState,
  prologuePhaseOf,
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
      | "agent.run_unknown"
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
}

export interface PrologueAdapterPorts {
  /** The current model configuration, or null when the user has not set one. */
  modelConfiguration(): Promise<PrologueModelConfiguration | null>;
}

export interface PrologueRunPort {
  ref: { id: string };
  subscribe(listener: (event: PrologueEvent) => void): () => void;
  cancel(): Promise<void>;
}

export interface PrologueControlPort {
  state: PrologueControlState;
  stop(reason: "stopped" | "cancelled"): void;
  pause(): void;
  resume(): void;
  steer(input: { text: string }): void;
  subscribe(listener: () => void): () => void;
}

export interface PrologueStartInput {
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
  task: string;
  /** Read-only work never asks to write; the Host decides this, not the model. */
  mode: "plan" | "build";
}

export interface PrologueRuntimePort {
  sessions: {
    create(): Promise<{ ref: { id: string } }>;
  };
  startAgentRun(input: PrologueStartInput): Promise<{
    run: PrologueRunPort;
    control: PrologueControlPort;
  }>;
  shutdown(): Promise<unknown>;
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
  /**
   * Narrows the matrix further. Writes and commands stay off until the
   * approval bridge is attached for this Runtime.
   */
  capabilities?: Partial<AgentRuntimeCapabilityMatrix>;
  now?: () => Date;
}

/**
 * What is wired.
 *
 * `text-edit` becomes supported **only when the approval bridge is attached**.
 * Prologue can write either way; the difference is whether the Host recorded a
 * decision first, and that difference is the one rule the platform must not
 * bend.
 *
 * `command` stays unsupported even with the bridge. Running a command is only
 * half of it — a caller then reads the receipt, and this adapter's port has no
 * source for one, so `readCommandOutput` cannot answer. Reporting `command` as
 * supported would make Coding's terminal page render as usable while every read
 * fails, which is the same lie in the other direction.
 */
function currentCapabilities(approvalsAttached: boolean): AgentRuntimeCapabilityMatrix {
  const matrix = emptyCapabilityMatrix();
  if (approvalsAttached) matrix["text-edit"] = "supported";
  matrix["session.create"] = "supported";
  matrix["session.read"] = "supported";
  matrix["run.start"] = "supported";
  matrix["run.observe"] = "supported";
  matrix["run.control"] = "supported";
  matrix.compaction = "supported";
  matrix.usage = "supported";
  return matrix;
}

interface RunRecord {
  view: AgentRunView;
  state: PrologueStreamState;
  control: PrologueControlPort;
  unsubscribe: () => void;
  listeners: Set<(view: AgentRunView) => void>;
}

export class PrologueAgentAdapter implements AgentRuntimeAdapter {
  readonly descriptor: AgentRuntimeDescriptor;
  readonly #runtime: PrologueRuntimePort;
  readonly #ports: PrologueAdapterPorts;
  readonly #now: () => Date;
  readonly #sessions = new Map<string, { title: string; runs: AgentRunRef[] }>();
  readonly #runs = new Map<string, RunRecord>();
  readonly #approvals: PrologueApprovalBridge | undefined;

  constructor(options: PrologueAdapterOptions) {
    this.#runtime = options.runtime;
    this.#ports = options;
    this.#now = options.now ?? (() => new Date());
    this.#approvals = options.approvals;
    this.descriptor = {
      runtime_id: PROLOGUE_RUNTIME_ID,
      display_name: "Prologue",
      provider_version: options.providerVersion ?? "0.0.0-rc.1",
      capabilities: {
        ...currentCapabilities(options.approvals !== undefined),
        ...options.capabilities,
      },
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
    return { ok: true, status: "ready", message: `已连接 ${configuration.model}` };
  }

  async createSession(input: AgentCreateSessionInput): Promise<AgentSessionRef> {
    const session = await this.#runtime.sessions.create();
    this.#sessions.set(session.ref.id, { title: input.title, runs: [] });
    return { session_id: session.ref.id, runtime_id: PROLOGUE_RUNTIME_ID };
  }

  async readSession(session: AgentSessionRef): Promise<AgentSessionView> {
    const record = this.#requireSession(session.session_id);
    const latest = record.runs.at(-1);
    return {
      session: { ...session },
      title: record.title,
      runs: record.runs.map((ref) => ({ ...ref })),
      latest_run: latest ? structuredClone(this.#requireRun(latest.run_id).view) : null,
    };
  }

  async start(request: AgentStartRequest): Promise<AgentRunHandle> {
    const session = this.#requireSession(request.session.session_id);
    const model = await this.#ports.modelConfiguration();
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

    const at = this.#now().toISOString();
    const state = emptyPrologueStreamState();
    const frozen = {
      role_id: role.role_id,
      role_version: role.version,
      execution: role.execution,
      model_id: model.model,
      prompts: role.prompts.map((prompt) => ({
        prompt_id: prompt.prompt_id,
        version: prompt.version,
      })),
      skills: [],
      mcp_tools: request.mcp_tools ?? [],
      host_tools: [...role.host_tools],
      text_materials: (request.text_materials ?? []).map((material) => ({
        material_id: material.material_id,
        source_artifact_id: material.source_artifact_id,
        source_version: material.source_version,
      })),
      budget: request.budget ?? null,
      directory: request.directory,
    };

    const started = await this.#runtime.startAgentRun({
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
      task: request.task,
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
      turns: [{ turn_id: "user-1", kind: "user", text: request.task, at }],
      activity: [],
      usage: state.usage,
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

    record.unsubscribe = started.run.subscribe((event) => {
      if (!applyPrologueEvent(record.state, event, this.#now().toISOString())) return;
      // An effect the Run is stopped on goes in front of the user before
      // anything else happens. Failing to mirror it must not look like the
      // effect was allowed, so the failure is recorded on the run instead.
      if (isAwaitingApproval(event)) void this.#mirror(ref, event);
      this.#publish(ref.run_id);
    });
    this.#publish(ref.run_id);
    return { ref, frozen };
  }

  async read(run: AgentRunRef): Promise<AgentRunView> {
    return structuredClone(this.#requireRun(run.run_id).view);
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
    const record = this.#requireRun(run.run_id);
    switch (control.kind) {
      case "stop":
        record.control.stop("stopped");
        break;
      case "cancel":
        record.control.stop("cancelled");
        break;
      case "pause":
        record.control.pause();
        break;
      case "resume":
        record.control.resume();
        break;
      case "steer":
        record.control.steer({ text: control.text });
        break;
    }
    this.#publish(run.run_id);
  }

  async readCommandOutput(
    _session: AgentSessionRef,
    _ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput> {
    throw new PrologueAdapterError(
      "agent.capability_unavailable",
      "这个 Runtime 没有命令回执的来源，所以读不到；这与是否挂了审批桥无关",
    );
  }

  /** Release the underlying Runtime. The Host owns when this happens. */
  async close(): Promise<void> {
    for (const record of this.#runs.values()) record.unsubscribe();
    await this.#runtime.shutdown();
  }

  /**
   * The control surface owns the run state; the event stream owns the content.
   * Where they disagree about the phase, the control surface wins — it is the
   * one that knows a stop was requested.
   */
  #publish(runId: string): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    const controlPhase = prologuePhaseOf(record.control.state);
    const phase = controlPhase === "running" ? record.state.phase : controlPhase;
    record.view = {
      ...record.view,
      phase: phase === "starting" ? "running" : phase,
      turns: [...record.state.turns],
      activity: [...record.state.activity],
      usage: record.state.usage,
      ...(record.state.stop_reason === undefined
        ? {}
        : { stop_reason: record.state.stop_reason }),
      ...(isEnded(phase) && record.view.ended_at === null
        ? { ended_at: this.#now().toISOString() }
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
        run: { ...run },
        kind: "tool-operation",
        document: {
          kind: "tool-operation",
          tool: event.character ?? "prologue",
          summary: event.why,
          fields: [{ label: "副作用", value: event.effectRef.id }],
        },
      });
    } catch (error) {
      const record = this.#runs.get(run.run_id);
      if (record) {
        record.state.activity.push({
          call_id: `approval-mirror-${event.pendingRef.id}`,
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
