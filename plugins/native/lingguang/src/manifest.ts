import { LINGGUANG_ACTIONS, LINGGUANG_ACTION_PERMISSIONS } from "./actions.js";
import { lingguangContentActions } from "./content-actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LINGGUANG_PLUGIN_ID, LINGGUANG_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/lingguang";
import { LINGGUANG_UI_CONTRIBUTION_ID } from "./ui.js";
import { LINGGUANG_DATABASE } from "./database.js";

export { LINGGUANG_PLUGIN_ID, LINGGUANG_PROJECT_PLUGIN_ID };

const MATERIAL_BYTES = 36_000_000;
const BODY_BYTES = 1_000_000;

export const lingguangManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: LINGGUANG_PLUGIN_ID,
  version: "0.3.0",
  name: "灵光",
  summary: "先记下想法，再决定留下或丢掉。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-lingguang-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    ...[...new Set([...LINGGUANG_ACTION_PERMISSIONS, ...Object.values(lingguangContentActions).flatMap(d => d.action.permissions)])].map(permission => ({ permission, required: false, reason: "读写交接内容" })),
    { permission: "storage:private", required: true, reason: "本机灵光库" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: [...LINGGUANG_ACTIONS, ...Object.values(lingguangContentActions)],
  databases: { home: LINGGUANG_DATABASE },
  routes: [
    { route_id: "lingguang.list", method: "GET", path: "/sparks" },
    { route_id: "lingguang.create", method: "POST", path: "/sparks", max_body_bytes: BODY_BYTES },
    { route_id: "lingguang.discard_many", method: "POST", path: "/sparks/discard", max_body_bytes: BODY_BYTES },
    { route_id: "lingguang.material_read", method: "POST", path: "/sparks/material", max_body_bytes: MATERIAL_BYTES, stream: "ndjson" },
    { route_id: "lingguang.source_read", method: "POST", path: "/sparks/source", max_body_bytes: BODY_BYTES, stream: "ndjson" },
    { route_id: "lingguang.conversation_open", method: "POST", path: "/sparks/conversations", max_body_bytes: BODY_BYTES },
    { route_id: "lingguang.conversation_message", method: "POST", path: "/sparks/conversations/:id/messages", max_body_bytes: BODY_BYTES, stream: "ndjson" },
    { route_id: "lingguang.get", method: "GET", path: "/sparks/:id" },
    { route_id: "lingguang.update", method: "POST", path: "/sparks/:id", max_body_bytes: BODY_BYTES },
    { route_id: "lingguang.discard", method: "POST", path: "/sparks/:id/discard", max_body_bytes: BODY_BYTES },
  ],
  artifacts: { produces: [], consumes: [] },
  ui: {
    contributions: [LINGGUANG_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "workbench", slot: "stage", title: "灵光", contribution_id: LINGGUANG_UI_CONTRIBUTION_ID, icon: "idea", order: 10, accepts_objects: true },
      { view_id: "island", slot: "island", title: "灵光", contribution_id: LINGGUANG_UI_CONTRIBUTION_ID, icon: "idea", order: 10, group: "personal",
        start: { title: "记下一点灵感", hint: "还没想清楚，也可以先留下。" } },
      { view_id: "side", slot: "side", title: "灵光", contribution_id: LINGGUANG_UI_CONTRIBUTION_ID, icon: "idea", order: 10 },
    ],
  },
};
