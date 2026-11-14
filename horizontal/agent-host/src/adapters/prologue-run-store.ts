import { restoredSessionRecords } from "./prologue-restored-session.js";
import type { PrologueMemoryUsage } from "./prologue-memory-usage.js";
import { agentErrors } from "../errors.js";
import type { AgentRunRef, AgentRunView, AgentSessionView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueApprovalBridge } from "./prologue-approvals.js";
import type { PrologueAdapterPorts, PrologueControlPort, PrologueModelConfiguration, PrologueRunPort, PrologueRunTiming, PrologueRuntimePort } from "./prologue-ports.js";
import { observeRun, type RoundObserver, type RunObservationStart } from "./prologue-run-observation.js";
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
  memory_binding?: import("./prologue-run-memory.js").RunMemoryBinding;
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
  memory_context?: Pick<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory, "consumer" | "usage"> & Partial<Pick<import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory, "class_restrictions" | "current_scene">>;
}

/**
 * The adapter's sessions and runs as this process holds them: restored once from the runtime, followed while live, and
 * published to their observers as views.
 */
export class PrologueRunStore {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #runs = new Map<string, RunRecord>();
  /** Each followed round's way to record a model request it or a subagent it dispatched sent, by run id. */
  readonly #requests = new Map<string, RoundObserver["request"]>();
  /** Sessions starting a round, closing an interrupted one or preparing a rewind: one at a time each. */
  readonly #startingSessions = new Set<string>();
  readonly #restoring = new Map<string, Promise<SessionRecord>>();
  readonly #runtime: PrologueRuntimePort;
  readonly #approvals: PrologueApprovalBridge | undefined;
  readonly now: () => Date;

  constructor(runtime: PrologueRuntimePort, now: () => Date, approvals: PrologueApprovalBridge | undefined, private readonly memoryUsage: PrologueMemoryUsage) {
    this.#runtime = runtime;
    this.now = now;
    this.#approvals = approvals;
    // A subagent's request goes to the nearest round above it that is followed here, as the child's own work. A request of a run with no
    // followed round above it (none is started outside this store) is not recorded. The store lives as long as the runtime it listens to,
    // so the listener is never taken off; each round's entry in `#requests` goes when the round is no longer followed.
    runtime.listenModelRequests?.((request, lineage) => {
      try {
        const own = this.#requests.get(request.runId);
        if (own) { own(request); return; }
        const parents = lineage(), above = parents.find(id => this.#requests.has(id));
        if (above) this.#requests.get(above)!(request, parents[0]);
      } catch { /* a record that cannot be made never touches the round */ }
    });
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
    return this.#restoring.get(sessionId);
  }

  requireSession(sessionId: string): SessionRecord {
    const record = this.#sessions.get(sessionId);
    if (!record) throw agentErrors.session_unknown("找不到这条会话");
    return record;
  }

  requireRun(runId: string): RunRecord {
    const record = this.#runs.get(runId);
    if (!record) throw agentErrors.run_unknown("找不到这次执行");
    return record;
  }

  async loadSession(sessionId: string): Promise<SessionRecord> {
    const existing = this.#sessions.get(sessionId);
    if (existing) return existing;
    const held = this.#restoring.get(sessionId);
    if (held) return held;
    const loading = this.#restoreSession(sessionId);
    this.#restoring.set(sessionId, loading);
    try { return await loading; }
    finally { this.#restoring.delete(sessionId); }
  }

  /** The session's latest round has ended (or it has none). */
  latestEnded(session: SessionRecord): boolean {
    const latest = session.runs.at(-1);
    return latest === undefined || isEnded(this.requireRun(latest.run_id).view.phase);
  }

  async #restoreSession(sessionId: string): Promise<SessionRecord> {
    const restored = await this.#runtime.sessions.restore?.(sessionId);
    if (!restored) return this.requireSession(sessionId);
    const { session, records } = restoredSessionRecords(restored, (run, waiting) => this.#runtime.unexecutedApprovalCall?.(run, waiting));
    for (const record of records) {
      this.#runs.set(record.view.ref.run_id, record);
      this.publish(record.view.ref.run_id, false);
    }
    this.#sessions.set(sessionId, session);
    return session;
  }

  /**
   * Follow a live round: each event the runtime sends is projected into its view and published, an effect it stops on goes
   * in front of the person, and a control change is published too.
   */
  follow(record: RunRecord, start: RunObservationStart, run: PrologueRunPort, ports: PrologueAdapterPorts): void {
    const ref = record.view.ref, frozen = record.view.frozen;
    let observe: RoundObserver | undefined;
    try {
      const recorder = ports.observeRun?.({ owner: this.requireSession(ref.session_id).owner, ...(frozen.call_id ? { call_id: frozen.call_id } : {}) });
      observe = recorder && observeRun(recorder, ref, frozen, start, record.model);
      if (observe) this.#requests.set(ref.run_id, observe.request);
    } catch { /* No recorder for this round: it runs unrecorded, never held back by the records. */ }
    let initialPromptPending = true;
    const unsubscribeEvents = run.subscribe((event) => {
      // The Host already displays the submitted task before SDK replay starts.
      if (event.type === "prompt" && event.role === "user" && initialPromptPending) {
        initialPromptPending = false;
        if (event.text === start.task) return;
      }
      const at = this.now().toISOString();
      if (!applyRunEvent(record.state, event, at, waiting => this.#runtime.unexecutedApprovalCall?.(ref, waiting))) return;
      try { observe?.event(event); } catch { /* A record that cannot be made never stops or slows the round it describes. */ }
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
    record.unsubscribe = () => { record.memory_binding?.close(); unsubscribeEvents(); unsubscribeControl(); this.#requests.delete(ref.run_id); };
  }

  /**
   * Control owns pause/stop intent. A terminal event is published only after
   * Prologue has committed the session ledger. Never expose a terminal control
   * state before that event: the next Run would read incomplete history.
   */
  publish(runId: string, stampTerminal = true): void {
    const record = this.#runs.get(runId);
    if (!record) return;
    const controlPhase = prologuePhaseOf(record.control.state);
    if (isEnded(controlPhase) || isEnded(record.state.phase)) record.memory_binding?.close();
    const awaitingCommit = isEnded(controlPhase) && !isEnded(record.state.phase);
    let phase = controlPhase === "running" || awaitingCommit ? record.state.phase : controlPhase;
    const stoppedReason = (record.state.phase === "stopped" && record.state.stop_reason) || record.control.stopReason;
    let stopReason = awaitingCommit
      ? controlPhase === "stopped" || controlPhase === "cancelled"
        ? "已请求停止，正在收尾并保存执行记录"
        : "正在保存本轮执行记录"
      // A round the runtime (a guardrail or its circuit breaker) or the Host stopped keeps the reason it gave; one the person stopped says so.
      : phase === "stopped" ? stoppedReason || "已停止" : record.state.stop_reason;
    // "person" is the stop with no reason of its own; a runtime/Host stop keeps its reason. The page checks this code, never the words.
    let stopReasonCode: "person" | "host" | undefined = awaitingCommit ? "host" : phase === "stopped" ? (stoppedReason ? "host" : "person") : undefined;
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
      stop_reason: stopReason, ...(stopReasonCode ? { stop_reason_code: stopReasonCode } : {}),
      ...(stampTerminal && isEnded(phase) && record.view.ended_at === null
        ? { ended_at: record.observedEndAt ?? this.now().toISOString() }
        : {}),
    });
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
