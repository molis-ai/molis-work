import { actionPermissionDeclarations } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { GOALS_TREE_UI_CONTRIBUTION_ID } from "./tree-ui.js";
import { GOALS_ACTIONS } from "./actions.js";
import { PERSONAL_PLANNING_ACTIONS } from "./personal-planning-actions.js";
import { GOALS_PROJECT_DATABASE } from "./project-database.js";

export const GOALS_PLUGIN_ID = "io.molis.work.goals";
/** What the project database stores for this Plugin. */
export const GOALS_PROJECT_PLUGIN_ID = "goals";

/**
 * Declarative placement for this first-party Plugin.
 *
 * `native` rather than `app`: the shell derives navigation from these
 * declarations, while this Plugin is still composed at build time instead of
 * being started and isolated by Plugin Runtime.
 */
export const goalsManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: GOALS_PLUGIN_ID,
  version: "0.3.0",
  name: "Goals",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-goals-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    ...actionPermissionDeclarations([...GOALS_ACTIONS, ...PERSONAL_PLANNING_ACTIONS], "按调用者授权读取、推进和决定项目目标"),
    { permission: "storage:private", required: true, reason: "读写 Goals 自己在项目库里的表" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: [...GOALS_ACTIONS, ...PERSONAL_PLANNING_ACTIONS],
  artifacts: { produces: [], consumes: [] },
  databases: { project: GOALS_PROJECT_DATABASE },
  ui: {
    contributions: [GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "tree", slot: "navigator", title: "Goals", contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, icon: "target", order: 10,
        start: { title: "推进一个目标", hint: "明确要做成什么，接着往下走。" } },
      { view_id: "settings", slot: "settings", title: "Goals", contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID, icon: "workflow", order: 120 },
    ],
  },
};
