import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** What the plugin-facing artifact client refuses with; every one `artifacts.<reason>`, and the Host's edge turns the kind into the status. */
export const pluginArtifactErrors = defineErrorCodes("artifacts", {
  /** The installation or actor may not use this artifact client. */
  plugin_denied: "forbidden",
  /** The declared artifact type/schema or exchange identity does not match. */
  plugin_incompatible: "invalid",
});
