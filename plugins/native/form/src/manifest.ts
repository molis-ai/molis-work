import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  FORM_ARTIFACT_SCHEMA_VERSION,
  FORM_ARTIFACT_TYPE_ID,
  FORM_PLUGIN_ID,
  FORM_PROJECT_PLUGIN_ID,
} from "@molis-ai/molis-work-contracts/modules/form";
import { FORM_UI_CONTRIBUTION_ID } from "./ui.js";
import { FORM_MCP_EXPORTS } from "./mcp.js";

export { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID };

export const formManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FORM_PLUGIN_ID,
  version: "1.1.0",
  name: "Forms",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-form-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机问卷库" },
    { permission: "artifact:write", required: true, reason: "把问卷存成 Artifact" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [{ artifact_type_id: FORM_ARTIFACT_TYPE_ID, schema_version: FORM_ARTIFACT_SCHEMA_VERSION }],
    consumes: [],
  },
  ui: {
    contributions: [FORM_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Forms", contribution_id: FORM_UI_CONTRIBUTION_ID, icon: "clipboard", order: 57 },
    ],
  },
  mcp_exports: [...FORM_MCP_EXPORTS],
};
