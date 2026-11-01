import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { StagePageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createGoalsPage } from "./page/index.js";
import { goalsPagePorts } from "./page/workbench-stage.js";
import { createProjectGuidanceDocumentRenderer } from "./page/guidance-document.js";
import { composePlanningMethodPacks } from "./module/planning/method-packs.js";
import { createGoalsRendererFactories } from "./page/factories.js";
import type { GoalsPlanningPrimitives } from "./planning-ui-model.js";
import type { ProjectGuidanceView, PlanningMethodPack, GoalPolicyHistoryRecord } from "./contract/goals.js";

/** Existing owner facts, carried by the platform model; presentation selection is the requested surface. */
interface GoalsSettingsData {
  guidance?: ProjectGuidanceView;
  policy_bindings?: GoalPolicyHistoryRecord[];
  methods?: readonly PlanningMethodPack[];
  method?: PlanningMethodPack | null;
}

function planningRenderer(model: StagePageModel<GoalsSettingsData>, ports: ReturnType<typeof goalsPagePorts>) {
  const desktop = model.request?.desktop === "true", document = model.drawing?.document;
  const primitives: GoalsPlanningPrimitives = { translate: ports.L, escapeHtml, icon, listJoin: ports.listJoin,
    settingsContextHref: model.drawing!.settingsContextHref, withDesktopQuery: model.drawing!.withDesktopQuery,
    renderPage: page => document ? document.render({ lang: document.lang, title: `${page.title} · Molis Work`,
      preamble_html: page.documentComment,
      body_html: `<header class="project-preferences-chrome"${desktop ? ' data-tauri-drag-region="deep"' : ""}><span>${document.navigation_html.includes("project-settings-navigation") ? ports.L("项目设置") : ports.L("全局设置")}</span><a href="${page.returnHref}" aria-label="${ports.L("返回工作台")}">${icon("x")}</a></header><main class="settings-shell">${document.navigation_html}<div class="settings-content">${page.body}</div></main><script>${document.client_i18n}${page.requiresControl ? document.request_client : ""}${page.clientScript}${document.foundation_client}</script>`,
    }) : page.body,
  };
  return createGoalsRendererFactories(ports.mount).planning(primitives);
}

function renderSettingsContent(surface: string, model: StagePageModel<GoalsSettingsData>): string {
  const ports = goalsPagePorts(model), data = model.data ?? {}, project = model.context?.project ?? null;
  if (surface === "guidance") {
    if (!data.guidance) throw new Error("Goals guidance data is missing");
    return createProjectGuidanceDocumentRenderer({ L: ports.L, escapeHtml, icon, formatDate: ports.formatDate, renderHint: ports.renderHint })(data.guidance);
  }
  if (surface === "rules") return createGoalsPage(ports).goals.renderProjectPolicyDocument({ project, policy_bindings: data.policy_bindings ?? [] });
  const planning = planningRenderer(model, ports), desktop = model.request?.desktop === "true", methods = data.methods ?? [];
  if (surface === "library") return planning.renderLibrary(methods, project, desktop);
  if (surface === "method") {
    const mode = model.request?.mode, scope = model.request?.save_scope;
    if ((mode !== "detail" && mode !== "edit" && mode !== "new") || (scope !== "personal" && scope !== "project")) throw new Error("Goals planning selection is invalid");
    return planning.renderMethod(data.method ?? null, mode, scope, project, desktop);
  }
  if (surface === "project") return planning.renderProject({ project, route_prefix: model.route_prefix }, methods,
    composePlanningMethodPacks(methods.filter(method => method.scope === "project" && method.enabled)), desktop);
  throw new Error(`Goals settings surface ${surface} 不存在`);
}

export const GOALS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.goals.settings.v1";

/**
 * Directory placement for the personal planning library.
 * The library, detail and edit documents stay on `/settings/planning`,
 * which the Host already renders. This contribution only registers the row.
 */
export const goalsSettingsUiDescriptor: UiContributionDeclaration = {
  contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID,
  kind: "settings-page",
  navigation_id: "planning",
  label: "Goals",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
    ...["guidance", "rules", "library", "method", "project"].map(surface_id => ({ surface_id, target_slot_id: "workbench.settings", format: "declarative-html" })),
  ],
  slots: [],
};

export const goalsSettingsUiContribution: UiContribution<{ marker?: string } | StagePageModel<GoalsSettingsData>> = {
  descriptor: goalsSettingsUiDescriptor,
  render(request: UiRenderRequest<{ marker?: string } | StagePageModel<GoalsSettingsData>>): string {
    if (request.surface !== "settings" && "primitives" in request.model) return renderSettingsContent(request.surface, request.model);
    if (request.surface !== "settings") {
      throw new Error(`Goals settings surface ${request.surface} 不存在`);
    }
    return `<section class="planning-catalog" data-goals-settings data-settings-panel="planning"></section>`;
  },
};
