import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const appearanceErrors = defineErrorCodes("appearance", {
  baseline_unavailable: "internal",
  selection_unavailable: "unavailable",
  request_reused: "conflict",
  revision_changed: "conflict",
  revision_exhausted: "unavailable",
  application_missing: "not_found",
  write_failed: "internal",
});
