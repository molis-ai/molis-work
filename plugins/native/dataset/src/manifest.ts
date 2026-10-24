import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  DATASET_ARTIFACT_SCHEMA_VERSION,
  DATASET_ARTIFACT_TYPE_ID,
  DATASET_PLUGIN_ID,
  DATASET_PROJECT_PLUGIN_ID,
} from "@molis-ai/molis-work-contracts/modules/dataset";
import { DATASET_UI_CONTRIBUTION_ID } from "./ui.js";
import { datasetActions, datasetContentActions, DATASET_ACTION_PERMISSIONS } from "./actions.js";
import { DATASET_DATABASE } from "./database.js";

export { DATASET_PLUGIN_ID, DATASET_PROJECT_PLUGIN_ID };

/** The Host's current HTTP body bound for Dataset's project routes; the import action's 2,000,000 characters are another layer. */
const DATASET_BODY_BYTES = 1_000_000;

export const datasetManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: DATASET_PLUGIN_ID,
  version: "0.3.0",
  name: "Dataset",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-dataset-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "本机数据表库" },
    { permission: "artifact:write", required: true, reason: "把数据表存为成果" },
    { permission: "artifact:read", required: true, reason: "给下一版编号、恢复没存完的固定版本时读回自己固定的数据表" },
    ...DATASET_ACTION_PERMISSIONS.filter(permission => permission !== "artifact:write" && permission !== "artifact:read")
      .map(permission => ({ permission, required: permission !== "model:invoke", reason: "数据表动作使用的读取、编辑或显式模型调用" })),
  ],
  actions: [...Object.values(datasetActions), ...Object.values(datasetContentActions)],
  databases: { home: DATASET_DATABASE },
  routes: [
    { route_id: "dataset.list", method: "GET", path: "/datasets" },
    { route_id: "dataset.create", method: "POST", path: "/datasets", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.get", method: "GET", path: "/datasets/:id" },
    { route_id: "dataset.update", method: "POST", path: "/datasets/:id", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.delete", method: "POST", path: "/datasets/:id/delete", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.promote", method: "POST", path: "/datasets/:id/promote", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.generate", method: "POST", path: "/datasets/:id/generate-column", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.generate-ai", method: "POST", path: "/datasets/:id/generate-ai-column", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.import", method: "POST", path: "/datasets/:id/import-csv", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.export", method: "GET", path: "/datasets/:id/export" },
    { route_id: "dataset.versions", method: "GET", path: "/datasets/:id/versions" },
    { route_id: "dataset.snapshot", method: "POST", path: "/datasets/:id/versions", max_body_bytes: DATASET_BODY_BYTES },
    { route_id: "dataset.rollback", method: "POST", path: "/datasets/:id/rollback", max_body_bytes: DATASET_BODY_BYTES },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: {
    produces: [{ artifact_type_id: DATASET_ARTIFACT_TYPE_ID, schema_version: DATASET_ARTIFACT_SCHEMA_VERSION, title: "数据表",
      preview: { capability_id: "dataset.artifacts.preview", version: 1 }, pin: { capability_id: "dataset.artifacts.pin", version: 1 },
      compare: { capability_id: "dataset.artifacts.compare", version: 1 }, continue: { capability_id: "dataset.artifacts.continue", version: 1 } }],
    consumes: [],
  },
  ui: {
    contributions: [DATASET_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Dataset", contribution_id: DATASET_UI_CONTRIBUTION_ID, icon: "database", order: 58 },
    ],
  },
};
