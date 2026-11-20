import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { storedRecordErrors } from "../stored-json.js";

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

const goals_policy = defineErrorCodes("goals.policy", {
  confirmation_required: "invalid",
  invalid: "invalid",
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
  "goals.policy.confirmation_required": goals_policy.confirmation_required,
  "goals.policy.invalid": goals_policy.invalid,
  "goals.relation.already_exists": goals_relation.already_exists,
  "goals.relation.deactivation_reason_required": goals_relation.deactivation_reason_required,
  "goals.relation.not_active": goals_relation.not_active,
  "goals.relation.not_found": goals_relation.not_found,
  "goals.relation.reason_required": goals_relation.reason_required,
  "goals.relation.self_reference": goals_relation.self_reference,
  "goals.request.idempotency_key_reused": goals_request.idempotency_key_reused,
  "goals.request.invalid": goals_request.invalid,
  "goals.storage.record_unreadable": storedRecordErrors.record_unreadable,
} as const;
