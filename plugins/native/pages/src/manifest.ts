import { PAGES_ACTIONS, PAGES_ACTION_PERMISSIONS } from "./actions.js";
import { pagesContentActions } from "./content-actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID, PAGES_ARTIFACT_TYPE_ID, PAGES_ARTIFACT_SCHEMA_VERSION } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_UI_CONTRIBUTION_ID } from "./ui.js";
import { pagesMethods } from "./methods.js";
import { PAGES_DATABASE } from "./database.js";

export { PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID };

const PAGES_BODY_BYTES = 1_000_000;
/** An import carries the uploaded files themselves (base64), up to a hundred of them. */
const PAGES_IMPORT_BYTES = 15_000_000;

export const pagesManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PAGES_PLUGIN_ID,
  version: "0.3.0",
  name: "Pages",
  // Offered to other Agents for business work; bodies in ./methods.ts.
  methods: pagesMethods.map(({ body: _body, ...declared }) => ({ ...declared, tools: [...declared.tools] })),
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-pages-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  // Declaration order is match order: the fixed paths come before the ones that take a document id.
  databases: { home: PAGES_DATABASE },
  routes: [
    { route_id: "pages.comments.list", method: "GET", path: "/pages/:id/comments" },
    { route_id: "pages.comments.append", method: "POST", path: "/pages/:id/comments", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.list", method: "GET", path: "/pages" },
    { route_id: "pages.templates", method: "GET", path: "/pages/templates" },
    { route_id: "pages.create", method: "POST", path: "/pages", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.import.preview", method: "POST", path: "/pages/import/preview", max_body_bytes: PAGES_IMPORT_BYTES },
    { route_id: "pages.import", method: "POST", path: "/pages/import", max_body_bytes: PAGES_IMPORT_BYTES },
    { route_id: "pages.folders.create", method: "POST", path: "/pages/folders", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.folders.update", method: "POST", path: "/pages/folders/:id", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.folders.delete", method: "POST", path: "/pages/folders/:id/delete", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.ai", method: "POST", path: "/pages/:id/ai", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.promote", method: "POST", path: "/pages/:id/promote", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.extract", method: "POST", path: "/pages/:id/extract", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.get", method: "GET", path: "/pages/:id" },
    { route_id: "pages.update", method: "POST", path: "/pages/:id", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.delete", method: "POST", path: "/pages/:id/delete", max_body_bytes: PAGES_BODY_BYTES },
    { route_id: "pages.discard", method: "POST", path: "/pages/:id/discard", max_body_bytes: PAGES_BODY_BYTES },
  ],
  permissions: [
    ...PAGES_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write").map(permission => ({ permission, required: false, reason: "读写交接内容" })),
    { permission: "storage:private", required: true, reason: "本机文档库" },
    { permission: "artifact:write", required: true, reason: "把文档存为成果" },
    { permission: "artifact:read", required: true, reason: "给下一版编号、恢复没存完的固定版本时读回自己固定的文档" },
    { permission: "goals:read", required: true, reason: "选择文档所属的目标" },
  ],
  capabilities: { provides: [], consumes: ["goals.collection.read"] },
  actions: [...PAGES_ACTIONS, ...Object.values(pagesContentActions)],
  artifacts: {
    produces: [{ artifact_type_id: PAGES_ARTIFACT_TYPE_ID, schema_version: PAGES_ARTIFACT_SCHEMA_VERSION, title: "文档",
      preview: { capability_id: "pages.artifacts.preview", version: 1 }, pin: { capability_id: "pages.artifacts.pin", version: 1 },
      compare: { capability_id: "pages.artifacts.compare", version: 1 }, continue: { capability_id: "pages.artifacts.continue", version: 1 } }],
    // Pages also continues from imported files it can read (artifact-positioning A3, A4b).
    consumes: [{ artifact_type_id: IMPORTED_DOCUMENT_TYPE, schema_version: 1, continue: { capability_id: "pages.artifacts.continue", version: 1 } }],
  },
  ui: {
    contributions: [PAGES_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "comments", slot: "side", context_binding: "focused-object", title: "评论与备注", contribution_id: PAGES_UI_CONTRIBUTION_ID, icon: "message" },
      { view_id: "directory", slot: "navigator", title: "Pages", contribution_id: PAGES_UI_CONTRIBUTION_ID, icon: "note", order: 56, group: "make", accepts_objects: true,
        creates: { station: "pages", title: "文档" }, start: { title: "写一份文档", hint: "把思路写下来，逐步整理成作品。", icon: "file" } },
    ],
  },
};
