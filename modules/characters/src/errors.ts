import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// Module actions retain their current 400; the existing Characters HTTP edge has its own status mapping.
export const characterErrors = defineErrorCodes("characters", {
  not_found: "invalid",
  conflict: "invalid",
  deleted: "invalid",
  disabled: "invalid",
  invalid: "invalid",
});
