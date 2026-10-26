import { applyMemoryContext, applyMemoryRecalled } from "./prologue-memory-stream.js";
import type { PrologueUsageReceipt } from "../inference.js";
import { closeInputs, noteInputEvent, steerOf } from "./prologue-inputs.js";
import type { ModelEvent } from "@prologue/sdk";
export type { PrologueUsageReceipt } from "../inference.js";
export type { TokenCount as PrologueTokenCount } from "@prologue/sdk";
import type {
  AgentRunOffer,
  AgentRunPhase,
  AgentRunUsage,
  AgentRunView,
  AgentToolActivity,
  AgentTodoItem,
  AgentTurnChanges,
  AgentTurnView,
} from "@molis-ai/molis-work-contracts/services/agent-host";
import { SUGGEST_TOOL_PREFIX } from "./prologue-action-tools.js";
import { updateUsage, USAGE_HANDLERS } from "./prologue-stream-usage.js";

/**
 * Projects Prologue's model event stream into contract shapes.
 *
 * Two rules run through it: an unknown frame is kept as an unknown frame rather
 * than counted as progress, and a number the provider never reported is never
 * presented as one it did.
 */

/** The Prologue control states this adapter maps from. */
export type PrologueControlState =
  | "running"
  | "pausing"
  | "paused"
  /** The Run sleeps on its own until a time and then goes on (runtime `sleep`); not waiting for a person. */
  | "sleeping"
  | "stopped"
  | "cancelled"
  | "completed"
  | "failed"
  | "reconcile-required";

/** The event shapes this projection reads. Anything else is left alone. */
export type PrologueEvent =
  | { type: "prompt"; role: "system" | "user"; text: string; steerId?: string; source?: "person" | "app" | "peer"; acceptedAtMs?: number }
  | { type: "text-delta"; text: string }
  | { type: "reasoning-delta"; text: string }
  | { type: "tool-call"; call: { id: string; name: string; input?: Record<string, unknown> } }
  | { type: "tool-result"; callId: string; name: string; text: string; outcome?: "returned" | "failed"; errorCode?: string }
  | { type: "awaiting-approval"; effectRef: { kind: "effect"; id: string; revision: number }; pendingRef: { kind: "pending"; id: string; revision: number }; why: string; character?: string }
  | { type: "awaiting-input"; pendingRef: { id: string; revision?: number }; kind: string; why: string }
  | { type: "usage"; receipt: PrologueUsageReceipt }
  | { type: "usage-recorded"; callId: string; receipt: PrologueUsageReceipt }
  | { type: "compaction-usage-recorded"; callId: string; receipt: PrologueUsageReceipt }
  | { type: "compaction-skipped"; usageRecorded?: boolean }
  | { type: "model-response-repair"; reason: "tool-not-declared" | "output-truncated" | "stop-held" }
  | { type: "compaction-started" }
  | { type: "compacted"; replaced?: number; usageRecorded?: boolean }
  | { type: "compaction-failed"; why?: string }
  | { type: "compaction-cancelled" }
  | { type: "tripped"; stage: "input" | "output"; rail: string; why: string; failed?: boolean }
  | { type: "agent-control"; state: "running" | "pausing" | "paused" | "sleeping"; untilMs?: number }
  | { type: "retry-waiting"; model: string; attempt: number; waitMs: number; retryAtMs: number; reason: "rate-limited" | "unavailable" | "not-sent"; why: string; status?: number }
  | { type: "turn-changes"; turn: number; changes: ReadonlyArray<{ path: string; byteLength: number; digest: string; checkpointId: string }> }
  | { type: "model-switched"; from: { protocol: string; model: string }; to: { protocol: string; model: string } }
  | { type: "memory-recalled"; method?: string; injected?: ReadonlyArray<{ id: string; version: number }>; omitted?: ReadonlyArray<{ id: string; version: number }>; unavailable?: readonly string[];
      retrieval?: { receiptId: string; outcome: "ready" | "none" | "skip" | "unavailable" | "failed" | "timeout" | "cancelled"; errorCode?: string } }
  | { type: "memory-context"; callId: string; status: "prepared" | "not-dispatched" | "dispatched-or-unknown" | "response-observed";
      tokens: number; budgetTokens: number; basis: "conservative-estimate" | "provider-reported";
      references: readonly { receiptId: string; id: string; version: number }[];
      parts: readonly { index: number; tokens: number; form: "entry" | "excerpt" | "summary" }[] }
  | { type: "todo-changed"; items?: ReadonlyArray<{ id?: unknown; text?: unknown; state?: unknown }> }
  | { type: "circuit-tripped"; reason?: string; count?: number; why?: string }
  | { type: "run-recovered"; atMs: number; transcript: "opening-only" | "durable-prefix"; questions?: ReadonlyArray<{ ref: { id: string; revision: number }; kind: string; prompt: string }>; operations: Array<{ summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }> }
  | { type: "completed" }
  | { type: "failed"; why?: string; error?: { code: string; safeMessage: string } }
  | { type: "cancelled" }
  | { type: string; [key: string]: unknown };

