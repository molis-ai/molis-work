import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const surfaceErrors = defineErrorCodes("surfaces", {
  correction_conflict: "conflict",
});
