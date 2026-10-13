import { PAGES_ACTIONS, PAGES_ACTION_PERMISSIONS } from "./actions.js";
import { pagesContentActions } from "./content-actions.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { IMPORTED_DOCUMENT_TYPE } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID, PAGES_ARTIFACT_TYPE_ID, PAGES_ARTIFACT_SCHEMA_VERSION } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_UI_CONTRIBUTION_ID } from "./ui.js";
import { pagesMethods } from "./methods.js";

export { PAGES_PLUGIN_ID, PAGES_PROJECT_PLUGIN_ID };

export const pagesManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: PAGES_PLUGIN_ID,
  version: "1.0.0",
  name: "Pages",
  // Offered to other Agents for business work; bodies in ./methods.ts.
  methods: pagesMethods.map(({ body: _body, ...declared }) => ({ ...declared, tools: [...declared.tools] })),
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-pages-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    ...PAGES_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write").map(permission => ({ permission, required: false, reason: "读写交接内容" })),
    { permission: "storage:private", required: true, reason: "本机文档库" },
    { permission: "artifact:write", required: true, reason: "把文档存为成果" },
  ],
  capabilities: { provides: [], consumes: [] },
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
      { view_id: "directory", slot: "navigator", title: "Pages", contribution_id: PAGES_UI_CONTRIBUTION_ID, icon: "note", order: 56 },
    ],
  },
};
