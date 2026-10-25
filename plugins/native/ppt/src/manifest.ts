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
import { PPT_DATABASE } from "./database.js";

export { PPT_PLUGIN_ID, PPT_PROJECT_PLUGIN_ID };

const PPT_BODY_BYTES = 1_000_000;

export const pptManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PPT_PLUGIN_ID,
  version: "0.3.0",
  name: "PPT",
  summary: "写大纲，放映或导出 PowerPoint。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-ppt-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  actions: [...Object.values(pptActions), ...Object.values(pptContentActions)],
  databases: { home: PPT_DATABASE },
  routes: [
    { route_id: "ppt.list", method: "GET", path: "/ppt" },
    { route_id: "ppt.outline_pages", method: "GET", path: "/ppt/outline-pages" },
    { route_id: "ppt.create", method: "POST", path: "/ppt", max_body_bytes: PPT_BODY_BYTES },
    { route_id: "ppt.get", method: "GET", path: "/ppt/:id" },
    { route_id: "ppt.update", method: "POST", path: "/ppt/:id", max_body_bytes: PPT_BODY_BYTES },
    { route_id: "ppt.delete", method: "POST", path: "/ppt/:id/delete", max_body_bytes: PPT_BODY_BYTES },
    { route_id: "ppt.export", method: "GET", path: "/ppt/:id/export" },
    { route_id: "ppt.pptx", method: "GET", path: "/ppt/:id/pptx" },
    { route_id: "ppt.promote", method: "POST", path: "/ppt/:id/promote", max_body_bytes: PPT_BODY_BYTES },
    { route_id: "ppt.outline", method: "POST", path: "/ppt/:id/outline", max_body_bytes: PPT_BODY_BYTES },
    { route_id: "ppt.outline_ai", method: "POST", path: "/ppt/:id/outline-ai", max_body_bytes: PPT_BODY_BYTES },
  ],
  permissions: [
    ...PPT_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write").map(permission => ({ permission, required: permission !== "model:invoke" && permission !== "pages:read",
      reason: permission === "model:invoke" ? "让模型把文字整理成大纲（显式调用）" : permission === "pages:read" ? "选一篇 Pages 文档生成大纲（经 Pages 的公开动作读取）" : "演示稿动作" })),
    { permission: "storage:private", required: true, reason: "本机演示稿库" },
    { permission: "artifact:write", required: true, reason: "把演示稿存为成果" },
    { permission: "artifact:read", required: true, reason: "给下一版编号、恢复没存完的固定版本时读回自己固定的演示稿" },
  ],
  capabilities: { provides: [], consumes: ["pages.content.read", "pages.content.list"] },
  artifacts: {
    produces: [{ artifact_type_id: PPT_ARTIFACT_TYPE_ID, schema_version: PPT_ARTIFACT_SCHEMA_VERSION, title: "演示稿",
      preview: { capability_id: "ppt.artifacts.preview", version: 1 }, pin: { capability_id: "ppt.artifacts.pin", version: 1 },
      compare: { capability_id: "ppt.artifacts.compare", version: 1 }, continue: { capability_id: "ppt.artifacts.continue", version: 1 } }],
    consumes: [],
  },
  ui: {
    contributions: [PPT_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "PPT", contribution_id: PPT_UI_CONTRIBUTION_ID, icon: "presentation", hue: "red", order: 59, group: "make",
        creates: { station: "ppt", title: "演示稿" } },
    ],
  },
};
