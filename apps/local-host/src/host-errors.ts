import { defineErrorCodes } from "@molis-ai/molis-work-plugin-sdk";

/**
 * The Host's own error codes, every one `host.<reason>`: what the composition root, its HTTP edges and its project hosting raise
 * themselves, outside any one plugin. The kind is the sort of failure, and every edge turns it into the status (SDK `actionHttpStatus`).
 */
export const hostErrors = defineErrorCodes("host", {
  closed: "invalid",
  project_invalid: "invalid",
  project_identity_conflict: "invalid",
  project_closing: "invalid",
  /**
   * A request to the local web host failed its Host, Origin or control-token check. One code for every one of those checks, so the answer
   * never says which check failed (docs/system/SECURITY-INVARIANTS.md S-02, S-03, S-05).
   */
  request_refused: "forbidden",
  /** A `project://` reference that cannot be opened: it is not a safe relative path inside the project, or not a text file the Host may read. */
  project_reference_invalid: "invalid",
  /** The workspace or the file a `project://` reference names is not there. */
  project_reference_not_found: "not_found",
  /** The file a `project://` reference names is over the size the Host opens. */
  project_reference_too_large: "too_large",
  catalog_unavailable: "invalid",
  workspace_unavailable: "invalid",
  workspace_not_found: "invalid",
});
