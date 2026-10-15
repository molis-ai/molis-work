import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const uiHostErrors = defineErrorCodes("ui_host", {
  contribution_conflict: "conflict",
  contribution_not_found: "not_found",
  slot_incompatible: "invalid",
  surface_invalid: "invalid",
  plugin_denied: "forbidden",
});
