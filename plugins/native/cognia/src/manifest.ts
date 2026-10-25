import { COGNIA_ACTIONS, COGNIA_ACTION_PERMISSIONS } from "./actions.js";
import type { PluginManifest, PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { COGNIA_PLUGIN_ID } from "./types.js";
import { COGNIA_UI_CONTRIBUTION_ID } from "./ui.js";
import { COGNIA_DATABASE } from "./database.js";
import { COGNIA_MESSAGES } from "./messages.js";
import { COGNIA_EN } from "./en.js";
const routes: PluginRouteDeclaration[] = [
  { route_id: "cognia.workspace", method: "GET", path: "/library", permission: "cognia:read" },
  { route_id: "cognia.material.read", method: "GET", path: "/library/materials/:id", permission: "cognia:read" },
  { route_id: "cognia.download", method: "GET", path: "/library/materials/:id/download", permission: "cognia:read" },
  { route_id: "cognia.draft.read", method: "GET", path: "/library/drafts/:id", permission: "cognia:read" },
  ...[
    ["domain.create", "/domains"], ["domain.update", "/domains/:id/update"], ["domain.delete", "/domains/:id/delete"],
    ["source.update", "/sources/:id/update"], ["source.delete", "/sources/:id/delete"],
    ["material.create", "/materials"], ["material.update", "/materials/:id/update"], ["material.delete", "/materials/:id/delete"],
    ["commit", "/import/commit"], ["cancel", "/import/cancel"], ["ai", "/ai"], ["draft.save", "/drafts/:id/save"], ["draft.archive", "/drafts/:id/delete"],
  ].map(([name, path]): PluginRouteDeclaration => ({ route_id: `cognia.${name}`, method: "POST", path: `/library${path}`, permission: "cognia:write" })),
  { route_id: "cognia.preview", method: "POST", path: "/library/import/preview", permission: "cognia:write", max_body_bytes: 45_000_000 },
];
export const cogniaManifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: COGNIA_PLUGIN_ID, version: "0.3.0", name: "Cognia", summary: "导入本地知识，带来源检索问答。", kind: "native", publisher: { publisher_id: "molis", signature: "official-cognia-binding" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], actions: COGNIA_ACTIONS, permissions: [...COGNIA_ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按调用者授权使用 Cognia 能力" })), { permission: "storage:private", required: true, reason: "本机知识库、导入快照与审阅草稿" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, runtime: { scope: "home" }, databases: { home: COGNIA_DATABASE }, routes, ui: { messages: COGNIA_MESSAGES, translations: COGNIA_EN, contributions: [COGNIA_UI_CONTRIBUTION_ID], views: [{ view_id: "cognia", slot: "navigator", title: "Cognia", contribution_id: COGNIA_UI_CONTRIBUTION_ID, icon: "book", hue: "blue", order: 36, group: "personal" }] } };
