import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/** Work Brief's own error codes, every one `work_brief.<reason>`; the kind decides the status at the Host's edge (SDK `actionHttpStatus`). */
export const workBriefErrors = defineErrorCodes("work_brief", {
  /** The brief or version is not there, or not in the caller's scope. */
  not_found: "not_found",
  /** The brief changed since the caller read it. */
  conflict: "conflict",
  /** A proposal still has conflicts to settle; no further draft is taken until then. */
  proposal_pending: "conflict",
  /** A cite of the draft cannot be read as the caller; `details` names the claim and the object. */
  cite_unreadable: "invalid",
  /** A fixed version is read-only. */
  fixed: "conflict",
  /** The draft's shape is wrong: a claim with no basis, an unknown choice. */
  invalid: "invalid",
  too_large: "invalid",
  /** The object of a next step moved on, or its action is no longer offered: the old card does not run. */
  option_stale: "conflict",
  /** The service this needs (the Home library, the artifact store, the action directory) is not given here. */
  unavailable: "conflict",
});
