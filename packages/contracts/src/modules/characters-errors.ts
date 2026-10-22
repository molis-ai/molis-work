import { defineErrorCodes } from "../platform/action-errors.js";

/**
 * The Characters module's refusals, declared once. A draft that changed under the caller is a conflict (409); the others,
 * a missing character included, are 400 (the Host's door answers what the action answers, CHR-1).
 */
export const characterErrors = defineErrorCodes("characters", {
  not_found: "invalid",
  conflict: "conflict",
  deleted: "invalid",
  disabled: "invalid",
  invalid: "invalid",
});
