import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/** Risk's own error codes, every one `risk.<reason>`; the kind decides the status at the Host's edge (SDK `actionHttpStatus`). */
export const riskErrors = defineErrorCodes("risk", {
  invalid: "invalid",
  not_found: "not_found",
  /** The risk changed since the caller read it; `details.current` carries what it is now, for the page to set side by side. */
  conflict: "conflict",
  /** A closed risk is read-only until it is reopened. */
  closed: "conflict",
  /** Schedule, which keeps a risk's reviews, is not installed in the project or does not answer. */
  review_unavailable: "conflict",
});
