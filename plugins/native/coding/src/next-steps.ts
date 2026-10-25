import type { InteractionNextStep } from "@molis-ai/molis-work-contracts/platform/ui";
import type { CodingText } from "./words.js";

/** The part of a round its follow-ups read: the same view its round card is drawn from (timeline.ts). */
export interface CodingFollowUpRun {
  ref: { run_id: string };
  phase: string;
  activity?: ReadonlyArray<{ name: string; state: string; target?: string | null }>;
}

const ENDED = new Set(["completed", "failed", "stopped", "cancelled", "reconcile-required"]);

/**
 * A follow-up's id is the selector of the round card's control it presses, so the page presses that control and nothing
 * else (specs/context-program FLOW-01): there is no second way to continue a round or open its changes. When the control
 * is not on screen, the step does nothing.
 */
export const CODING_NEXT_STEP = {
  recover: (runId: string) => `[data-coding-recover-continue=${JSON.stringify(runId)}]`,
  changes: (runId: string) => `[data-coding-change-open=${JSON.stringify(runId)}]`,
} as const;

/** What follows a round on its card, as next steps beside the composer: check and continue, then its changes, in Coding's words. */
export function codingFollowUps(run: CodingFollowUpRun, say: CodingText): InteractionNextStep[] {
  if (!ENDED.has(run.phase)) return [];
  const steps: InteractionNextStep[] = [];
  if (run.phase === "reconcile-required") steps.push({ id: CODING_NEXT_STEP.recover(run.ref.run_id), label: say("coding.round.check-continue"), source: say("coding.round.reconcile") });
  // The card offers its changes when the round wrote a file, counted the way the card counts them.
  if (run.activity?.some(item => (item.name === "edit" || item.name === "write") && item.state === "completed" && item.target))
    steps.push({ id: CODING_NEXT_STEP.changes(run.ref.run_id), label: say("coding.round.changes"), source: say("coding.round.changed-files") });
  return steps;
}
