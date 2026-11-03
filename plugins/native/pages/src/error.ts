import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Pages' own error codes, every one `pages.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Pages keeps no status table of its own. Every status is the one Pages' own route answered before.
 */
export const pagesErrors = defineErrorCodes("pages", {
  invalid: "invalid",
  not_found: "not_found",
  /** The document (or folder) changed since the caller read it. */
  conflict: "conflict",
  /** The request cannot proceed in this state: no writing model, a generation still running, an import whose files or choice changed. */
  unavailable: "conflict",
  /** A Markdown text converts to a body over what one Pages document holds; nothing is cut and no body is returned. */
  body_too_large: "invalid",
  /** A Pages file reader cannot read this version of a 成果. */
  unsupported: "invalid",
  /** Saving a 成果 was interrupted or conflicts with what the 成果库 holds; the document and the earlier record are kept. */
  publication_pending: "conflict",
  publication_conflict: "conflict",
  publication_owner: "forbidden",
});
