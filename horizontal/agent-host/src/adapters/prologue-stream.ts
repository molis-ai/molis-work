import type {
  AgentRunPhase,
  AgentRunUsage,
  AgentToolActivity,
  AgentTurnView,
} from "@molis-ai/molis-work-contracts/services/agent-host";

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
  | "stopped"
  | "cancelled"
  | "completed"
  | "failed"
  | "reconcile-required";

export interface PrologueTokenCount {
  tokens: number | undefined;
  source: "reported" | "estimated" | "unknown";
}

export interface PrologueUsageReceipt {
  input: PrologueTokenCount;
  output: PrologueTokenCount;
  cacheRead: PrologueTokenCount;
  cacheWrite: PrologueTokenCount;
  cost: { source: string; amount: number | undefined; currency: string | undefined };
}

/** The event shapes this projection reads. Anything else is left alone. */
export type PrologueEvent =
  | { type: "prompt"; role: "system" | "user"; text: string }
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; call: { id: string; name: string; input?: Record<string, unknown> } }
  | { type: "tool-result"; callId: string; name: string; text: string; outcome?: "returned" | "failed"; errorCode?: string }
  | { type: "awaiting-approval"; effectRef: { kind: "effect"; id: string; revision: number }; pendingRef: { kind: "pending"; id: string; revision: number }; why: string; character?: string }
  | { type: "awaiting-input"; pendingRef: { id: string; revision?: number }; kind: string; why: string }
  | { type: "usage"; receipt: PrologueUsageReceipt }
  | { type: "usage-recorded"; callId: string; receipt: PrologueUsageReceipt }
  | { type: "model-response-repair"; reason: "tool-not-declared" }
  | { type: "compaction-started" }
  | { type: "compacted"; replaced?: number }
  | { type: "compaction-failed"; why?: string }
  | { type: "compaction-cancelled" }
  | { type: "tripped"; stage: "input" | "output"; rail: string; why: string; failed?: boolean }
  | { type: "completed" }
  | { type: "failed"; why?: string; error?: { code: string; safeMessage: string } }
  | { type: "cancelled" }
  | { type: string; [key: string]: unknown };

export interface PrologueApprovalWaiting {
  pending_id: string;
  effect_id: string;
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
  usage_preview: PrologueUsageReceipt | undefined;
  stop_reason?: string;
  /** Approvals the Run is stopped on. The bridge mirrors these to the Host queue. */
  awaiting_approval: PrologueApprovalWaiting[];
  /** Questions the Run is stopped on, other than approvals. */
  awaiting_input: Array<{ pending_id: string; pending_revision?: number; kind: string; why: string; sequence: number }>;
  /** Frames the contract does not recognize. Kept, never counted as progress. */
  unknown_frames: number;
  /** Open assistant text being streamed in deltas. */
  streaming: string;
  streaming_at: string | null;
  streaming_sequence?: number;
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
    usage_preview: undefined,
    awaiting_approval: [],
    awaiting_input: [],
    unknown_frames: 0,
    streaming: "",
    streaming_at: null,
  };
}

/**
 * `pausing` stays `running`: Prologue has been asked to pause but has not
 * reached a model boundary, and saying "paused" before it does would be a
 * claim the runtime has not made.
 */
export function prologuePhaseOf(state: PrologueControlState): AgentRunPhase {
  return state === "pausing" ? "running" : state;
}

function target(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  for (const key of ["path", "file_path", "command", "pattern", "query"]) {
    const value = input[key];
    if (typeof value !== "string" || value === "") continue;
    return value.length <= 200 ? value : `${value.slice(0, 200)}…`;
  }
  return "";
}

