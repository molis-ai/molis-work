import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Dataset's own error codes, every one `dataset.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Dataset keeps no status table of its own. Every status is the one Dataset's own route answered before.
 */
export const datasetErrors = defineErrorCodes("dataset", {
  invalid: "invalid",
  not_found: "not_found",
  /** The record changed since the caller read it. */
  conflict: "conflict",
  /** Saving a 成果 was interrupted or conflicts with what the 成果库 holds; the table and the earlier record are kept. */
  publication_pending: "conflict",
  publication_conflict: "conflict",
  publication_owner: "forbidden",
});
