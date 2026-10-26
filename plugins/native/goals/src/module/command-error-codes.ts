import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

const goals_board = defineErrorCodes("goals.board", {
  exists: "invalid",
  not_found: "invalid",
});

const goals_event = defineErrorCodes("goals.event", {
  not_found: "invalid",
});

const goals_goal = defineErrorCodes("goals.goal", {
  acceptance_invalid: "invalid",
  already_satisfied: "invalid",
  archive_state_unchanged: "invalid",
  archived: "invalid",
  decomposition_review_invalid: "invalid",
  exists: "invalid",
  input_source_missing: "invalid",
  not_satisfied: "invalid",
  title_required: "invalid",
  trash_reason_required: "invalid",
  trash_record_missing: "invalid",
  trashed: "invalid",
});

const goals_goal_tree_proposal = defineErrorCodes("goals.goal_tree_proposal", {
  relation_not_active: "invalid",
  relation_type_invalid: "invalid",
});

const goals = defineErrorCodes("goals", {
  not_found: "invalid",
});

const goals_planning = defineErrorCodes("goals.planning", {
  user_confirmation_required: "invalid",
});

const goals_policy = defineErrorCodes("goals.policy", {
  confirmation_required: "invalid",
  invalid: "invalid",
});

const goals_project_guidance = defineErrorCodes("goals.project_guidance", {
  action_invalid: "invalid",
  already_active: "invalid",
  already_inactive: "invalid",
  duplicate: "invalid",
  entry_too_large: "invalid",
  inactive: "invalid",
  invalid: "invalid",
  kind_invalid: "invalid",
  no_changes: "invalid",
  not_found: "invalid",
  total_too_large: "invalid",
  user_confirmation_required: "invalid",
});

const goals_relation = defineErrorCodes("goals.relation", {
  already_exists: "invalid",
  deactivation_reason_required: "invalid",
  not_active: "invalid",
  not_found: "invalid",
  reason_required: "invalid",
  self_reference: "invalid",
});

const goals_request = defineErrorCodes("goals.request", {
  idempotency_key_reused: "invalid",
  invalid: "invalid",
});

export const commandErrors = {
  "goals.board.exists": goals_board.exists,
  "goals.board.not_found": goals_board.not_found,
  "goals.event.not_found": goals_event.not_found,
  "goals.goal.acceptance_invalid": goals_goal.acceptance_invalid,
  "goals.goal.already_satisfied": goals_goal.already_satisfied,
  "goals.goal.archive_state_unchanged": goals_goal.archive_state_unchanged,
  "goals.goal.archived": goals_goal.archived,
  "goals.goal.decomposition_review_invalid": goals_goal.decomposition_review_invalid,
  "goals.goal.exists": goals_goal.exists,
  "goals.goal.input_source_missing": goals_goal.input_source_missing,
  "goals.goal.not_satisfied": goals_goal.not_satisfied,
  "goals.goal.title_required": goals_goal.title_required,
  "goals.goal.trash_reason_required": goals_goal.trash_reason_required,
  "goals.goal.trash_record_missing": goals_goal.trash_record_missing,
  "goals.goal.trashed": goals_goal.trashed,
  "goals.goal_tree_proposal.relation_not_active": goals_goal_tree_proposal.relation_not_active,
  "goals.goal_tree_proposal.relation_type_invalid": goals_goal_tree_proposal.relation_type_invalid,
  "goals.not_found": goals.not_found,
  "goals.planning.user_confirmation_required": goals_planning.user_confirmation_required,
  "goals.policy.confirmation_required": goals_policy.confirmation_required,
  "goals.policy.invalid": goals_policy.invalid,
  "goals.project_guidance.action_invalid": goals_project_guidance.action_invalid,
  "goals.project_guidance.already_active": goals_project_guidance.already_active,
  "goals.project_guidance.already_inactive": goals_project_guidance.already_inactive,
  "goals.project_guidance.duplicate": goals_project_guidance.duplicate,
  "goals.project_guidance.entry_too_large": goals_project_guidance.entry_too_large,
  "goals.project_guidance.inactive": goals_project_guidance.inactive,
  "goals.project_guidance.invalid": goals_project_guidance.invalid,
  "goals.project_guidance.kind_invalid": goals_project_guidance.kind_invalid,
  "goals.project_guidance.no_changes": goals_project_guidance.no_changes,
  "goals.project_guidance.not_found": goals_project_guidance.not_found,
  "goals.project_guidance.total_too_large": goals_project_guidance.total_too_large,
  "goals.project_guidance.user_confirmation_required": goals_project_guidance.user_confirmation_required,
  "goals.relation.already_exists": goals_relation.already_exists,
  "goals.relation.deactivation_reason_required": goals_relation.deactivation_reason_required,
  "goals.relation.not_active": goals_relation.not_active,
  "goals.relation.not_found": goals_relation.not_found,
  "goals.relation.reason_required": goals_relation.reason_required,
  "goals.relation.self_reference": goals_relation.self_reference,
  "goals.request.idempotency_key_reused": goals_request.idempotency_key_reused,
  "goals.request.invalid": goals_request.invalid,
} as const;
