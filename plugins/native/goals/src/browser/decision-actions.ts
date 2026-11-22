import { GOALS_PLUGIN_ID } from "../identity.js";

/**
 * The protected Goals decisions the page asks the platform to record (`/api/project-approvals/request`). They are the
 * capabilities of `goalEntryActions.decide` and `goalEntryActions.treeDecide`; tests/goals-client-request.test.ts checks this
 * copy against the contract, which the page does not bundle.
 */
export const GOALS_DECISION_ACTIONS = {
  decide: { capability_id: "goals.decisions.record", version: /* @version action.goals.decisions.record */ 1, provider_id: GOALS_PLUGIN_ID },
  treeDecide: { capability_id: "goals.tree.decide", version: /* @version action.goals.tree.decide */ 1, provider_id: GOALS_PLUGIN_ID },
} as const;

/** The reference the platform gave for one decision draft, kept while the draft is unchanged so a retry asks once. */
export interface RetainedDecision {
  readonly encoded: string;
  readonly reference: unknown;
}
