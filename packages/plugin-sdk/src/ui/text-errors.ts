import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** The failures of the text tools. Only a binding, a wrong installation and a development path raise them: reading words in production never throws. */
export const uiTextErrors = /* @__PURE__ */ defineErrorCodes("ui", {
  text_ref_invalid: "invalid",
  text_no_context: "internal",
  text_owner_conflict: "conflict",
  text_provider_conflict: "conflict",
});
