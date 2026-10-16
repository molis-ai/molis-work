import { renderInteractionNextSteps, type InteractionNextStep } from "@molis-ai/molis-work-design-system";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

import { interactionNextSteps } from "./agent-next-steps.js";

type Say = (text: string, values?: Record<string, string | number>) => string;

/** The part of a Coding round its next steps read: the same view its round card is drawn from (plugins/native/coding/src/timeline.ts). */
export interface CodingNextStepRun {
  ref: { run_id: string };
  phase: string;
  awaiting_input: readonly AgentPendingQuestion[];
  activity?: ReadonlyArray<{ name: string; state: string; target?: string | null }>;
}

const ENDED = new Set(["completed", "failed", "stopped", "cancelled", "reconcile-required"]);

/**
 * Coding's own follow-ups. Each one's id is the selector of the round card's control it presses, so the page presses
 * that control and nothing else (FLOW-01): there is no second way to continue a round or open its changes. When the
 * control is not on screen, the step does nothing.
 */
export const CODING_NEXT_STEP = {
  recover: (runId: string) => `[data-coding-recover-continue=${JSON.stringify(runId)}]`,
  changes: (runId: string) => `[data-coding-change-open=${JSON.stringify(runId)}]`,
} as const;

/** A round's next steps, as if it were the latest: its questions first (the same derivation as the Assistant's), then what follows the round. */
export function codingNextSteps(run: CodingNextStepRun, say: Say): InteractionNextStep[] {
  const followUps: InteractionNextStep[] = [];
  if (ENDED.has(run.phase)) {
    if (run.phase === "reconcile-required") followUps.push({ id: CODING_NEXT_STEP.recover(run.ref.run_id), label: say("核对并继续"), source: say("这一轮需要核对结果") });
    // The round card offers its changes when the round wrote a file, counted the way the card counts them.
    if (run.activity?.some(item => (item.name === "edit" || item.name === "write") && item.state === "completed" && item.target))
      followUps.push({ id: CODING_NEXT_STEP.changes(run.ref.run_id), label: say("查看变更"), source: say("这一轮改过的文件") });
  }
  return interactionNextSteps(run.awaiting_input, [], [], followUps, say);
}

/** The row drawn beside Coding's composer for a round; every step is shown, since one row has no room to unfold. */
export function codingStepRow(run: CodingNextStepRun, say: Say): string {
  const steps = codingNextSteps(run, say);
  return steps.length ? renderInteractionNextSteps(steps, say("下一步"), { max: steps.length }) : "";
}
