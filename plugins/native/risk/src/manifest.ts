import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { RISK_READ, riskActions } from "./actions.js";
import { RISK_PROJECT_DATABASE } from "./database.js";
import { RISK_PLUGIN_ID } from "./identity.js";
import { riskMethods } from "./methods.js";
import { riskPresentation, riskPresentationActions } from "./presentation.js";
import { riskReviewActions, SCHEDULE_TASKS } from "./review.js";
import { riskSearchActions } from "./search.js";
import { RISK_UI_CONTRIBUTION_ID } from "./ui.js";

const RISK_ACTIONS = [...Object.values(riskActions), ...Object.values(riskReviewActions), ...riskPresentationActions, riskSearchActions.entries, riskSearchActions.subject];
const ACTION_PERMISSIONS = [...new Set(RISK_ACTIONS.flatMap(definition => definition.action.permissions))];

/**
 * Risk: a project's risks as their own records, the overview grouped by status, and the source other plugins cite (a Goal's concern
 * names a risk by `{ kind: "risk", id }`; Work Brief reads them through `risk.list` and the reader). Placement is declarative; the
 * plugin runs under Plugin Runtime, one instance per project (`createRiskPlugin`).
 */
export const riskManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: RISK_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "风险",
  summary: "记下项目的风险，按状态看全局，到点复查。", summary_text: { key: "risk.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-risk-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    ...ACTION_PERMISSIONS.map(permission => ({ permission, required: false, reason: "按调用者授权使用风险能力" })),
    { permission: "storage:private", required: true, reason: "项目里的风险、关联与进展" },
    { permission: "actions:delegate", required: true, reason: "替当前调用者核对要关联的对象，并在 Schedule 里安排与归档风险的复查" },
  ],
  presentation: riskPresentation,
  actions: RISK_ACTIONS,
  methods: riskMethods.map(({ body: _body, body_by_locale: _localized, ...declared }) => ({ ...declared, tools: [...declared.tools] })),
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  read_groups: [{ group_id: "risk", title: "风险", description: "项目里的风险、它们的关联与进展",
    actions: [riskActions.list.capability_id, riskActions.get.capability_id, riskSearchActions.subject.capability_id, riskSearchActions.entries.capability_id] }],
  databases: { project: RISK_PROJECT_DATABASE },
  // A risk's review is a Schedule task (review.ts); called as the risk action's caller.
  capabilities: { provides: [], consumes: Object.values(SCHEDULE_TASKS).map(reference => reference.capability_id) },
  artifacts: { produces: [], consumes: [] },
  ui: { locales: { default: "zh", available: ["zh", "en"] },
    contributions: [RISK_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "overview", slot: "navigator", title: "风险", title_text: { key: "risk.view.overview" }, contribution_id: RISK_UI_CONTRIBUTION_ID, icon: "shield", hue: "orange",
        order: 44, accepts_objects: true },
    ],
  },
};

export { RISK_READ };
