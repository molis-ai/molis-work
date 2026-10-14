import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// Keep the Catalog's current transport classification; project absence is a 404.
const projectErrors = defineErrorCodes("catalog", {
  invalid_name: "invalid",
  plugin_not_found: "invalid",
  project_not_found: "not_found",
  project_storage_invalid: "invalid",
});
const workspaceErrors = defineErrorCodes("catalog.context", {
  user_confirmation_required: "invalid",
  workspace_default_unsupported: "invalid",
  workspace_membership_not_found: "invalid",
  workspace_required: "invalid",
});

export const catalogErrors = { ...projectErrors, ...workspaceErrors };
