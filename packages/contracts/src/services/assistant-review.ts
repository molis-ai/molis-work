// One of the Assistant's types, kept in its own file so `services/assistant.ts` stays under the size limit. Read through
// `services/assistant`, which re-exports it; this file is not a subpath of its own.

import type { ReviewReference } from "../platform/reviews.js";
import type { AgentReviewDecisions } from "./agent-host-reviews.js";

/** The kind of the one confirmation the Host itself holds, not the runtime: 「接着做下一步？」 of a work that asks before each step (PWA-156). */
export const ASSISTANT_NEXT_STEP_REVIEW = "next-step";

export interface AssistantPendingReview {
  review_id: string;
  version: string;
  /** The canonical review reference shared with the review queue and task decision card (APR-16). */
  reference?: ReviewReference;
  /** The original execution owner determines which decisions this pending can still accept. */
  decisions: AgentReviewDecisions;
  /** The original live approval can offer a separate permission for future rounds. */
  permission_available?: true;
  /** What is held: a business change, a file edit, a command, an MCP call… The fields read accordingly. */
  kind: string;
  run_id: string | null;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  requested_at: string;
  expires_at: string | null;
}
