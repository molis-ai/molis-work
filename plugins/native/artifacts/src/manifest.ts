import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ARTIFACT_BROWSER_UI_CONTRIBUTION_ID } from "./browser-ui.js";

export const ARTIFACTS_PLUGIN_ID = "io.molis.work.artifacts";
/** What the project database stores for this Plugin. */
export const ARTIFACTS_PROJECT_PLUGIN_ID = "artifacts";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const artifactsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: ARTIFACTS_PLUGIN_ID,
  version: "1.1.0",
  name: "Artifacts",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-artifacts-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [{ artifact_type_id: "io.molis.work.document", schema_version: 1 }],
    consumes: [{ artifact_type_id: "io.molis.work.document", schema_version: 1 }],
  },
  ui: {
    contributions: [ARTIFACT_BROWSER_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "browser", slot: "navigator", title: "Artifacts", contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, icon: "package", order: 60 },
    ],
  },
};
