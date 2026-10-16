import { defineErrorCodes } from "../platform/action-errors.js";

/**
 * The Characters module's and plugin's refusals, declared once for both. A draft that changed under the caller is a
 * conflict (409). The others keep their current 400; the plugin's HTTP edge maps a missing character to 404 itself.
 */
export const characterErrors = defineErrorCodes("characters", {
  not_found: "invalid",
  conflict: "conflict",
  deleted: "invalid",
  disabled: "invalid",
  invalid: "invalid",
});
