import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// Current Host and review refusals kept their caller-error status at the shared exit.
export const agentErrors = defineErrorCodes("agent", {
  answer_invalid: "invalid",
  capability_unavailable: "invalid",
  directory_unauthorized: "invalid",
  model_not_configured: "invalid",
  pending_not_open: "invalid",
  pending_unknown: "invalid",
  review_already_decided: "invalid",
  review_expired: "invalid",
  review_not_approved: "invalid",
  review_unknown: "invalid",
  role_execution_exceeded: "invalid",
  role_not_declared: "invalid",
  role_not_frozen: "invalid",
  run_unknown: "invalid",
  runtime_duplicate: "invalid",
  runtime_unknown: "invalid",
  session_busy: "invalid",
  session_unknown: "invalid",
});
