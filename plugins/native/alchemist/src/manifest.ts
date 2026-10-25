import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ALCHEMIST_PLUGIN_ID, ALCHEMIST_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/alchemist";
import { ALCHEMIST_UI_CONTRIBUTION_ID } from "./ui.js";
import { alchemistActions, ALCHEMIST_ACTION_PERMISSIONS, ALCHEMIST_MODEL_PERMISSION } from "./studio/shared/contracts/actions.js";

import { ALCHEMIST_EN } from "./en.js";
export { ALCHEMIST_PLUGIN_ID, ALCHEMIST_PROJECT_PLUGIN_ID };

export const alchemistManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: ALCHEMIST_PLUGIN_ID,
  version: "0.3.0",
  name: "炼金术士",
  summary: "写下方向，炼成可比较的卡再决定。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-alchemist-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  actions: Object.values(alchemistActions),
  permissions: [
    ...ALCHEMIST_ACTION_PERMISSIONS.map(permission => permission === ALCHEMIST_MODEL_PERMISSION
      ? { permission, required: false, reason: "讨论、复用判断、炼化和研究使用系统文字模型" }
      : { permission, required: true, reason: "炼金术士业务动作" }),
    { permission: "storage:private", required: true, reason: "按项目保存方向、Idea、研究证据、决策和个人 Memory" },
  ],
  capabilities: { provides: [], consumes: [] },
  artifacts: { produces: [], consumes: [] },
  ui: {
    translations: ALCHEMIST_EN,
    contributions: [ALCHEMIST_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "炼金术士", contribution_id: ALCHEMIST_UI_CONTRIBUTION_ID, icon: "zap", order: 60, group: "research" },
    ],
  },
};
