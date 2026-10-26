import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ARTIFACT_BROWSER_UI_CONTRIBUTION_ID } from "./browser-ui.js";

import { ARTIFACT_EN } from "./en.js";
export const ARTIFACTS_PLUGIN_ID = "io.molis.work.artifacts";
/** What the project database stores for this Plugin. */
export const ARTIFACTS_PROJECT_PLUGIN_ID = "artifacts";

/**
 * The shell of the 成果 page: its project key, its view and its words. The actions, the permissions over them and the 成果 type the
 * 成果库 writes are the platform's (`modules/artifacts`, PG-077); the Host registers them as a platform provider and declares the
 * type as its own producer, so this Manifest declares none of them. It goes with the project key's maintenance (PG-077 step 2).
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const artifactsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: ARTIFACTS_PLUGIN_ID,
  version: "0.3.0",
  name: "成果",
  summary: "项目的固定成果，各版本可回看。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-artifacts-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    translations: ARTIFACT_EN,
    contributions: [ARTIFACT_BROWSER_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "browser", slot: "navigator", title: "成果", contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, icon: "package", hue: "pink", order: 60, group: "make" },
    ],
  },
};
