import type {
  AgentRunPhase,
  AgentRunUsage,
  AgentUsageCoverage,
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
  | { type: "prompt"; role: "system" | "user"; text: string; steerId?: string }
  | { type: "steer-applied"; steerId: string }
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
  | { type: "model-response-repair"; reason: "tool-not-declared" }
  | { type: "compaction-started" }
  | { type: "compacted"; replaced?: number; usageRecorded?: boolean }
  | { type: "compaction-failed"; why?: string }
  | { type: "compaction-cancelled" }
  | { type: "tripped"; stage: "input" | "output"; rail: string; why: string; failed?: boolean }
  | { type: "run-recovered"; atMs: number; transcript: "opening-only" | "durable-prefix"; questions?: ReadonlyArray<{ ref: { id: string; revision: number }; kind: string; prompt: string }>; operations: Array<{ summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }> }
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
  compaction_receipts: Map<string, PrologueUsageReceipt>;
  compaction_unaccounted: number;
  usage_preview: PrologueUsageReceipt | undefined;
  /** OpenAI-style providers count cached prompt tokens inside input; Anthropic-style report them beside it. */
  prompt_includes_cache?: boolean;
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
  /** Activity index of the reasoning being streamed; reasoning is shown as activity, never merged into what the model said. */
  reasoning_index?: number;
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
  // A command is its whole argv: "npm test" says what ran, "npm" alone does not.
  if (typeof input.executable === "string" && input.executable !== "") {
    const words = [input.executable, ...(Array.isArray(input.argv) ? input.argv.map(String) : [])]
      .map(word => word !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`);
    const line = words.join(" ");
    return line.length <= 200 ? line : `${line.slice(0, 200)}…`;
  }
  for (const key of ["path", "file_path", "command", "pattern", "query"]) {
    const value = input[key];
    if (typeof value !== "string" || value === "") continue;
    return value.length <= 200 ? value : `${value.slice(0, 200)}…`;
  }
  return "";
}

function updateUsage(state: PrologueStreamState): void {
  const compaction = state.compaction_receipts.size || state.compaction_unaccounted
    ? { recorded_calls: state.compaction_receipts.size, incomplete: state.compaction_unaccounted > 0 } : undefined;
  const receipts = [...state.compaction_receipts.values(), ...state.usage_receipts.values(), ...(state.usage_preview ? [state.usage_preview] : [])];
  if (!receipts.length) {
    if (compaction) state.usage = { ...state.usage, compaction };
    return;
  }
  const aggregate = (values: Array<{ source: string; value: number | undefined }>) => {
    const known = values.filter(item => item.source !== "unknown" && item.value !== undefined && Number.isFinite(item.value) && item.value >= 0);
    const estimated = known.some(item => item.source !== "reported");
    const partial = known.length !== values.length;
    const coverage: AgentUsageCoverage = !known.length ? "unknown" : partial
      ? estimated ? "partial-estimated" : "partial" : estimated ? "estimated" : "reported";
    return { value: known.length ? known.reduce((sum, item) => sum + item.value!, 0) : undefined, coverage };
  };
  const token = (field: "input" | "output" | "cacheRead" | "cacheWrite") => aggregate(receipts.map(r => ({ source: r[field].source, value: r[field].tokens })));
  const input = token("input"), output = token("output"), read = token("cacheRead"), write = token("cacheWrite");
  const cost = aggregate(receipts.map(r => ({ source: r.cost.currency === "USD" ? r.cost.source : "unknown", value: r.cost.amount })));
  const unknown = [input, output].some(item => ["unknown", "partial", "partial-estimated"].includes(item.coverage));
  const estimated = [input, output].some(item => item.coverage.includes("estimated"));
  // The window in use is the latest main call's whole prompt; compaction calls size a different request.
  const latest = state.usage_preview ?? [...state.usage_receipts.values()].at(-1);
  const prompt = latest ? [latest.input, ...(state.prompt_includes_cache ? [] : [latest.cacheRead, latest.cacheWrite])] : [];
  const context = prompt.length && prompt[0]!.source !== "unknown" && prompt[0]!.tokens !== undefined ? {
    tokens: prompt.reduce((sum, count) => sum + (count.source === "unknown" || count.tokens === undefined ? 0 : count.tokens), 0),
    coverage: (prompt.every(count => count.source === "reported") ? "reported" : prompt.some(count => count.source === "unknown") ? "partial" : "estimated") as AgentUsageCoverage,
  } : undefined;
  state.usage = {
    ...(context ? { context } : {}),
    ...(compaction ? { compaction } : {}),
    tokens: {
      input: input.value ?? 0, output: output.value ?? 0,
      ...(read.value === undefined ? {} : { cached_input: read.value }),
      ...(write.value === undefined ? {} : { cache_creation: write.value }),
    },
    ...(cost.value === undefined ? {} : { cost_usd: cost.value }),
    coverage: { input: input.coverage, output: output.coverage, cached_input: read.coverage, cache_creation: write.coverage, cost_usd: cost.coverage },
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

/** A restored prefix is readable history, not a live stream or a tool receipt. */
export function closeInterruptedPrologueStream(state: PrologueStreamState): void {
  closeStreaming(state);
  closeUnappliedSteers(state);
  for (const activity of state.activity) {
    if (activity.state === "started") {
      activity.state = "unknown";
      activity.summary = "运行已中断，未保存此活动的结束结果；请结合核对事实判断。";
    }
  }
  state.usage.unavailable_reason = "中断前用量未完整保存，已报告部分仍保留";
}

function closeUnappliedSteers(state: PrologueStreamState): void {
  state.turns = state.turns.map(turn => turn.steer?.state === "received"
    ? { ...turn, steer: { ...turn.steer, state: "unconfirmed" } } : turn);
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
        ...(prompt.role === "user" && prompt.steerId !== undefined
          ? { steer: { id: prompt.steerId, state: "received" as const } } : {}),
      });
      return true;
    }

    case "steer-applied": {
      const applied = event as Extract<PrologueEvent, { type: "steer-applied" }>;
      const index = state.turns.findIndex(turn => turn.steer?.id === applied.steerId);
      const turn = state.turns[index];
      if (!turn?.steer) return false;
      state.turns[index] = { ...turn, steer: { ...turn.steer, state: "applied" } };
      return true;
    }

    case "reasoning-delta": {
      const delta = event as Extract<PrologueEvent, { type: "reasoning-delta" }>;
      if (delta.text === "") return false;
      closeStreamingText(state);
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

    case "text-delta": {
      const delta = event as Extract<PrologueEvent, { type: "text-delta" }>;
      if (delta.text === "") return false;
      closeReasoning(state);
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

    case "compaction-usage-recorded": {
      const usage = event as Extract<PrologueEvent, { type: "compaction-usage-recorded" }>;
      if (state.compaction_receipts.has(usage.callId)) return false;
      state.compaction_receipts.set(usage.callId, usage.receipt);
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
      state.compaction_unaccounted++;
      updateUsage(state);
      closeStreaming(state);
      const sequence = state.next_sequence++;
      state.activity.push({ call_id: `context-compaction-${sequence}`, name: "上下文整理", target: "保留历史原文",
        state: "started", summary: "正在选择继续任务所需的原文片段", output: "正在整理较早上下文；原始会话与执行记录保留。", at, sequence });
      state.phase = "compacting";
      return true;
    }

    case "compacted":
    case "compaction-skipped":
    case "compaction-failed":
    case "compaction-cancelled": {
      const activity = [...state.activity].reverse().find(item => item.name === "上下文整理" && item.state === "started");
      const succeeded = event.type === "compacted";
      const skipped = event.type === "compaction-skipped";
      if (activity && (succeeded || skipped) && event.usageRecorded === true) state.compaction_unaccounted = Math.max(0, state.compaction_unaccounted - 1);
      updateUsage(state);
      const replaced = (event as { replaced?: number }).replaced;
      const message = succeeded
        ? `已整理较早上下文${Number.isSafeInteger(replaced) ? `（替换 ${replaced} 条模型可见记录）` : ""}；当前要求与保留原文继续生效，原始会话未删除。`
        : skipped ? "整理结果未缩短上下文，原上下文继续保留。" : event.type === "compaction-cancelled" ? "上下文整理已取消，原上下文未被替换。" : "上下文压缩失败，原上下文未被替换。";
      if (activity) Object.assign(activity, { state: succeeded || skipped ? "completed" : "failed", summary: message, output: message, at });
      state.phase = "running";
      if (!succeeded && !skipped) state.stop_reason = message;
      return true;
    }

    case "tripped": {
      const tripped = event as Extract<PrologueEvent, { type: "tripped" }>;
      closeStreaming(state);
      closeUnappliedSteers(state);
      // A guardrail stop is terminal but is not a failure of the work.
      state.phase = "stopped";
      state.stop_reason = tripped.failed === true
        ? `护栏 ${tripped.rail} 自身出错，已按绊停处理`
        : `被护栏 ${tripped.rail} 拦下：${tripped.why}`;
      return true;
    }

    case "run-recovered": {
      const recovered = event as Extract<PrologueEvent, { type: "run-recovered" }>;
      closeInterruptedPrologueStream(state);
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
    case "completed": {
      closeStreaming(state);
      closeUnappliedSteers(state);
      state.phase = "completed";
      return true;
    }

    case "failed": {
      const failed = event as Extract<PrologueEvent, { type: "failed"; why?: string }>;
      closeStreaming(state);
      closeUnappliedSteers(state);
      state.phase = "failed";
      state.stop_reason = failed.error?.code === "RUN_INTERRUPTED" ? "本轮因中断结束。已核实的操作已保留，可输入新要求继续。" : failed.error === undefined
        ? failed.why ?? "运行时报告失败"
        : `${failed.error.code}: ${failed.error.safeMessage}`;
      return true;
    }

    case "cancelled": {
      closeStreaming(state);
      closeUnappliedSteers(state);
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
