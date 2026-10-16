import { defineErrorCodes } from "../platform/action-errors.js";

/** The Attention module's current refusals; Feed maps its own product edge separately. */
export const attentionErrors = defineErrorCodes("attention", {
  entry_not_found: "invalid",
  revision_conflict: "conflict",
  invalid_reference: "invalid",
  invalid_transition: "invalid",
});
