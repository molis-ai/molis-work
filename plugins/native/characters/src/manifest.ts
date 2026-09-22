import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import { CHARACTERS_UI_CONTRIBUTION_ID } from "./ui.js";

export const CHARACTERS_PROJECT_PLUGIN_ID = "characters";
export const charactersManifest: PluginManifest = {
  schema_version: 2, host_api_version: 2, plugin_id: CHARACTER_PLUGIN_ID, version: "1.0.0", name: "Characters", kind: "app",
  publisher: { publisher_id: "molis", signature: CHARACTER_PUBLISHER_SIGNATURE },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "artifact:read", required: true, reason: "查看当前项目已发布的角色版本" },
    { permission: "artifact:write", required: true, reason: "将本人确认的角色内容发布为当前项目的固定版本" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }], consumes: [{ artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1 }] },
  routes: [
    { route_id: "characters.list", method: "GET", path: "/drafts" },
    { route_id: "characters.create", method: "POST", path: "/drafts" },
    { route_id: "characters.update", method: "PUT", path: "/drafts/:id" },
    { route_id: "characters.state", method: "POST", path: "/drafts/:id/state" },
    { route_id: "characters.publish", method: "POST", path: "/drafts/:id/publish" },
  ],
  ui: { contributions: [CHARACTERS_UI_CONTRIBUTION_ID], views: [
    { view_id: "directory", slot: "navigator", title: "Characters", contribution_id: CHARACTERS_UI_CONTRIBUTION_ID, icon: "user", order: 56 },
  ] },
};
