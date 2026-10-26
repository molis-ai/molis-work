import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The Artifacts plugin's own error codes (the plugin-facing client's, `plugin_denied` and `plugin_incompatible`, are the module's `pluginArtifactErrors`), every one `artifacts.<reason>`. The kind is the sort of failure, and the Host's edge turns it
 * into the status (SDK `actionHttpStatus`), so the plugin keeps no status of its own. (The document import's codes are `artifacts.document.<reason>`,
 * declared next to the import: `documentErrors` in document-import.ts; they become `artifacts.*` with the rest of the owner's prefixes, W3-02 R4b.)
 */
export const artifactsErrors = defineErrorCodes("artifacts", {
  /** A 成果 route names a version that is not a positive integer, or an id that does not decode. */
  reference_invalid: "invalid",
  /** The version a route names is not in this project. */
  version_not_found: "not_found",
  /** The version has no file to hand back. */
  file_missing: "not_found",
  /** The version cannot be continued in the plugin the person chose. */
  continue_unavailable: "invalid",
  /** A `project://` reference needs the project's workspace, and the project has none the Host can confirm. */
  workspace_unconfirmed: "conflict",
});
