import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * PPT's own error codes, every one `ppt.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so PPT keeps no status table of its own. Every status is the one PPT's own route answered before.
 */
export const pptErrors = defineErrorCodes("ppt", {
  invalid: "invalid",
  not_found: "not_found",
  /** The record changed since the caller read it. */
  conflict: "conflict",
  /** Saving a 成果 was interrupted or conflicts with what the 成果库 holds; the presentation and the earlier record are kept. */
  publication_pending: "conflict",
  publication_conflict: "conflict",
  publication_owner: "forbidden",
});
