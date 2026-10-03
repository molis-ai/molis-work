import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  PPT_ARTIFACT_SCHEMA_VERSION,
  PPT_ARTIFACT_TYPE_ID,
  PPT_PLUGIN_ID,
  PPT_PROJECT_PLUGIN_ID,
} from "@molis-ai/molis-work-contracts/modules/ppt";
import { PPT_UI_CONTRIBUTION_ID } from "./ui.js";
import { pptActions, PPT_ACTION_PERMISSIONS } from "./actions.js";
import { pptContentActions } from "./content-actions.js";
import { PPT_MCP_EXPORTS } from "./mcp.js";

export { PPT_PLUGIN_ID, PPT_PROJECT_PLUGIN_ID };

export const pptManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PPT_PLUGIN_ID,
  version: "1.1.0",
  name: "PPT",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-ppt-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  actions: [...Object.values(pptActions), ...Object.values(pptContentActions)],
  permissions: [
    ...PPT_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write").map(permission => ({ permission, required: permission !== "model:invoke" && permission !== "pages:read",
      reason: permission === "model:invoke" ? "让模型把文字整理成大纲（显式调用）" : permission === "pages:read" ? "选一篇 Pages 文档生成大纲（经 Pages 的公开动作读取）" : "演示稿动作" })),
    { permission: "storage:private", required: true, reason: "本机演示稿库" },
    { permission: "artifact:write", required: true, reason: "把演示稿存为成果" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [{ artifact_type_id: PPT_ARTIFACT_TYPE_ID, schema_version: PPT_ARTIFACT_SCHEMA_VERSION, title: "演示稿",
      preview: { capability_id: "ppt.artifacts.preview", version: 1 }, pin: { capability_id: "ppt.artifacts.pin", version: 1 },
      compare: { capability_id: "ppt.artifacts.compare", version: 1 }, continue: { capability_id: "ppt.artifacts.continue", version: 1 } }],
    consumes: [],
  },
  ui: {
    contributions: [PPT_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "PPT", contribution_id: PPT_UI_CONTRIBUTION_ID, icon: "presentation", order: 59 },
    ],
  },
  mcp_exports: [...PPT_MCP_EXPORTS],
};
