import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Lingguang's own error codes, every one `lingguang.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Lingguang keeps no status table of its own. Every status is the one Lingguang's own route answered before.
 */
export const lingguangErrors = defineErrorCodes("lingguang", {
  invalid: "invalid",
  not_found: "not_found",
  /** The spark changed since the caller read it. */
  conflict: "conflict",
  /** A request id was already used for another spark. */
  request_conflict: "conflict",
  /** The conversation's chosen sparks hold more than the model is given; the person chooses fewer. */
  context_too_large: "invalid",
  /** The model answered with nothing; the input is kept and the person can try again. */
  empty_reply: "invalid",
});
