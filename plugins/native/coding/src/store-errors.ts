import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const codingStoreErrors = defineErrorCodes("coding", {
  session_unknown: "invalid",
  session_duplicate: "invalid",
});
