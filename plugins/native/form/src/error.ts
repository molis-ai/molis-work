import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Form's own error codes, every one `form.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Form keeps no status table of its own. Every status is the one Form's own route answered before.
 */
export const formErrors = defineErrorCodes("form", {
  invalid: "invalid",
  not_found: "not_found",
  /** The record changed since the caller read it. */
  conflict: "conflict",
  /** Saving a 成果 was interrupted or conflicts with what the 成果库 holds; the form and the earlier record are kept. */
  publication_pending: "conflict",
  publication_conflict: "conflict",
  publication_owner: "forbidden",
  /** The form is not collecting answers; the refusal says why and how to open it again. */
  closed: "conflict",
  /** An answer to the questions 「AI 生成题目」 asked first does not fit them; `details.problems` names each field and why. */
  answer_invalid: "invalid",
  /** A submission's request id was already used for different answers. */
  request_conflict: "conflict",
});
