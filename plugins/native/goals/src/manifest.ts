import { actionPermissionDeclarations } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { GOALS_TREE_UI_CONTRIBUTION_ID } from "./tree-ui.js";
import { GOALS_ACTIONS } from "./actions.js";
import { PERSONAL_PLANNING_ACTIONS } from "./personal-planning-actions.js";
import { GOALS_PROJECT_DATABASE } from "./project-database.js";

export const GOALS_PLUGIN_ID = "io.molis.work.goals";
/** What the project database stores for this Plugin. */
export const GOALS_PROJECT_PLUGIN_ID = "goals";

/** The nine writes to a Goal's event document, each its own route (`goals.event-configure` …). */
const GOALS_EVENT_WRITES = ["event-configure", "event-report", "event-progress", "event-concern", "event-decision-request",
  "event-agree", "event-close", "event-resume", "event-note"] as const;

/**
 * The page's Goals operations, one handler each in `goalsRoutes` (PG094-09). Until Goals runs on the Plugin Runtime supervisor (PG-094 S9)
 * the Host serves them at their old address, `/api` and the path, instead of under `/api/plugins/<plugin_id>`. Goals has no installation
 * grants for the Host to read until then, so a route here that declares a `permission` is refused, whoever calls (S-15).
 */
const GOALS_ROUTES: PluginRouteDeclaration[] = [
  { route_id: "goals.create", method: "POST", path: "/goals" },
  { route_id: "goals.directory", method: "GET", path: "/goals/directory" },
  { route_id: "goals.policy-save", method: "POST", path: "/policy-bindings" },
  { route_id: "goals.guidance-read", method: "GET", path: "/project-guidance" },
  { route_id: "goals.guidance-add", method: "POST", path: "/project-guidance" },
  { route_id: "goals.guidance-update", method: "PATCH", path: "/project-guidance/:guidanceId" },
  { route_id: "goals.relation-add", method: "POST", path: "/goals/:goalId/relations" },
  { route_id: "goals.relation-deactivate", method: "POST", path: "/relations/:relationId/deactivate" },
  { route_id: "goals.active", method: "POST", path: "/goals/:goalId/active" },
  { route_id: "goals.archive", method: "POST", path: "/goals/:goalId/archive" },
  { route_id: "goals.trash", method: "POST", path: "/goals/:goalId/trash" },
  { route_id: "goals.tree-decide", method: "POST", path: "/goal-tree-proposals/:proposalId/decision" },
  { route_id: "goals.history-read", method: "GET", path: "/goals/:goalId/history/:itemId" },
  { route_id: "goals.event-read", method: "GET", path: "/goals/:goalId/events/:eventId" },
  { route_id: "goals.event-state", method: "GET", path: "/goals/:goalId/event-state" },
  { route_id: "goals.event-timeline", method: "GET", path: "/goals/:goalId/event-timeline" },
  ...GOALS_EVENT_WRITES.map((write): PluginRouteDeclaration => ({ route_id: `goals.${write}`, method: "POST", path: `/goals/:goalId/${write}` })),
  { route_id: "goals.event-decision", method: "POST", path: "/goals/:goalId/event-decision" },
  { route_id: "goals.deliverables-read", method: "GET", path: "/goals/:goalId/deliverables" },
  { route_id: "goals.deliverables-write", method: "POST", path: "/goals/:goalId/deliverables" },
  { route_id: "goals.artifact-inputs-read", method: "GET", path: "/goals/:goalId/artifact-inputs" },
  { route_id: "goals.artifact-inputs-write", method: "POST", path: "/goals/:goalId/artifact-inputs" },
  { route_id: "goals.inputs", method: "POST", path: "/goals/:goalId/inputs" },
];

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
  summary: "确定目标，推进工作，留下结果。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-goals-binding" },
  // 常开插件 (specs/repository-anti-corruption/slices/ac-trust-install.md §3.4): on in every project, and removable only after the person
  // takes the mark back. The Host reads the agreement from the consent ledger, not from this list.
  always_on: true,
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    ...actionPermissionDeclarations([...GOALS_ACTIONS, ...PERSONAL_PLANNING_ACTIONS], "按调用者授权读取、推进和决定项目目标"),
    { permission: "storage:private", required: true, reason: "读写 Goals 自己在项目库里的表" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: [...GOALS_ACTIONS, ...PERSONAL_PLANNING_ACTIONS],
  artifacts: { produces: [], consumes: [] },
  databases: { project: GOALS_PROJECT_DATABASE },
  routes: GOALS_ROUTES,
  ui: {
    contributions: [GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "tree", slot: "navigator", title: "Goals", contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, icon: "target", order: 10, rail: "core", pinned_default: true, accepts_objects: true,
        start: { title: "推进一个目标", hint: "明确要做成什么，接着往下走。" } },
      { view_id: "settings", slot: "settings", title: "Goals", contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID, icon: "workflow", order: 120 },
    ],
  },
};
