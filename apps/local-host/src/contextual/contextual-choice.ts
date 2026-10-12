import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualCandidate, SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import { contextualCandidates } from "@molis-ai/molis-work-kernel/contextual";
import { contextualErrors } from "./contextual-request.js";

/**
 * The candidate the person chose: still offered for exactly this context and still available. Whatever acts on a choice (preparing
 * its input, drafting it) starts here, so a choice made on a context that has since moved on is refused the same way everywhere.
 */
export function chosenCandidate(views: readonly ActionView[], focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string): ContextualCandidate {
  const candidate = contextualCandidates(views, focus, landing).find(item => item.key === key);
  if (!candidate) throw contextualErrors.stale("这个动作已不在当前内容的候选里，请重新选择");
  if (!candidate.available) throw contextualErrors.unavailable(candidate.reason ?? "这个动作现在不可用");
  return candidate;
}
