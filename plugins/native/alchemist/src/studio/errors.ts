import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Current domain refusals; operation adapters keep their original public messages and statuses. */
export const alchemistStateErrors = defineErrorCodes("alchemist", {
  idea_card_not_candidate: "invalid",
  idea_card_not_discarded: "invalid",
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
  research_plan_not_found: "invalid",
});
