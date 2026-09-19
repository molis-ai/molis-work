import type {
  AgentReviewRequest,
  AgentRunPhase,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * What can be picked up again after a session was interrupted.
 *
 * Two rules the projection keeps:
 *
 * - **No Runtime state is reconstructed.** A draft comes from the task intent
 *   this Plugin stored locally, never from guessing what the Runtime held. A
 *   restored draft that the user never typed would be worse than none.
 * - **What cannot be recovered is listed, with why.** Dropping it silently
 *   would leave the user believing everything came back.
 */

export type RecoveryPhase = "unavailable" | "nothing-to-recover" | "ready";

export interface RecoveryGap {
  kind: "run" | "pending" | "effect";
  message: string;
}

export interface RecoverableRun {
  run_id: string;
  phase: AgentRunPhase;
  started_at: string;
}

export interface CodingRecoveryView {
  phase: RecoveryPhase;
  unavailable_reason?: string;
  runs: RecoverableRun[];
  /** Approvals that were still waiting when the session was interrupted. */
  reviews: AgentReviewRequest[];
  gaps: RecoveryGap[];
  /** Restored from the locally stored intent. Null when nothing was stored. */
  draft: string | null;
  /** Whether anything here can actually be continued. */
  can_resume: boolean;
}

export interface RecoveryProjectionInput {
  /** False when the Runtime cannot resume sessions at all. */
  supports_resume: boolean;
  runs: readonly RecoverableRun[];
  reviews: readonly AgentReviewRequest[];
  /** The task text this Plugin stored before the interruption. */
  stored_intent: string | null;
  /** Runs the Runtime no longer knows about, by id. */
  lost_run_ids: readonly string[];
  /** Effects that were approved but whose outcome was never recorded. */
  unsettled_effect_ids: readonly string[];
}

const RESUMABLE: ReadonlySet<AgentRunPhase> = new Set<AgentRunPhase>([
  "running", "awaiting-input", "awaiting-review", "paused",
]);

export function projectRecovery(input: RecoveryProjectionInput): CodingRecoveryView {
  if (!input.supports_resume) {
    return {
      phase: "unavailable",
      unavailable_reason: "这个运行时不支持恢复会话",
      runs: [],
      reviews: [],
      gaps: [],
      // The draft still comes back: it is ours, and it does not depend on the
      // Runtime being able to resume anything.
      draft: input.stored_intent,
      can_resume: false,
    };
  }

  const gaps: RecoveryGap[] = [
    ...input.lost_run_ids.map((runId): RecoveryGap => ({
      kind: "run",
      message: `执行 ${runId} 在运行时那边已经找不到了`,
    })),
    ...input.reviews
      .filter((review) => review.expires_at !== null && Date.parse(review.expires_at) < Date.now())
      .map((review): RecoveryGap => ({
        kind: "pending",
        message: `待审 ${review.review_id} 已经过期，需要重新提出`,
      })),
    ...input.unsettled_effect_ids.map((effectId): RecoveryGap => ({
      kind: "effect",
      // Approved is not happened. After an interruption this is the one thing
      // that must not be assumed either way.
      message: `副作用 ${effectId} 批准过但没有回执，无法确定它是否发生`,
    })),
  ];

  const runs = input.runs.filter((run) => !input.lost_run_ids.includes(run.run_id));
  const live = runs.filter((run) => RESUMABLE.has(run.phase));
  const hasAnything = runs.length > 0 || input.reviews.length > 0 || gaps.length > 0;

  return {
    phase: hasAnything ? "ready" : "nothing-to-recover",
    runs: [...runs],
    reviews: [...input.reviews],
    gaps,
    draft: input.stored_intent,
    can_resume: live.length > 0,
  };
}