export interface PrologueApprovalWaiting {
  pending_id: string;
  effect_id: string;
  pending_revision?: number;
  effect_revision?: number;
  why: string;
  character?: string;
}

export interface PrologueStreamState {
  /** Derived presentation order, not another execution ledger. */
  next_sequence: number;
  command_calls: string[];
  turns: AgentTurnView[];
  activity: AgentToolActivity[];
  usage: AgentRunUsage;
  phase: AgentRunPhase;
  /** Final receipts keyed by network call, never counted again on replay. */
  usage_receipts: Map<string, PrologueUsageReceipt>;
  compaction_receipts: Map<string, PrologueUsageReceipt>;
  compaction_unaccounted: number;
  usage_preview: PrologueUsageReceipt | undefined;
  /** OpenAI-style providers count cached prompt tokens inside input; Anthropic-style report them beside it. */
  prompt_includes_cache?: boolean;
  stop_reason?: string;
  /** Approvals the Run is stopped on. The bridge mirrors these to the Host queue. */
  awaiting_approval: PrologueApprovalWaiting[];
  /** The ledger events its supplements' receipts are projected from (prologue-inputs.ts). */
  input_events: ModelEvent[];
  inputs_closed?: true;
  /** Questions the Run is stopped on, other than approvals. */
  awaiting_input: Array<{ pending_id: string; pending_revision?: number; kind: string; why: string; sequence: number }>;
  /** Frames the contract does not recognize. Kept, never counted as progress. */
  unknown_frames: number;
  /** Open assistant text being streamed in deltas. */
  streaming: string;
  streaming_at: string | null;
  streaming_sequence?: number;
  /** Activity index of the reasoning being streamed; reasoning is shown as activity, never merged into what the model said. */
  reasoning_index?: number;
  /** The SDK is continuing an answer the output limit cut off: its thinking must not close that answer. */
  continuing?: true;
  /** What the Run took from memory at its start (the runtime's own event: references and versions only). */
  memory_recalled?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryRecallFact;
  /** The Run's own step list as the runtime last replaced it. */
  todo?: AgentTodoItem[];
  /** Files each writing turn really changed, from the runtime's `turn-changes` (receipts, not the model's account). */
  turn_changes: AgentTurnChanges[];
  /** What the round suggested, each as its own suggest tool recorded it in its result (never the model's account of it). */
  offers: AgentRunOffer[];
  /** While the Run sleeps on its own: when it wakes. */
  sleeping_until?: string;
  /** While a model call waits to try again: when, and why. */
  retry_wait?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRetryWait;
  /** The model the person switched this Run to (since its last `model-switched`), and one asked for but not yet in effect. */
  model_now?: string;
  model_requested?: string;
}

export function emptyPrologueStreamState(): PrologueStreamState {
  return {
    next_sequence: 1,
    command_calls: [],
    turns: [],
    activity: [],
    usage: { tokens: { input: 0, output: 0 }, unavailable_reason: "运行时尚未报告用量" },
    phase: "starting",
    usage_receipts: new Map(),
    compaction_receipts: new Map(),
    compaction_unaccounted: 0,
    usage_preview: undefined,
    awaiting_approval: [],
    awaiting_input: [],
    input_events: [],
    unknown_frames: 0,
    streaming: "",
    streaming_at: null,
    turn_changes: [],
    offers: [],
  };
}

/**
 * `pausing` stays `running`: Prologue has been asked to pause but has not
 * reached a model boundary, and saying "paused" before it does would be a
 * claim the runtime has not made. `sleeping` is `running` too: the Run goes on
 * by itself and waits for nobody; when it wakes is `sleeping_until`.
 */
export function prologuePhaseOf(state: PrologueControlState): AgentRunPhase {
  return state === "pausing" || state === "sleeping" ? "running" : state;
}

const clip = (value: string) => value.length <= 200 ? value : `${value.slice(0, 200)}…`;

