import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const bindingErrors = defineErrorCodes("work.context", {
  user_confirmation_required: "invalid",
  suggestion_not_available: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_required: "invalid",
  idempotency_conflict: "invalid",
  rebind_confirmation_required: "invalid",
  stable_identity_required: "invalid",
  identity_required: "invalid",
  idempotency_key_required: "invalid",
});
export const bindingCatalogErrors = defineErrorCodes("catalog", {
  project_not_found: "not_found",
  invalid_name: "invalid",
});
