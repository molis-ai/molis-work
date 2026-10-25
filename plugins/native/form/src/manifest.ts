import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  FORM_ARTIFACT_SCHEMA_VERSION,
  FORM_ARTIFACT_TYPE_ID,
  FORM_PLUGIN_ID,
  FORM_PROJECT_PLUGIN_ID,
} from "@molis-ai/molis-work-contracts/modules/form";
import { FORM_UI_CONTRIBUTION_ID } from "./ui.js";
import { formActions, FORM_ACTION_PERMISSIONS } from "./actions.js";
import { formContentActions } from "./content-actions.js";
import { FORM_DATABASE } from "./database.js";

export { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID };

/** What the page sends a route reads up to 1 MB, as the Host's Form edge did: answer files reach 400 000 characters each. */
const FORM_BODY_BYTES = 1_000_000;

export const formManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: FORM_PLUGIN_ID,
  version: "0.3.0",
  name: "Forms",
  summary: "建问卷，收答卷，看逐题汇总。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-form-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机问卷库" },
    { permission: "artifact:write", required: true, reason: "把问卷存为成果" },
    { permission: "artifact:read", required: true, reason: "给下一版编号、恢复没存完的固定版本时读回自己固定的问卷" },
    ...FORM_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write" && permission !== "artifact:read").map(permission => ({ permission, required: permission !== "model:invoke", reason: "问卷动作读取、编辑、填写或显式模型调用" })),
  ],
  actions: [...Object.values(formActions), ...Object.values(formContentActions)],
  capabilities: { provides: [], consumes: [] },
  // Served under /api/plugins/io.molis.work.form in the project (a route needs a path below the plugin's own); each one only maps
  // the request to its action (plugin.ts).
  databases: { home: FORM_DATABASE },
  routes: [
    { route_id: "form.list", method: "GET", path: "/forms" },
    { route_id: "form.create", method: "POST", path: "/forms", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.get", method: "GET", path: "/forms/:id" },
    { route_id: "form.update", method: "POST", path: "/forms/:id", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.publish", method: "POST", path: "/forms/:id/publish", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.promote", method: "POST", path: "/forms/:id/promote", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.delete", method: "POST", path: "/forms/:id/delete", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.generate", method: "POST", path: "/forms/:id/generate-questions", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.draft", method: "POST", path: "/forms/:id/draft-questions", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.submit", method: "POST", path: "/forms/:id/submit", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.results", method: "GET", path: "/forms/:id/results" },
    { route_id: "form.close", method: "POST", path: "/forms/:id/close", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.answers.import", method: "POST", path: "/forms/:id/answers", max_body_bytes: FORM_BODY_BYTES },
    { route_id: "form.csv", method: "GET", path: "/forms/:id/results.csv" },
    { route_id: "form.fillpage", method: "GET", path: "/forms/:id/fill-page" },
  ],
  artifacts: {
    produces: [{ artifact_type_id: FORM_ARTIFACT_TYPE_ID, schema_version: FORM_ARTIFACT_SCHEMA_VERSION, title: "问卷",
      preview: { capability_id: "form.artifacts.preview", version: 1 }, pin: { capability_id: "form.artifacts.pin", version: 1 },
      compare: { capability_id: "form.artifacts.compare", version: 1 }, continue: { capability_id: "form.artifacts.continue", version: 1 } }],
    consumes: [],
  },
  ui: {
    contributions: [FORM_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Forms", contribution_id: FORM_UI_CONTRIBUTION_ID, icon: "clipboard", hue: "orange", order: 57, group: "make",
        creates: { station: "form", title: "问卷" } },
    ],
  },
};