function target(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  // A command is its whole argv: "npm test" says what ran, "npm" alone does not.
  if (typeof input.executable === "string" && input.executable !== "") {
    const words = [input.executable, ...(Array.isArray(input.argv) ? input.argv.map(String) : [])]
      .map(word => word !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`);
    const line = words.join(" ");
    return line.length <= 200 ? line : `${line.slice(0, 200)}…`;
  }
  // A business gateway call names its capability; the surface turns that into the capability's title.
  for (const key of ["path", "file_path", "command", "pattern", "query", "capability_id"]) {
    const value = input[key];
    if (typeof value !== "string" || value === "") continue;
    return value.length <= 200 ? value : `${value.slice(0, 200)}…`;
  }
  return "";
}

const REASONING_LIMIT = 16_384;

/** Reasoning ends when anything else begins: text, a tool call, a prompt, a stop. */
function closeReasoning(state: PrologueStreamState): void {
  const index = state.reasoning_index;
  if (index === undefined) return;
  delete state.reasoning_index;
  const entry = state.activity[index];
  if (entry?.state === "started") state.activity[index] = { ...entry, state: "completed" };
}

function closeStreaming(state: PrologueStreamState): void {
  closeReasoning(state);
  if (state.streaming === "") return;
  state.turns.push({
    turn_id: `assistant-${state.turns.length + 1}`,
    kind: "assistant",
    text: state.streaming,
    at: state.streaming_at,
    sequence: state.streaming_sequence,
  });
  state.streaming = "";
  state.streaming_at = null;
  delete state.streaming_sequence;
}

/** Close the open assistant text without touching reasoning, so text and reasoning keep their order. */
function closeStreamingText(state: PrologueStreamState): void {
  const reasoning = state.reasoning_index;
  delete state.reasoning_index;
  closeStreaming(state);
  if (reasoning !== undefined) state.reasoning_index = reasoning;
}

/**
 * Only the original SDK approval records can prove that a specific call never dispatched. Read them at closure,
 * because a waiting event may have been answered since it was emitted. Missing or ambiguous origins stay unknown.
 */
const AWAITING_APPROVAL_ENDED = "等待批准时这一轮结束，没有执行";

type ApprovalCallReader = (waiting: PrologueApprovalWaiting) => string | undefined;

function closeAwaitingApproval(state: PrologueStreamState, readCall?: ApprovalCallReader): void {
  for (const waiting of state.awaiting_approval) {
    const callId = readCall?.(waiting);
    if (callId === undefined) continue;
    // SDK call ids may repeat. An ambiguous association cannot prove which activity never ran.
    const matches = state.activity.filter(activity => activity.call_id === callId);
    const activity = matches.length === 1 ? matches[0] : undefined;
    if (activity?.state !== "started") continue;
    activity.state = "failed";
    activity.summary = `${activity.name} · ${AWAITING_APPROVAL_ENDED}`;
  }
}

/** A restored prefix is readable history, not a live stream or a tool receipt. */
export function closeInterruptedPrologueStream(state: PrologueStreamState, readCall?: ApprovalCallReader): void {
  closeStreaming(state);
  closeInputs(state);
  closeSleep(state);
  closeAwaitingApproval(state, readCall);
  for (const activity of state.activity) {
    if (activity.state === "started") {
      activity.state = "unknown";
      activity.summary = "运行已中断，未保存此活动的结束结果；请结合核对事实判断。";
    }
  }
  state.usage.unavailable_reason = "中断前用量未完整保存，已报告部分仍保留";
}

/** A Run that ended is not asleep any more: a wait it was in ends with it. */
function closeSleep(state: PrologueStreamState): void {
  if (state.sleeping_until === undefined) return;
  delete state.sleeping_until;
  const asleep = state.activity.find(item => item.name === "sleep-wait" && item.state === "started");
  if (asleep) Object.assign(asleep, { state: "completed", summary: "这一轮在等待中结束" });
}

/** Marks one activity as a desktop step. Stripped before the person reads the target. */
const DESKTOP_STEP = "\u0000desktop";
const desktopSurfaces = new WeakMap<PrologueStreamState, Set<string>>();
const desktopObservations = new WeakMap<PrologueStreamState, Set<string>>();

function remember(map: WeakMap<PrologueStreamState, Set<string>>, state: PrologueStreamState, id: string): void {
  const ids = map.get(state) ?? new Set<string>();
  ids.add(id);
  map.set(state, ids);
}

/** The desk a round was given, when the desktop is attached: the round's start returns it and its attempt keeps it. */
export interface RoundDesk { readonly desktop_target?: string }

/**
 * A run's stream state before its first event, the same for a run just started and one restored. A call to the round's
 * desk is a desktop step whether or not the round listed the surfaces: the desk is held across a session's rounds, so a
 * later round can use its id without listing again.
 */
export function runStreamState(promptIncludesCache: boolean, desk: RoundDesk): PrologueStreamState {
  const state = emptyPrologueStreamState();
  state.prompt_includes_cache = promptIncludesCache;
  if (desk.desktop_target) remember(desktopSurfaces, state, desk.desktop_target);
  return state;
}

/** Surface ids from a surface-list result (`id — desktop, open`). Returns whether any desktop was listed. */
function rememberDesktopSurfaces(state: PrologueStreamState, text: string): boolean {
  const pattern = /^(\S+) — desktop,/gm;
  let found = false;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    remember(desktopSurfaces, state, match[1]!);
    found = true;
  }
  return found;
}

/** An observation produced by looking at a desktop surface, so the later action on it is a desktop step. */
function rememberDesktopObservation(state: PrologueStreamState, text: string): void {
  const match = /^observation (\S+) /m.exec(text);
  if (match?.[1]) remember(desktopObservations, state, match[1]);
}

function desktopCall(state: PrologueStreamState, name: string, input: Record<string, unknown> | undefined): boolean {
  const targetId = typeof input?.target === "string" ? input.target : "";
  const observationId = typeof input?.observation === "string" ? input.observation : "";
  if ((name === "surface-observe" || name === "surface-act") && targetId !== "" && desktopSurfaces.get(state)?.has(targetId)) return true;
  return name === "surface-act" && observationId !== "" && (desktopObservations.get(state)?.has(observationId) ?? false);
}

function noteToolCall(state: PrologueStreamState, event: Extract<PrologueEvent, { type: "tool-call" }>, at: string | null): boolean {
  const call = event.call;
  closeStreaming(state);
  const named = call.name === "ask-user" ? askedOf(call.input) ?? target(call.input) : target(call.input);
  state.activity.push({
    call_id: call.id,
    name: call.name,
    target: desktopCall(state, call.name, call.input) ? DESKTOP_STEP : named,
    state: "started",
    summary: call.name,
    at,
    sequence: state.next_sequence++,
  });
  return true;
}

function noteToolResult(state: PrologueStreamState, event: Extract<PrologueEvent, { type: "tool-result" }>, at: string | null): boolean {
  const index = state.activity.findIndex((entry) => entry.call_id === event.callId);
  if (index < 0) return false;
  const prior = state.activity[index]!;
  const listed = event.name === "surface-list" && rememberDesktopSurfaces(state, event.text);
  if (event.name === "surface-observe" && prior.target === DESKTOP_STEP) rememberDesktopObservation(state, event.text);
  if (event.name.startsWith(SUGGEST_TOOL_PREFIX) && event.outcome === "returned") rememberOffer(state, event.text);
  state.activity[index] = {
    ...prior,
    state: event.outcome === "failed" ? "failed" : event.outcome === "returned" ? "completed" : "unknown",
    summary: event.errorCode ? `${event.name} · ${event.errorCode}` : event.name,
    output: event.text.slice(0, 16_384),
    output_truncated: event.text.length > 16_384,
    at,
    ...(listed ? { target: DESKTOP_STEP } : {}),
  };
  return true;
}

/** A suggestion the round's own suggest tool recorded: its result carries the offer exactly as checked, once per id. */
function rememberOffer(state: PrologueStreamState, text: string): void {
  let offer: AgentRunOffer | undefined;
  try { offer = (JSON.parse(text) as { offer?: AgentRunOffer }).offer; } catch { return; /* not a record the tool wrote */ }
  if (!offer || typeof offer.offer_id !== "string" || state.offers.some(held => held.offer_id === offer!.offer_id)) return;
  state.offers.push(offer);
}

function applyResponseRepair(state: PrologueStreamState, frame: PrologueEvent, at: string | null): boolean {
  const event = frame as Extract<PrologueEvent, { type: "model-response-repair" }>;
  if (event.reason === "output-truncated") {
    // One answer in several calls: what the model writes next joins the text it was cut off in.
    state.continuing = true;
    const sequence = state.next_sequence++;
    state.activity.push({ call_id: `model-continue-${sequence}`, name: "接着写", target: "回答",
      state: "completed", summary: "回答写到单次输出上限，已让模型从断开处接着写", at, sequence });
    return true;
  }
  if (event.reason === "stop-held") {
    // The round said what it would do and did nothing: the Host let it continue, once. Shown, not hidden.
    closeStreaming(state);
    const sequence = state.next_sequence++;
    state.activity.push({ call_id: `model-held-${sequence}`, name: "自动续做", target: "上一段只说了要做什么，没有实际执行",
      state: "completed", summary: "这一轮只说明了接下来要做什么、没有调用工具，已让它接着实际去做（每轮最多一次）", at, sequence });
    state.phase = "running";
    return true;
  }
  if (event.reason !== "tool-not-declared") return false;
  closeStreaming(state);
  const sequence = state.next_sequence++;
  state.activity.push({ call_id: `model-repair-${sequence}`, name: "工具调用纠正", target: "未开放的工具",
    state: "completed", summary: "已拦下这批调用并加入纠正要求",
    output: "这批工具请求均未执行，纠正要求已加入本轮上下文；已有结果保留。后续仍受预算与停止控制，是否恢复成功以实际执行结果为准。", at, sequence });
  state.phase = "running";
  return true;
}

// The Run replaced its own step list (update-todo): the latest list stands as a whole, as the runtime keeps it.
function applyTodoChanged(state: PrologueStreamState, event: PrologueEvent, _at: string | null): boolean {
  const items = (event as Extract<PrologueEvent, { type: "todo-changed" }>).items ?? [];
  const states = new Set<AgentTodoItem["state"]>(["pending", "in-progress", "done", "abandoned"]);
  state.todo = items.flatMap(item => typeof item.id === "string" && typeof item.text === "string" && states.has(item.state as AgentTodoItem["state"])
    ? [{ id: item.id, text: item.text, state: item.state as AgentTodoItem["state"] }] : []);
  return true;
}

// The runtime's circuit breaker stopped a round that kept failing the same way (it settles the run as stopped and
// sends nothing more): the round has ended, and says why, instead of waiting for a close that never comes.
function applyCircuitTripped(state: PrologueStreamState, event: PrologueEvent, _at: string | null): boolean {
  const tripped = event as Extract<PrologueEvent, { type: "circuit-tripped" }>;
  closeStreaming(state);
  closeSleep(state);
  state.phase = "stopped";
  const count = tripped.count ?? "几";
  const what = tripped.reason === "repeated-calls" ? `同一个调用连续重复了 ${count} 次，没有进展`
    : tripped.reason === "repeated-text" ? `同样的话连续重复了 ${count} 次`
    : tripped.reason === "repeated-errors" ? `连续 ${count} 次调用都没有成功`
    : `连续 ${count} 次调用都没有成功${tripped.why ? `（${tripped.why}）` : ""}`;
  state.stop_reason = `${what}，这一轮先停在这里；已完成的保留，可以说明怎么调整后继续`;
  return true;
}

// The person's (or the Run's own) control of the Run changed. Only sleeping says something the phase does not.
function applyAgentControl(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const control = event as Extract<PrologueEvent, { type: "agent-control" }>;
  const asleep = state.activity.findIndex(item => item.name === "sleep-wait" && item.state === "started");
  if (control.state === "sleeping" && typeof control.untilMs === "number" && Number.isFinite(control.untilMs)) {
    closeStreaming(state);
    const until = new Date(control.untilMs).toISOString();
    state.sleeping_until = until;
    if (asleep >= 0) Object.assign(state.activity[asleep]!, { target: until, at });
    else state.activity.push({ call_id: `sleep-${state.next_sequence}`, name: "sleep-wait", target: until, state: "started",
      summary: "按自己的安排等一会儿，到点自动接着做", at, sequence: state.next_sequence++ });
    return true;
  }
  if (state.sleeping_until === undefined) return false;
  delete state.sleeping_until;
  if (asleep >= 0) Object.assign(state.activity[asleep]!, { state: "completed", summary: "等待结束，接着做", at });
  return true;
}

// What this turn really wrote, from the runtime's write receipts: the timeline shows it and links to the checkpoint.
function applyTurnChanges(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const changed = event as Extract<PrologueEvent, { type: "turn-changes" }>;
  if (!Number.isSafeInteger(changed.turn) || !Array.isArray(changed.changes) || !changed.changes.length
    || state.turn_changes.some(entry => entry.turn === changed.turn)) return false;
  closeStreaming(state);
  state.turn_changes.push({ turn: changed.turn, sequence: state.next_sequence++, at,
    files: changed.changes.map(file => ({ path: file.path, byte_length: file.byteLength, digest: file.digest, checkpoint_id: file.checkpointId })) });
  return true;
}

// The person switched the model during the Run; from the next model call on, calls go to the new one.
function applyModelSwitched(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const switched = event as Extract<PrologueEvent, { type: "model-switched" }>;
  if (typeof switched.to?.model !== "string") return false;
  closeStreaming(state);
  state.model_now = switched.to.model;
  delete state.model_requested;
  const sequence = state.next_sequence++;
  state.activity.push({ call_id: `model-switch-${sequence}`, name: "model-switch", target: `${switched.from?.model ?? ""} → ${switched.to.model}`,
    state: "completed", summary: `从这一次模型调用起改用 ${switched.to.model}；之前的结果与授权不变`, at, sequence });
  return true;
}

function applyRunRecovered(state: PrologueStreamState, event: PrologueEvent, at: string | null, readCall?: ApprovalCallReader): boolean {
  const recovered = event as Extract<PrologueEvent, { type: "run-recovered" }>;
  closeInterruptedPrologueStream(state, readCall);
  const labels = { completed: "已执行", failed: "执行失败（可能部分生效）", "not-dispatched": "未执行", unknown: "结果未知" };
  state.turns.push({ turn_id: `recovery-${state.turns.length + 1}`, kind: "notice", at,
    sequence: state.next_sequence++, text: [recovered.transcript === "durable-prefix"
      ? "中断轮次已结束，已保存的正文、工具过程和核实结果已保留，没有重复执行操作。未记录的末尾过程和完整用量仍未知；继续时需重新核对当前文件。"
      : "中断轮次已结束，原任务与核实结果已保留，没有重复执行操作。流式过程与用量不完整；继续时需重新核对当前文件。",
      ...recovered.operations.map(operation => `${labels[operation.outcome]}：${operation.summary}`)].join("\n") });
  for (const question of recovered.questions ?? []) {
    if (!state.awaiting_input.some(held => held.pending_id === question.ref.id && held.pending_revision === question.ref.revision)) {
      state.awaiting_input.push({ pending_id: question.ref.id, pending_revision: question.ref.revision,
        kind: question.kind, why: question.prompt, sequence: state.next_sequence++ });
    }
  }
  return true;
}

/**
 * A model call that failed and will be tried again (Prologue's `retry-waiting`, emitted just before the wait). The time and
 * the reason are the runtime's; a later wait replaces an earlier one. Nothing is added to the activity: it is not a step.
 */
function applyRetryWaiting(state: PrologueStreamState, event: PrologueEvent): boolean {
  const wait = event as Extract<PrologueEvent, { type: "retry-waiting" }>;
  if (!Number.isFinite(wait.retryAtMs) || !["rate-limited", "unavailable", "not-sent"].includes(wait.reason)) return false;
  state.retry_wait = { until: new Date(wait.retryAtMs).toISOString(), reason: wait.reason, attempt: wait.attempt };
  return true;
}

/** What a model call that is answering, or a Run that ended or stopped to ask, says: the wait to retry is over. */
const ENDS_RETRY_WAIT = new Set(["text-delta", "reasoning-delta", "tool-call", "usage-recorded", "awaiting-approval", "awaiting-input",
  "compaction-started", "tripped", "completed", "failed", "cancelled"]);

type Handler = (state: PrologueStreamState, event: PrologueEvent, at: string | null, readCall?: ApprovalCallReader) => boolean;

function applyPrompt(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const prompt = event as Extract<PrologueEvent, { type: "prompt" }>;
  if (prompt.text === "") return false;
  closeStreaming(state);
  state.turns.push({
    turn_id: `${prompt.role}-${state.turns.length + 1}`,
    kind: prompt.role === "system" ? "system" : prompt.source === "app" ? "notice" : "user",
    text: prompt.text,
    at,
    sequence: state.next_sequence++,
    ...steerOf(prompt.role, prompt.steerId),
  });
  return true;
}

function applyReasoningDelta(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const delta = event as Extract<PrologueEvent, { type: "reasoning-delta" }>;
  if (delta.text === "") return false;
  if (!state.continuing) closeStreamingText(state);
  let index = state.reasoning_index;
  if (index === undefined) {
    index = state.activity.push({ call_id: `reasoning-${state.next_sequence}`, name: "reasoning", target: "", state: "started",
      summary: "推理", output: "", at, sequence: state.next_sequence++ }) - 1;
    state.reasoning_index = index;
  }
  const entry = state.activity[index]!, text = (entry.output ?? "") + delta.text;
  state.activity[index] = { ...entry, output: text.slice(0, REASONING_LIMIT), output_truncated: text.length > REASONING_LIMIT, at };
  return true;
}

function applyTextDelta(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const delta = event as Extract<PrologueEvent, { type: "text-delta" }>;
  if (delta.text === "") return false;
  closeReasoning(state);
  delete state.continuing;
  if (state.streaming === "") {
    state.streaming_at = at;
    state.streaming_sequence = state.next_sequence++;
  }
  state.streaming += delta.text;
  return true;
}

function applyCommandReceipt(state: PrologueStreamState, event: PrologueEvent): boolean {
  const callId = (event as { callId?: unknown }).callId;
  if (typeof callId !== "string") return false;
  if (!state.command_calls.includes(callId)) state.command_calls.push(callId);
  return true;
}

function applyAwaitingApproval(state: PrologueStreamState, event: PrologueEvent): boolean {
  const waiting = event as Extract<PrologueEvent, { type: "awaiting-approval" }>;
  closeStreaming(state);
  state.awaiting_approval.push({
    pending_id: waiting.pendingRef.id,
    effect_id: waiting.effectRef.id,
    ...(waiting.pendingRef.revision === undefined ? {} : { pending_revision: waiting.pendingRef.revision }),
    ...(waiting.effectRef.revision === undefined ? {} : { effect_revision: waiting.effectRef.revision }),
    why: waiting.why,
    ...(waiting.character === undefined ? {} : { character: waiting.character }),
  });
  state.phase = "awaiting-review";
  return true;
}

function applyAwaitingInput(state: PrologueStreamState, event: PrologueEvent): boolean {
  const waiting = event as Extract<PrologueEvent, { type: "awaiting-input" }>;
  if (waiting.kind === "effect-approval") return false;
  closeStreaming(state);
  state.awaiting_input.push({
    pending_id: waiting.pendingRef.id,
    pending_revision: waiting.pendingRef.revision,
    kind: waiting.kind,
    why: waiting.why,
    sequence: state.next_sequence++,
  });
  state.phase = "awaiting-input";
  return true;
}

function applyCompactionStarted(state: PrologueStreamState, _event: PrologueEvent, at: string | null): boolean {
  state.compaction_unaccounted++;
  updateUsage(state);
  closeStreaming(state);
  const sequence = state.next_sequence++;
  state.activity.push({ call_id: `context-compaction-${sequence}`, name: "上下文整理", target: "保留历史原文",
    state: "started", summary: "正在选择继续任务所需的原文片段", output: "正在整理较早上下文；原始会话与执行记录保留。", at, sequence });
  state.phase = "compacting";
  return true;
}

function applyCompactionEnded(state: PrologueStreamState, event: PrologueEvent, at: string | null): boolean {
  const activity = [...state.activity].reverse().find(item => item.name === "上下文整理" && item.state === "started");
  const succeeded = event.type === "compacted";
  const skipped = event.type === "compaction-skipped";
  if (activity && (succeeded || skipped) && event.usageRecorded === true) state.compaction_unaccounted = Math.max(0, state.compaction_unaccounted - 1);
  updateUsage(state);
  const replaced = (event as { replaced?: number }).replaced;
  const message = succeeded
    ? `已整理较早上下文${Number.isSafeInteger(replaced) ? `（替换 ${replaced} 条模型可见记录）` : ""}；当前要求与保留原文继续生效，原始会话未删除。`
    : skipped ? "整理结果未缩短上下文，原上下文继续保留。" : event.type === "compaction-cancelled" ? "上下文整理已取消，原上下文未被替换。" : "上下文整理失败，原上下文未被替换；窗口还放得下就接着用它，放不下这一轮会停下。";
  if (activity) Object.assign(activity, { state: succeeded || skipped ? "completed" : "failed", summary: message, output: message, at });
  state.phase = "running";
  // A failed compaction is not the round's end: the round goes on while its history fits, and says so if it stops.
  if (event.type === "compaction-cancelled") state.stop_reason = message;
  return true;
}

/** The round's end: what it was streaming closes, a wait it slept in ends, and the phase says how it ended. */
function endRound(state: PrologueStreamState, phase: AgentRunPhase, stopReason?: string, readCall?: ApprovalCallReader): boolean {
  closeStreaming(state);
  closeSleep(state);
  closeAwaitingApproval(state, readCall);
  state.phase = phase;
  if (stopReason !== undefined) state.stop_reason = stopReason;
  return true;
}

function applyTripped(state: PrologueStreamState, event: PrologueEvent, _at: string | null, readCall?: ApprovalCallReader): boolean {
  const tripped = event as Extract<PrologueEvent, { type: "tripped" }>;
  // A guardrail stop is terminal but is not a failure of the work.
  return endRound(state, "stopped", tripped.failed === true
    ? `护栏 ${tripped.rail} 自身出错，已按绊停处理`
    : `被护栏 ${tripped.rail} 拦下：${tripped.why}`, readCall);
}

function applyFailed(state: PrologueStreamState, event: PrologueEvent, _at: string | null, readCall?: ApprovalCallReader): boolean {
  const failed = event as Extract<PrologueEvent, { type: "failed"; why?: string }>;
  return endRound(state, "failed", failed.error?.code === "RUN_INTERRUPTED" ? "本轮因中断结束。已核实的操作已保留，可输入新要求继续。"
    : failed.error?.code?.startsWith("CONTEXT_COMPACTION") ? "上下文整理失败，原上下文未被替换，而它已放不下模型窗口，这一轮停下了；可以点继续再整理一次。"
    : failed.error === undefined
    ? failed.why ?? "运行时报告失败"
    : `${failed.error.code}: ${failed.error.safeMessage}`, readCall);
}

/**
 * Neither counted as progress nor dropped: the stream carried something this contract does not know, and that fact is
 * worth keeping.
 */
function applyUnknown(state: PrologueStreamState): boolean {
  state.unknown_frames += 1;
  return true;
}

/** Every event the stream reads, by type; anything else is an unknown frame. */
const HANDLERS: Readonly<Record<string, Handler>> = {
  prompt: applyPrompt,
  "reasoning-delta": applyReasoningDelta,
  "text-delta": applyTextDelta,
  "command-receipt": applyCommandReceipt,
  "tool-call": (state, event, at) => noteToolCall(state, event as Extract<PrologueEvent, { type: "tool-call" }>, at),
  "tool-result": (state, event, at) => noteToolResult(state, event as Extract<PrologueEvent, { type: "tool-result" }>, at),
  "awaiting-approval": applyAwaitingApproval,
  "awaiting-input": applyAwaitingInput,
  ...USAGE_HANDLERS,
  "compaction-started": applyCompactionStarted,
  ...Object.fromEntries(["compacted", "compaction-skipped", "compaction-failed", "compaction-cancelled"].map(type => [type, applyCompactionEnded])),
  tripped: applyTripped,
  completed: (state, _event, _at, readCall) => endRound(state, "completed", undefined, readCall),
  failed: applyFailed,
  cancelled: (state, _event, _at, readCall) => endRound(state, "cancelled", "已取消", readCall),
  "model-response-repair": applyResponseRepair,
  "memory-recalled": applyMemoryRecalled,
  "memory-context": applyMemoryContext,
  "todo-changed": applyTodoChanged,
  "circuit-tripped": applyCircuitTripped,
  "agent-control": applyAgentControl,
  "retry-waiting": applyRetryWaiting,
  "turn-changes": applyTurnChanges,
  "model-switched": applyModelSwitched,
  "run-recovered": applyRunRecovered,
  // Facts about supplements: applyRunEvent projects them into the receipts; the stream itself has nothing to show.
  ...Object.fromEntries(["steer-applied", "steer-read", "steer-withdrawn", "inputs-acknowledged"].map(type => [type, () => false])),
};

/**
 * Apply one event of a round to its view: the stream itself, then its supplements' receipts, which the runtime projects
 * from the same events. Returns true when the view changed.
 */
export function applyRunEvent(state: PrologueStreamState, event: PrologueEvent, at: string | null, readCall?: ApprovalCallReader): boolean {
  const waited = state.retry_wait !== undefined && ENDS_RETRY_WAIT.has(event.type);
  if (waited) delete state.retry_wait;
  const changed = (Object.hasOwn(HANDLERS, event.type) ? HANDLERS[event.type]! : applyUnknown)(state, event, at, readCall) || waited;
  return noteInputEvent(state, event) || changed;
}

/**
 * The facts a Run's view carries beside its turns, as the projection holds them now: what it took from memory, its own
 * step list, the files each turn wrote, a wait it sleeps in. A fact that no longer holds is not carried forward.
 */
export function withRunFacts(state: PrologueStreamState, ended: boolean, view: AgentRunView, memory?: { class_restrictions?: AgentRunView["class_restrictions"]; current_scene?: string }): AgentRunView {
  const { memory_recalled: _memory, todo: _todo, turn_changes: _changes, sleeping_until: _asleep, retry_wait: _retry, model_switch: _switch, offers: _offers, ...rest } = view;
  const requested = ended ? undefined : state.model_requested;
  return {
    ...rest,
    ...(memory?.class_restrictions ? { class_restrictions: structuredClone(memory.class_restrictions), memory_scene: memory.current_scene } : {}),
    ...(state.memory_recalled ? { memory_recalled: structuredClone(state.memory_recalled) } : {}),
    ...(state.todo?.length ? { todo: state.todo.map(item => ({ ...item })) } : {}),
    ...(state.turn_changes.length ? { turn_changes: structuredClone(state.turn_changes) } : {}),
    ...(state.offers.length ? { offers: structuredClone(state.offers) } : {}),
    ...(state.sleeping_until !== undefined && !ended ? { sleeping_until: state.sleeping_until } : {}),
    ...(state.retry_wait && !ended ? { retry_wait: { ...state.retry_wait } } : {}),
    ...(state.model_now || requested ? { model_switch: { ...(state.model_now ? { now: state.model_now } : {}), ...(requested ? { requested } : {}) } } : {}),
  };
}

/** Clear one pending from the waiting list once it has been answered. */
/**
 * What a question to the person reads as in the round: a questionnaire's own question (its first, and how many more),
 * else the text it asked with. The `why` of a questionnaire is the model's reason for asking — MiniMax-M3 writes it
 * about the person (“用户拒绝删除这条待办……”) — so it is not what the person reads as the question.
 */
function askedOf(input: Record<string, unknown> | undefined): string | undefined {
  const questions = Array.isArray(input?.questions) ? input!.questions as Array<{ prompt?: unknown }> : [];
  const first = questions.find(item => typeof item?.prompt === "string" && item.prompt.trim());
  if (first) return clip(`${String(first.prompt).trim()}${questions.length > 1 ? `（等 ${questions.length} 个问题）` : ""}`);
  return typeof input?.why === "string" ? clip(input.why) : undefined;
}

export function settleProloguePending(state: PrologueStreamState, pendingId: string): boolean {
  const before = state.awaiting_approval.length + state.awaiting_input.length;
  state.awaiting_approval = state.awaiting_approval
    .filter((item) => item.pending_id !== pendingId);
  state.awaiting_input = state.awaiting_input.filter((item) => item.pending_id !== pendingId);
  const after = state.awaiting_approval.length + state.awaiting_input.length;
  if (after === before) return false;
  if (after === 0 && (state.phase === "awaiting-review" || state.phase === "awaiting-input")) {
    state.phase = "running";
  }
  return true;
}
