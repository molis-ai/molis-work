import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Current domain refusals; operation adapters keep their original public messages and statuses. */
export const alchemistStateErrors = defineErrorCodes("alchemist", {
  background_authority_required: "unavailable",
  idea_card_not_candidate: "invalid",
  idea_card_not_discarded: "invalid",
  job_kind_unsupported: "invalid",
  job_lease_active: "conflict",
  job_not_found: "not_found",
  job_not_resumable: "conflict",
  lens_run_exists: "invalid",
  lens_run_not_cancellable: "invalid",
  lens_run_not_found: "invalid",
  opportunity_action_failed: "invalid",
  opportunity_already_converted: "invalid",
  opportunity_cannot_be_converted: "invalid",
  opportunity_cannot_be_dismissed: "invalid",
  opportunity_cannot_be_saved: "invalid",
  opportunity_direction_not_found: "invalid",
  opportunity_not_found: "invalid",
  pulse_no_enabled_sources: "invalid",
  pulse_report_not_found: "invalid",
  research_plan_mismatch: "invalid",
  research_budget_exhausted: "conflict",
  research_plan_not_found: "invalid",
  resume_context_changed: "conflict",
});
