import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** Inbox's own error codes, every one `inbox.<reason>`. */
export const inboxErrors = defineErrorCodes("inbox", {
  entry_not_found: "not_found",
  invalid: "invalid",
  /** The scene binding changed since the caller read it. */
  revision_conflict: "conflict",
});
