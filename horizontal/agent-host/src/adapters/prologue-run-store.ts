import { PrologueSessionCache } from "./prologue-session-cache.js";
import type { PrologueRunMemoryPort } from "./prologue-run-memory.js";
import type { PrologueMemoryUsage } from "./prologue-memory-usage.js";
import { agentErrors } from "../errors.js";
import type { AgentRecalledMemory, AgentRunRef, AgentRunView, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import type { PrologueAdapterPorts, PrologueControlPort, PrologueModelConfiguration, PrologueRunPort, PrologueRunTiming, PrologueRuntimePort } from "./prologue-ports.js";
import {
  applyRunEvent,
  prologuePhaseOf,
  withRunFacts,
  type PrologueEvent,
  type PrologueStreamState,
} from "./prologue-stream.js";

export interface SessionRecord {
  workspace: "required" | "none" | "business";
  title: string;
  runs: AgentRunRef[];
  owner: AgentSessionView["owner"];
  recovery?: AgentSessionView["recovery"];
}

export interface RunRecord {
  /** Live SDK control only; never restored from persisted history. */
  memory?: PrologueRunMemoryPort;
  view: AgentRunView;
  state: PrologueStreamState;
  control: PrologueControlPort;
  /** The model this Run started with (live runs only): what a switch has to stay compatible with. */
  model?: PrologueModelConfiguration;
  unsubscribe: () => void;
  listeners: Set<(view: AgentRunView) => void>;
  timingCommit?: Promise<void>;
  timingReady?: boolean;
  timingError?: string;
  observedEndAt?: string;
  memory_context?: Pick<AgentRecalledMemory, "consumer" | "usage"> & Partial<Pick<AgentRecalledMemory, "class_restrictions" | "current_scene">>;
}

/**
 * The adapter's sessions and runs as this process holds them: restored once from the runtime, followed while live, and
 * published to their observers as views.
 */
export class PrologueRunStore {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #runs = new Map<string, RunRecord>();
  /** Sessions starting a round, closing an interrupted one or preparing a rewind: one at a time each. */
  readonly #startingSessions = new Set<string>();
  readonly cache: PrologueSessionCache;
  readonly #runtime: PrologueRuntimePort;
  readonly #approvals: PrologueApprovalBridge | undefined;
  readonly now: () => Date;

  constructor(runtime: PrologueRuntimePort, now: () => Date, approvals: PrologueApprovalBridge | undefined, private readonly memoryUsage: PrologueMemoryUsage) {
    this.#runtime = runtime;
    this.now = now;
    this.#approvals = approvals;
    this.cache = new PrologueSessionCache(runtime, this.#sessions, this.#runs, this.#startingSessions, id => this.publish(id, false), ids => memoryUsage.flushRuns(ids));
  }

  get sessions(): ReadonlyMap<string, SessionRecord> { return this.#sessions; }
  get runs(): ReadonlyMap<string, RunRecord> { return this.#runs; }
  get startingSessions(): ReadonlySet<string> { return this.#startingSessions; }

  rememberSession(sessionId: string, session: SessionRecord): void {
    this.#sessions.set(sessionId, session);
  }

  rememberRun(session: SessionRecord, record: RunRecord): void {
    this.#runs.set(record.view.ref.run_id, record);
    session.runs.push(record.view.ref);
  }

  /** The caller has just checked its original busy conditions; hold until all of its work has settled. */
  async withSessionHeld<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    this.#startingSessions.add(sessionId);
    try { return await work(); }
    finally { this.#startingSessions.delete(sessionId); }
  }

  invalidateSession(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }

  reloadSession(sessionId: string): Promise<SessionRecord> {
    this.invalidateSession(sessionId);
    return this.loadSession(sessionId);
  }

  /** A detail restore under way, which a cold status read must wait for rather than race. */
  restoring(sessionId: string): Promise<SessionRecord> | undefined {
    return this.cache.restoring.get(sessionId);
  }

  requireSession(sessionId: string): SessionRecord {
    return this.cache.require(sessionId);
  }

  requireRun(runId: string): RunRecord {
    const record = this.#runs.get(runId);
    if (!record) throw agentErrors.run_unknown("找不到这次执行");
    return record;
  }

  async loadSession(sessionId: string): Promise<SessionRecord> {
    return this.cache.load(sessionId);
  }

  /** The session's latest round has ended (or it has none). */
  latestEnded(session: SessionRecord): boolean {
    const latest = session.runs.at(-1);
    return latest === undefined || isEnded(this.requireRun(latest.run_id).view.phase);
  }

  /**
   * Follow a live round: each event the runtime sends is projected into its view and published, an effect it stops on goes
   * in front of the person, and a control change is published too.
   */
  follow(record: RunRecord, task: string, run: PrologueRunPort, ports: PrologueAdapterPorts): void {
    const ref = record.view.ref, current = this.cache.capture(ref.session_id);
    let initialPromptPending = true;
    const unsubscribeEvents = run.subscribe((event) => {
      try { current(); } catch { return; }
      // The Host already displays the submitted task before SDK replay starts.
      if (event.type === "prompt" && event.role === "user" && initialPromptPending) {
        initialPromptPending = false;
        if (event.text === task) return;
      }
      const at = this.now().toISOString();
      if (!applyRunEvent(record.state, event, at)) return;
      // A held ending reads as what was wrong with it; one that ended still only announcing says nothing was done.
      if (event.type === "model-response-repair" && event.reason === "stop-held") {
        const label = ports.stopHeld?.(ref.run_id), held = [...record.state.activity].reverse().find(item => item.call_id.startsWith("model-held-"));
        if (label && held) Object.assign(held, label);
      }
      if (event.type === "completed" && ports.endedOnPromise?.(ref.run_id, ref.session_id)) {
        const sequence = record.state.next_sequence++;
        record.state.activity.push({ call_id: `model-end-${sequence}`, name: "只说未做", target: "续做后仍没有执行", state: "failed",
          summary: "这一轮只说了接下来要做什么，续做一次后仍没有调用任何工具：什么都没有执行", at, sequence });
      }
      // An effect the Run is stopped on goes in front of the user before
      // anything else happens. Failing to mirror it must not look like the
      // effect was allowed, so the failure is recorded on the run instead.
      if (isAwaitingApproval(event)) void this.#mirror(ref, event);
      this.publish(ref.run_id);
      if (event.type === "memory-context") void this.memoryUsage.record(record, this.requireSession(ref.session_id).owner).then(() => this.publish(ref.run_id));
    });
    const unsubscribeControl = record.control.subscribe(() => this.publish(ref.run_id));
    record.unsubscribe = () => { unsubscribeEvents(); unsubscribeControl(); };
  }

  /**
   * Control owns pause/stop intent. A terminal event is published only after
   * Prologue has committed the session ledger. Never expose a terminal control
   * state before that event: the next Run would read incomplete history.
   */
  publish(runId: string, stampTerminal = true): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    try { this.cache.capture(record.view.ref.session_id)(); } catch { return; }
    const controlPhase = prologuePhaseOf(record.control.state);
    const awaitingCommit = isEnded(controlPhase) && !isEnded(record.state.phase);
    let phase = controlPhase === "running" || awaitingCommit ? record.state.phase : controlPhase;
    let stopReason = awaitingCommit
      ? controlPhase === "stopped" || controlPhase === "cancelled"
        ? "已请求停止，正在收尾并保存执行记录"
        : "正在保存本轮执行记录"
      // A round the runtime (a guardrail or its circuit breaker) or the Host stopped keeps the reason it gave; one the person stopped says so.
      : phase === "stopped" ? (record.state.phase === "stopped" && record.state.stop_reason) || record.control.stopReason || "已停止" : record.state.stop_reason;
    if (stampTerminal && isEnded(phase) && this.#runtime.saveRunTiming && !record.timingReady) {
      if (!record.timingCommit) {
        record.observedEndAt = record.view.ended_at ?? this.now().toISOString();
        const timing: PrologueRunTiming = {
          turns: record.state.turns.map(({ turn_id, at }) => ({ turn_id, at })),
          activity: record.state.activity.map(({ call_id, at }) => ({ call_id, at })),
          ended_at: record.observedEndAt,
        };
        record.timingCommit = Promise.resolve()
          .then(() => this.#runtime.saveRunTiming!(record.view.ref, timing))
          .catch(() => { record.timingError = "显示时间未能保存；执行结果已保存在运行时，重启后部分时间可能未知。"; })
          .then(() => { record.timingReady = true; this.publish(runId); });
      }
      phase = "running";
      stopReason = "执行已结束，正在保存显示时间";
    }
    if (record.timingError) stopReason = [stopReason, record.timingError].filter(Boolean).join("；");
    record.view = withRunFacts(record.state, isEnded(phase), {
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
        ? { ended_at: record.observedEndAt ?? this.now().toISOString() }
        : {}),
    }, record.memory_context);
    const snapshot = structuredClone(record.view);
    for (const listener of record.listeners) listener(structuredClone(snapshot));
  }

  async #mirror(run: AgentRunRef, event: AwaitingApproval): Promise<void> {
    const bridge = this.#approvals;
    if (bridge === undefined) return;
    try {
      await bridge.mirrorPending({
        pendingRef: event.pendingRef,
        owner: this.requireSession(run.session_id).owner,
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
          at: this.now().toISOString(),
        });
        this.publish(run.run_id);
      }
    }
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

export function isEnded(phase: string): boolean {
  return phase === "completed" || phase === "failed"
    || phase === "cancelled" || phase === "stopped";
}