function updateUsage(state: PrologueStreamState): void {
  const receipts = [...state.usage_receipts.values(), ...(state.usage_preview ? [state.usage_preview] : [])];
  const unknown = receipts.some((r) => [r.input, r.output].some((c) => c.source === "unknown" || c.tokens === undefined));
  const estimated = receipts.some((r) => [r.input, r.output].some((c) => c.source === "estimated"));
  const sum = (field: "input" | "output" | "cacheRead") => receipts.reduce((total, r) => total + (r[field].tokens ?? 0), 0);
  const cacheKnown = receipts.every((r) => r.cacheRead.source !== "unknown" && r.cacheRead.tokens !== undefined);
  const costKnown = receipts.every((r) => r.cost.source !== "unknown" && r.cost.amount !== undefined && r.cost.currency === "USD");
  state.usage = {
    tokens: {
      input: sum("input"), output: sum("output"),
      ...(cacheKnown ? { cached_input: sum("cacheRead") } : {}),
    },
    ...(costKnown ? { cost_usd: receipts.reduce((total, r) => total + r.cost.amount!, 0) } : {}),
    ...(unknown ? { unavailable_reason: "部分调用用量未知，已知小计不代表完整用量" }
      : estimated ? { unavailable_reason: "用量含保守估算，不全是服务方报的数" } : {}),
  };
}

/** A provider may stream partial cumulative snapshots for a single call. */
function mergeUsage(previous: PrologueUsageReceipt | undefined, next: PrologueUsageReceipt): PrologueUsageReceipt {
  if (!previous) return next;
  const known = (before: PrologueTokenCount, after: PrologueTokenCount) =>
    after.source === "unknown" || after.tokens === undefined ? before : after;
  return {
    input: known(previous.input, next.input), output: known(previous.output, next.output),
    cacheRead: known(previous.cacheRead, next.cacheRead), cacheWrite: known(previous.cacheWrite, next.cacheWrite),
    cost: next.cost.source === "unknown" || next.cost.amount === undefined ? previous.cost : next.cost,
  };
}

