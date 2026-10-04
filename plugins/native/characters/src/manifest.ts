import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import { CHARACTERS_SETTINGS_UI_CONTRIBUTION_ID, CHARACTERS_UI_CONTRIBUTION_ID } from "./ui.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { CHARACTERS_ACTIONS } from "./actions.js";

export const CHARACTERS_PROJECT_PLUGIN_ID = "characters";
export const charactersManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: CHARACTER_PLUGIN_ID, version: "1.6.0", name: "Characters", kind: "app",
  publisher: { publisher_id: "molis", signature: CHARACTER_PUBLISHER_SIGNATURE },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "查看当前项目已发布的角色版本" },
    { permission: "artifact:write", required: true, reason: "将本人确认的角色内容发布为当前项目的固定版本" },
  ],
  capabilities: { provides: [], consumes: [agentHostCapabilities.listActions.capability_id, agentHostCapabilities.listRuntimes.capability_id] },
  actions: CHARACTERS_ACTIONS,
  artifacts: { produces: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1, title: "角色", preview: { capability_id: "characters.artifacts.preview", version: 1 } }], consumes: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }] },
  routes: [
    { route_id: "characters.actions", method: "GET", path: "/actions" },
    { route_id: "characters.discover", method: "POST", path: "/imports/discover" },
    { route_id: "characters.import", method: "POST", path: "/imports" },
    { route_id: "characters.import-file", method: "POST", path: "/imports/file" },
    { route_id: "characters.draft-file", method: "POST", path: "/drafts/:id/file" },
    { route_id: "characters.publication-file", method: "POST", path: "/publication/file" },
    { route_id: "characters.execution", method: "POST", path: "/execution" },
    { route_id: "characters.launch", method: "POST", path: "/execution/native" },
    { route_id: "characters.runs", method: "GET", path: "/drafts/:id/runs" },
    { route_id: "characters.list", method: "GET", path: "/drafts" },
    { route_id: "characters.create", method: "POST", path: "/drafts" },
    { route_id: "characters.update", method: "PUT", path: "/drafts/:id" },
    { route_id: "characters.state", method: "POST", path: "/drafts/:id/state" },
    { route_id: "characters.publish", method: "POST", path: "/drafts/:id/publish" },
  ],
  // A Character is how AI is asked to work: it belongs to the person, beside models and prompts in settings, not among
  // the project's work plugins. Order 35 places it after 助理 in the settings list (settings-sections.ts).
  // The page itself is a stage view (rendered by the project's running plugin, never a navigation entry).
  ui: { contributions: [CHARACTERS_UI_CONTRIBUTION_ID, CHARACTERS_SETTINGS_UI_CONTRIBUTION_ID], views: [
    { view_id: "page", slot: "stage", title: "角色", contribution_id: CHARACTERS_UI_CONTRIBUTION_ID, icon: "user" },
    { view_id: "settings", slot: "settings", title: "角色", contribution_id: CHARACTERS_SETTINGS_UI_CONTRIBUTION_ID, icon: "user", order: 35 },
  ] },
};
