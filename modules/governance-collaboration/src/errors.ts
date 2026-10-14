import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const decisionErrors = defineErrorCodes("goals.event_decision", {
  conclusion_required: "invalid",
  runtime_dialogue_not_user: "invalid",
  untrusted_actor: "invalid",
});

export const requestErrors = defineErrorCodes("goals.request", {
  idempotency_key_reused: "invalid",
});

export const treeErrors = defineErrorCodes("goals.goal_tree_proposal", {
  confidence_invalid: "invalid",
  not_found: "invalid",
  reason_required: "invalid",
  source_required: "invalid",
  user_confirmation_required: "invalid",
});

export const governanceErrors = defineErrorCodes("goals.governance", {
  transition_invalid: "invalid",
});

export const proposalErrors = {
  "goals.goal_tree_proposal.source_required": treeErrors.source_required,
  "goals.goal_tree_proposal.reason_required": treeErrors.reason_required,
  "goals.goal_tree_proposal.confidence_invalid": treeErrors.confidence_invalid,
  "goals.goal_tree_proposal.user_confirmation_required": treeErrors.user_confirmation_required,
} as const;