function closeStreaming(state: PrologueStreamState): void {
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

/** Apply one event. Returns true when the projection changed. */
export function applyPrologueEvent(
  state: PrologueStreamState,
  event: PrologueEvent,
  at: string | null,
): boolean {
  switch (event.type) {
    case "prompt": {
      const prompt = event as Extract<PrologueEvent, { type: "prompt" }>;
      if (prompt.text === "") return false;
      closeStreaming(state);
      state.turns.push({
        turn_id: `${prompt.role}-${state.turns.length + 1}`,
        kind: prompt.role === "system" ? "system" : "user",
        text: prompt.text,
        at,
        sequence: state.next_sequence++,
      });
      return true;
    }

    case "text-delta": {
      const delta = event as Extract<PrologueEvent, { type: "text-delta" }>;
      if (delta.text === "") return false;
      if (state.streaming === "") {
        state.streaming_at = at;
        state.streaming_sequence = state.next_sequence++;
      }
      state.streaming += delta.text;
      return true;
    }

    case "command-receipt": {
      if (typeof event.callId !== "string") return false;
      if (!state.command_calls.includes(event.callId)) state.command_calls.push(event.callId);
      return true;
    }
    case "tool-call": {
      const call = (event as Extract<PrologueEvent, { type: "tool-call" }>).call;
      closeStreaming(state);
      state.activity.push({
        call_id: call.id,
        name: call.name,
        target: target(call.input),
        state: "started",
        summary: call.name,
        at,
        sequence: state.next_sequence++,
      });
      return true;
    }

    case "tool-result": {
      const result = event as Extract<PrologueEvent, { type: "tool-result" }>;
      const index = state.activity.findIndex((entry) => entry.call_id === result.callId);
      if (index < 0) return false;
      state.activity[index] = {
        ...state.activity[index]!,
        state: result.outcome === "failed" ? "failed" : result.outcome === "returned" ? "completed" : "unknown",
        summary: result.errorCode ? `${result.name} · ${result.errorCode}` : result.name,
        output: result.text.slice(0, 16_384),
        output_truncated: result.text.length > 16_384,
        at,
      };
      return true;
    }

    case "awaiting-approval": {
      const waiting = event as Extract<PrologueEvent, { type: "awaiting-approval" }>;
      closeStreaming(state);
      state.awaiting_approval.push({
        pending_id: waiting.pendingRef.id,
        effect_id: waiting.effectRef.id,
        why: waiting.why,
        ...(waiting.character === undefined ? {} : { character: waiting.character }),
      });
      state.phase = "awaiting-review";
      return true;
    }

    case "awaiting-input": {
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

    case "usage": {
      const usage = event as Extract<PrologueEvent, { type: "usage" }>;
      state.usage_preview = mergeUsage(state.usage_preview, usage.receipt);
      updateUsage(state);
      return true;
    }
    case "usage-recorded": {
      const usage = event as Extract<PrologueEvent, { type: "usage-recorded" }>;
      if (state.usage_receipts.has(usage.callId)) return false;
      state.usage_receipts.set(usage.callId, usage.receipt);
      state.usage_preview = undefined;
      updateUsage(state);
      return true;
    }

    case "model-response-repair": {
      if (event.reason !== "tool-not-declared") return false;
      closeStreaming(state);
      const sequence = state.next_sequence++;
      state.activity.push({ call_id: `model-repair-${sequence}`, name: "工具调用纠正", target: "未开放的工具",
        state: "completed", summary: "已拦下这批调用并加入纠正要求",
        output: "这批工具请求均未执行，纠正要求已加入本轮上下文；已有结果保留。后续仍受预算与停止控制，是否恢复成功以实际执行结果为准。", at, sequence });
      state.phase = "running";
      return true;
    }

    case "compaction-started": {
      closeStreaming(state);
      const sequence = state.next_sequence++;
      state.activity.push({ call_id: `context-compaction-${sequence}`, name: "上下文整理", target: "保留历史原文",
        state: "started", summary: "正在选择继续任务所需的原文片段", output: "正在整理较早上下文；原始会话与执行记录保留。", at, sequence });
      state.phase = "compacting";
      return true;
    }

    case "compacted":
    case "compaction-failed":
    case "compaction-cancelled": {
      const activity = [...state.activity].reverse().find(item => item.name === "上下文整理" && item.state === "started");
      const succeeded = event.type === "compacted";
      const replaced = (event as { replaced?: number }).replaced;
      const message = succeeded
        ? `已整理较早上下文${Number.isSafeInteger(replaced) ? `（替换 ${replaced} 条模型可见记录）` : ""}；当前要求与保留原文继续生效，原始会话未删除。`
        : event.type === "compaction-cancelled" ? "上下文整理已取消，原上下文未被替换。" : "上下文压缩失败，原上下文未被替换。";
      if (activity) Object.assign(activity, { state: succeeded ? "completed" : "failed", summary: message, output: message, at });
      state.phase = "running";
      if (!succeeded) state.stop_reason = message;
      return true;
    }

    case "tripped": {
      const tripped = event as Extract<PrologueEvent, { type: "tripped" }>;
      closeStreaming(state);
      // A guardrail stop is terminal but is not a failure of the work.
      state.phase = "stopped";
      state.stop_reason = tripped.failed === true
        ? `护栏 ${tripped.rail} 自身出错，已按绊停处理`
        : `被护栏 ${tripped.rail} 拦下：${tripped.why}`;
      return true;
    }

    case "completed": {
      closeStreaming(state);
      state.phase = "completed";
      return true;
    }

    case "failed": {
      const failed = event as Extract<PrologueEvent, { type: "failed"; why?: string }>;
      closeStreaming(state);
      state.phase = "failed";
      state.stop_reason = failed.error === undefined
        ? failed.why ?? "运行时报告失败"
        : `${failed.error.code}: ${failed.error.safeMessage}`;
      return true;
    }

    case "cancelled": {
      closeStreaming(state);
      state.phase = "cancelled";
      state.stop_reason = "已取消";
      return true;
    }

    default: {
      // Neither counted as progress nor dropped: the stream carried something
      // this contract does not know, and that fact is worth keeping.
      state.unknown_frames += 1;
      return true;
    }
  }
}

/** Clear one pending from the waiting list once it has been answered. */
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
