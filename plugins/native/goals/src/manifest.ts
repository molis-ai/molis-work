import { PLUGIN_ATTENTION_READ_PERMISSION, PLUGIN_ATTENTION_WRITE_PERMISSION, PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION, PROJECT_JOURNAL_PERMISSION, type PluginManifest, type PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { GOALS_SETTINGS_UI_CONTRIBUTION_ID } from "./settings-ui.js";
import { GOALS_TREE_UI_CONTRIBUTION_ID } from "./tree-ui.js";
import { GOALS_ACTIONS } from "./actions.js";
import { PERSONAL_PLANNING_ACTIONS } from "./personal-planning-actions.js";
import { GOALS_PROJECT_DATABASE } from "./project-database.js";
import { GOALS_MESSAGES } from "./messages.js";
import { GOALS_CONTEXT_EN } from "./context-en.js";
import { GOALS_DIALOGS_EN } from "./dialogs-en.js";
import { GOALS_DOCUMENT_EN } from "./document-en.js";
import { GOALS_MOMENTUM_EN } from "./momentum-en.js";
import { GOALS_PLANNING_EN } from "./planning-en.js";
import { GOALS_POLICY_EN } from "./policy-en.js";
import { GOALS_PROPOSAL_EN } from "./proposal-en.js";
import { GOALS_RELATION_EN } from "./relation-en.js";
import { GOALS_SAFETY_EN } from "./safety-en.js";
import { GOALS_STATUS_EN } from "./status-en.js";
import { GOALS_TREE_EN } from "./tree-en.js";
import { GOALS_WORKSPACE_EN } from "./workspace-en.js";
import { GOALS_HOME_DATABASE } from "./home-database.js";

export const GOALS_PLUGIN_ID = "io.molis.work.goals";
/** What the project database stores for this Plugin. */
export const GOALS_PROJECT_PLUGIN_ID = "goals";
/** The one job Goals keeps: the board and the decision reminders catch up once when a project opens (it writes Attention, which only an action or a job may). */
export const GOALS_CATCH_UP_JOB = "goals-catch-up";

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
  runtime: { scope: "home" },
  publisher: { publisher_id: "molis", signature: "official-goals-binding" },
  // 常开插件 (specs/repository-anti-corruption/slices/ac-trust-install.md §3.4): on in every project, and removable only after the person
  // takes the mark back. The Host reads the agreement from the consent ledger, not from this list.
  always_on: true,
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  // Goals runs as two instances of this one Manifest (the project's and the Home's), and every permission of such a Manifest is required
  // and written out here (the dual-instance gate reads the list as syntax). The first four are what its actions ask of the caller
  // (`actionPermissionDeclarations` over `GOALS_ACTIONS` and `PERSONAL_PLANNING_ACTIONS`, which `tests/goals-project-database.test.ts` holds
  // this list to); the rest are what Goals asks of the platform's services: its own tables, the journal, Attention, the Context Ledger,
  // and other plugins' actions as the caller.
  permissions: [
    { permission: "goals:read", required: true, reason: "按调用者授权读取、推进和决定项目目标" },
    { permission: "goals:write", required: true, reason: "按调用者授权读取、推进和决定项目目标" },
    { permission: "artifacts:read", required: true, reason: "按调用者授权读取、推进和决定项目目标" },
    { permission: "goals:decide", required: true, reason: "按调用者授权读取、推进和决定项目目标" },
    { permission: "storage:private", required: true, reason: "读写 Goals 自己在项目库和 Home 里的表" },
    { permission: PROJECT_JOURNAL_PERMISSION, required: true, reason: "把目标的事件和幂等记录写进项目日志" },
    { permission: PLUGIN_ATTENTION_READ_PERMISSION, required: true, reason: "读取待决定目标的提醒" },
    { permission: PLUGIN_ATTENTION_WRITE_PERMISSION, required: true, reason: "为待决定的目标开启、完成提醒" },
    { permission: PLUGIN_CONTEXT_LEDGER_READ_PERMISSION, required: true, reason: "读取目标的交付物和输入引用" },
    { permission: PLUGIN_CONTEXT_LEDGER_WRITE_PERMISSION, required: true, reason: "记下目标的交付物和输入引用" },
    { permission: "actions:delegate", required: true, reason: "以调用者的身份读取成果版本、请成果的所有者固定对象" },
    { permission: "actions:invoke", required: true, reason: "读取 Home 里的个人规划方法" },
  ],
  capabilities: { provides: [], consumes: [] },
  actions: [...GOALS_ACTIONS, ...PERSONAL_PLANNING_ACTIONS],
  // The four kinds of edge Goals writes from a Goal to an exact version in the 成果库 (its inputs and deliverables, and the proposals
  // of either that a person confirms). `deliverable-actions.ts` writes them; the 成果库 reads them from here, by kind.
  artifacts: { produces: [], consumes: [], links: [
    { kind: "goal.input", role: "input" }, { kind: "goal.input.proposal", role: "input", proposal: true },
    { kind: "goal.output", role: "output" }, { kind: "goal.output.proposal", role: "output", proposal: true },
  ] },
  attention: { subjects: ["goal_decision"], inbox: ["goal_decision"] },
  databases: { project: GOALS_PROJECT_DATABASE, home: GOALS_HOME_DATABASE },
  background: { jobs: [{ job_id: GOALS_CATCH_UP_JOB, reason: "项目打开时补开目标板，补齐待决定的提醒", permissions: ["storage:private", "attention:read", "attention:write", "journal:project"] }] },
  routes: GOALS_ROUTES,
  ui: {
    messages: GOALS_MESSAGES,
    // English for the words still keyed by their Chinese text (PG-071); the order is the one the Host's catalog used to merge them in.
    translations: {
      ...GOALS_POLICY_EN,
      ...GOALS_SAFETY_EN,
      ...GOALS_RELATION_EN,
      ...GOALS_TREE_EN,
      ...GOALS_MOMENTUM_EN,
      ...GOALS_WORKSPACE_EN,
      ...GOALS_DOCUMENT_EN,
      ...GOALS_CONTEXT_EN,
      ...GOALS_STATUS_EN,
      ...GOALS_DIALOGS_EN,
      ...GOALS_PLANNING_EN,
      ...GOALS_PROPOSAL_EN,
    },
    contributions: [GOALS_TREE_UI_CONTRIBUTION_ID, GOALS_SETTINGS_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "tree", slot: "navigator", title: "Goals", contribution_id: GOALS_TREE_UI_CONTRIBUTION_ID, icon: "target", hue: "blue", order: 10, rail: "core", pinned_default: true, accepts_objects: true,
        start: { title: "推进一个目标", hint: "明确要做成什么，接着往下走。" } },
      { view_id: "settings", slot: "settings", title: "Goals", contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID, icon: "workflow", order: 120 },
    ],
  },
};
