import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Todo's own error codes, every one `todo.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (SDK `actionHttpStatus`), so Todo keeps no status table of its own.
 */
export const todoErrors = defineErrorCodes("todo", {
  not_found: "not_found",
  conflict: "conflict",
  forbidden: "forbidden",
  invalid: "invalid",
  /** The model answered, but not with a result Todo can use. */
  model_invalid: "invalid",
});
