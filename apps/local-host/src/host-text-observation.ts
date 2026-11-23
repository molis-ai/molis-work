import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ObservationDetail } from "@molis-ai/molis-work-contracts/services/observation";
import type { PrologueUsageReceipt } from "@molis-ai/molis-work-service-agent-host";
import type { HostTextReceipt, HostTextRequestOptions } from "./host-complete-text.js";
import { liveObservation } from "./observation-live.js";

/** Bounded text calls use the same work records as Agent runs. The calling action gives each receipt its project and entry. */
export function observeHostTextUsage(home: string, caller: ActionCallContext, promptId: string): HostTextRequestOptions["onReceipt"] {
  const recorder = liveObservation(home)?.sink("agent").bind(caller);
  if (!recorder) return undefined;
  return ({ run_ref, state, configuredModel, reportedModels, usage, protocol, prompt_includes_cache }: HostTextReceipt) => {
    for (const receipt of usage.length ? usage : [undefined]) {
      recorder.record({
        fact: "agent.usage", stage: "inference", outcome: state === "completed" ? "succeeded" : state === "cancelled" ? "cancelled" : "failed",
        work: { run_id: run_ref.id },
        conditions: { model: { provider: protocol, model_id: configuredModel } },
        detail: {
          prompt_id: promptId, prompt_includes_cache,
          ...(reportedModels.length === 1 ? { reported_model: reportedModels[0]! }
            : reportedModels.length > 1 ? { reported_models: JSON.stringify(reportedModels) } : {}),
          ...usageDetail(receipt),
        },
      });
    }
  };
}

function usageDetail(receipt: PrologueUsageReceipt | undefined): ObservationDetail {
  const detail: Record<string, number | string> = {};
  for (const [key, count] of [["input_tokens", receipt?.input], ["output_tokens", receipt?.output],
    ["cache_read_tokens", receipt?.cacheRead], ["cache_write_tokens", receipt?.cacheWrite]] as const) {
    detail[`${key}_source`] = count?.source ?? "unknown";
    if (count && count.source !== "unknown" && count.tokens !== undefined) detail[key] = count.tokens;
  }
  const cost = receipt?.cost;
  detail.cost_source = cost?.source ?? "unknown";
  if (cost && cost.source !== "unknown" && cost.amount !== undefined && cost.currency) {
    detail.cost = cost.amount;
    detail.currency = cost.currency;
  }
  return detail;
}
