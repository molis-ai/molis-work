import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// These module refusals keep the Catalog's current caller-error classification.
const projectErrors = defineErrorCodes("catalog", {
  invalid_name: "invalid",
  plugin_not_found: "invalid",
  project_not_found: "invalid",
  project_storage_invalid: "invalid",
});
const workspaceErrors = defineErrorCodes("catalog.context", {
  user_confirmation_required: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_membership_not_found: "invalid",
  workspace_required: "invalid",
});

export const catalogErrors = { ...projectErrors, ...workspaceErrors };
