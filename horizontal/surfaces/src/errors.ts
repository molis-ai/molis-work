import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const surfaceErrors = defineErrorCodes("surfaces", {
  compose_failed: "internal",
  slot_unknown: "not_found",
  mount_not_declared: "not_found",
  correction_conflict: "conflict",
});
