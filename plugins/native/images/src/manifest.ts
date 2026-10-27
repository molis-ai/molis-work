import { SHELF_ADMIT_ID, shelfAdmit } from "./shelf-admit.js";
import { imagesActions, IMAGES_ACTION_PERMISSIONS } from "./actions.js";
import { IMAGES_FILES_WRITE, IMAGES_OWNER_FILES } from "./owner-files.js";
import type { PluginManifest, PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMAGES_PLUGIN_ID } from "./contract.js";
import { IMAGES_DATABASE } from "./database.js";
import { IMAGES_IMAGE_GENERATION } from "./image-generation.js";

import { IMAGES_MESSAGES } from "./messages.js";
import { IMAGES_EN } from "./en.js";
export const IMAGES_UI_CONTRIBUTION_ID = "io.molis.work.native.images.ui.v1";
const routes: PluginRouteDeclaration[] = [
  {route_id:"images.connections.list",method:"GET",path:"/connections",permission:"images:connections:read"},
  {route_id:"images.connections.save",method:"POST",path:"/connections",permission:"images:connections:write"},
  {route_id:"images.connections.delete",method:"DELETE",path:"/connections/:id",permission:"images:connections:write"},
  {route_id:"images.jobs.list",method:"GET",path:"/jobs",permission:"images:read"},
  {route_id:"images.jobs.get",method:"GET",path:"/jobs/:id",permission:"images:read"},
  {route_id:"images.jobs.start",method:"POST",path:"/jobs",permission:"images:generate"},
  {route_id:"images.jobs.cancel",method:"POST",path:"/jobs/:id/cancel",permission:"images:generate"},
  {route_id:"images.jobs.delete",method:"DELETE",path:"/jobs/:id",permission:"images:delete"},
  {route_id:"images.images.read",method:"GET",path:"/jobs/:id/images/:image_id",permission:"images:read"},
  {route_id:"images.images.shelf",method:"POST",path:"/jobs/:id/images/:image_id/shelf",permission:"images:read"},
];
export const imagesManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: IMAGES_PLUGIN_ID,
  version: "0.3.0",
  name: "图片",
  summary: "连接生图服务，按描述生成图片。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-images-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  actions: Object.values(imagesActions),
  runtime: { scope: "home" },
  databases: { home: IMAGES_DATABASE },
  owner_files: IMAGES_OWNER_FILES,
  image_generation: IMAGES_IMAGE_GENERATION,
  routes: routes.map(route => route.method === "POST" ? { ...route, max_body_bytes: 160_000 } : route),
  permissions: [
    // Without it a job cannot save its images, so it is not one the person can leave out.
    ...IMAGES_ACTION_PERMISSIONS.map(permission => permission === IMAGES_FILES_WRITE
      ? { permission, required: true, reason: "保存和删除本机生成的图片文件" } : { permission, required: false, reason: "图片动作" }),
    { permission: "storage:private", required: true, reason: "保存生图配置、项目生成记录和本机图片" },
    ...shelfAdmit.action.permissions.map(permission => ({ permission, required: false, reason: "将选中的图片保存到 Shelf" })),
  ],
  capabilities: { provides: [], consumes: [SHELF_ADMIT_ID] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    messages: IMAGES_MESSAGES,
    translations: IMAGES_EN,
    contributions: [IMAGES_UI_CONTRIBUTION_ID],
    views: [{ view_id: "directory", slot: "navigator", title: "图片", contribution_id: IMAGES_UI_CONTRIBUTION_ID, icon: "image", hue: "pink", order: 60, group: "make" }],
  },
};
