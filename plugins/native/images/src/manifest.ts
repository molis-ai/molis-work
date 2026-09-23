import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/images";

export const IMAGES_UI_CONTRIBUTION_ID = "io.molis.work.native.images.ui.v1";
export const imagesManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: IMAGES_PLUGIN_ID,
  version: "1.0.0",
  name: "图片",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-images-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "保存生图配置、项目生成记录和本机图片" },
    { permission: "secret:images", required: true, reason: "由宿主加密保管生图服务 API Key" },
    { permission: "network:*", required: true, reason: "访问用户明确配置的生图接口并下载生成结果" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [IMAGES_UI_CONTRIBUTION_ID],
    views: [{ view_id: "directory", slot: "navigator", title: "图片", contribution_id: IMAGES_UI_CONTRIBUTION_ID, icon: "image", order: 60 }],
  },
};
