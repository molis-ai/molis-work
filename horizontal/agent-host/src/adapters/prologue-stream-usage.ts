import type { TokenCount as PrologueTokenCount } from "@prologue/sdk";
import type { AgentUsageCoverage } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueUsageReceipt } from "../inference.js";
import type { PrologueEvent, PrologueStreamState } from "./prologue-stream.js";

/**
 * The Run's usage as its receipts say it: a number the provider never reported is never presented as one it did, and a
 * receipt already counted is not counted again on replay.
 */

export function updateUsage(state: PrologueStreamState): void {
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

/** A call's running snapshot: shown until its final receipt arrives. */
function applyUsage(state: PrologueStreamState, event: PrologueEvent): boolean {
  state.usage_preview = mergeUsage(state.usage_preview, (event as Extract<PrologueEvent, { type: "usage" }>).receipt);
  updateUsage(state);
  return true;
}

function applyUsageRecorded(state: PrologueStreamState, event: PrologueEvent): boolean {
  const usage = event as Extract<PrologueEvent, { type: "usage-recorded" }>;
  if (state.usage_receipts.has(usage.callId)) return false;
  state.usage_receipts.set(usage.callId, usage.receipt);
  state.usage_preview = undefined;
  updateUsage(state);
  return true;
}

function applyCompactionUsageRecorded(state: PrologueStreamState, event: PrologueEvent): boolean {
  const usage = event as Extract<PrologueEvent, { type: "compaction-usage-recorded" }>;
  if (state.compaction_receipts.has(usage.callId)) return false;
  state.compaction_receipts.set(usage.callId, usage.receipt);
  updateUsage(state);
  return true;
}

/** The usage events' handlers, keyed by event type. */
export const USAGE_HANDLERS = {
  usage: applyUsage,
  "usage-recorded": applyUsageRecorded,
  "compaction-usage-recorded": applyCompactionUsageRecorded,
} as const;
