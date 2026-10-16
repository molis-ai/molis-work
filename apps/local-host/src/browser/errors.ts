import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BrowserProblemCode } from "@molis-ai/molis-work-contracts/services/browser";

export const browserErrors = defineErrorCodes("browser", {
  not_found: "invalid",
  start_failed: "invalid",
  profile_in_use: "invalid",
  load_failed: "invalid",
  blocked_scheme: "invalid",
});

/** The original BrowserError domain, including codes the page state reports without raising. */
export function isBrowserError(error: unknown): error is ActionError & { readonly code: BrowserProblemCode } {
  return error instanceof ActionError && [
    "browser.not_found", "browser.start_failed", "browser.profile_in_use", "browser.crashed",
    "browser.page_crashed", "browser.load_failed", "browser.blocked_scheme",
  ].includes(error.code);
}
