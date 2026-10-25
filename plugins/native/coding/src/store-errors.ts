import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const codingStoreErrors = defineErrorCodes("coding", {
  session_unknown: "not_found",
  session_duplicate: "invalid",
});
