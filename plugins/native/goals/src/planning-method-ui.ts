import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PlanningMethodPack, GoalsPlanningProject, GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningPresentation } from "./planning-presentation.js";
import { createPlanningDetailRenderer } from "./planning-detail-ui.js";
import { createPlanningEditRenderer } from "./planning-edit-ui.js";
import { PLANNING_SETTINGS_CLIENT_SCRIPT } from "./planning-client.js";
export function createPlanningMethodRenderer(primitives: GoalsPlanningPrimitives) {
    const { escapeHtml, icon, withDesktopQuery, renderPage } = primitives;
    const { planningSettingsHref, planningMethodKindLabel, planningMethodScopeLabel } = createPlanningPresentation(primitives);
    const renderPlanningMethodDetailSections = createPlanningDetailRenderer(primitives);
    const renderPlanningEditForm = createPlanningEditRenderer(primitives);
    return function renderMethod(method: PlanningMethodPack | null, mode: "detail" | "edit" | "new", saveScope: "personal" | "project", project: GoalsPlanningProject | null, desktopShell = false): string {
        const projectScope = saveScope === "project";
        const basePath = projectScope && project ? `/projects/${encodeURIComponent(project.project_id)}/settings/planning` : "/settings/planning";
        const libraryHref = projectScope ? (desktopShell ? withDesktopQuery(basePath) : basePath) : planningSettingsHref(basePath, project, desktopShell);
        const detailPath = method ? `${basePath}/${encodeURIComponent(method.method_id)}` : basePath;
        const detailHref = projectScope ? (desktopShell ? withDesktopQuery(detailPath) : detailPath) : planningSettingsHref(detailPath, project, desktopShell);
        const editPath = method ? `${detailPath}/edit` : `${basePath}/new`;
        const editHref = projectScope ? (desktopShell ? withDesktopQuery(editPath) : editPath) : planningSettingsHref(editPath, project, desktopShell);
        const apiEndpoint = projectScope && project ? `/projects/${encodeURIComponent(project.project_id)}/api/settings/planning-methods` : "/api/settings/planning-methods";
        const returnHref = method ? detailHref : libraryHref;
        const title = mode === "new" ? (projectScope ? uiText.text("goals.planning-method-ui.create-project-method") : uiText.text("goals.planning-method-ui.create-my-method")) : mode === "edit" ? (method?.scope === "built_in" ? uiText.text("goals.planning-method-ui.create-my-version-name", { name: method.name }) : uiText.text("goals.planning-method-ui.edit-name", { name: method?.name ?? "" })) : method?.name ?? uiText.text("goals.planning-method-ui.planning-methods");
        const pagePath = mode === "detail" ? detailHref : editHref;
        const shellReturn = project ? (desktopShell ? withDesktopQuery(`/projects/${encodeURIComponent(project.project_id)}`) : `/projects/${encodeURIComponent(project.project_id)}`) : (desktopShell ? withDesktopQuery("/") : "/");
        const actionLabel = method?.scope === "built_in" ? uiText.text("goals.planning-method-ui.create-my-version") : projectScope ? uiText.text("goals.planning-method-ui.edit-project-method") : uiText.text("goals.planning-method-ui.edit-method");
        return renderPage({ title, heading: project?.display_name ?? uiText.text("goals.planning-method-ui.planning-methods"), subtitle: projectScope ? uiText.text("goals.planning-method-ui.work-planning") : uiText.text("goals.planning-method-ui.planning-method-library"), returnHref: shellReturn, pagePath,
            body: `${mode === "detail" && method ? `<article class="planning-detail"><nav class="mw-breadcrumb" aria-label="${uiText("goals.planning-method-ui.path")}"><ol><li><a class="planning-back" href="${libraryHref}">${icon("arrow")}${projectScope ? uiText("goals.planning-method-ui.back-work-planning") : uiText("goals.planning-method-ui.back-method-library")}</a></li></ol></nav><div class="planning-detail-scroll"><header class="planning-detail-header"><div class="planning-detail-header-main"><div><div class="planning-detail-meta"><span>${escapeHtml(planningMethodKindLabel(method.kind))}</span><span>${escapeHtml(planningMethodScopeLabel(method.scope))}</span><span>${uiText("goals.planning-method-ui.version-version", { version: method.version })}</span></div><h1>${escapeHtml(method.name)}</h1><div class="planning-detail-lede"><p>${escapeHtml(method.summary)}</p>${method.applies_to.length ? `<div class="planning-detail-tags" aria-label="${uiText("goals.planning-method-ui.what-work-fits")}">${method.applies_to.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}</div></div><a class="mw-btn mw-btn--primary" href="${editHref}">${icon(method.scope === "built_in" ? "copy" : "settings")}${actionLabel}</a></div></header><div class="settings-body">${renderPlanningMethodDetailSections(method)}</div></div></article>` : `<section class="planning-edit"><a class="planning-back" href="${returnHref}">${icon("arrow")}${method ? uiText("goals.planning-method-ui.back-method-details") : projectScope ? uiText("goals.planning-method-ui.back-work-planning") : uiText("goals.planning-method-ui.back-method-library")}</a><div class="planning-detail-scroll"><header class="planning-page-header"><div><h1>${escapeHtml(title)}</h1><p>${method?.scope === "built_in" ? uiText("goals.planning-method-ui.system-template-stays-unchanged-saving-creates-own-version") : uiText("goals.planning-method-ui.maintain-planning-path-required-questions-dependency-rules-user")}</p></div></header><div class="settings-body">${renderPlanningEditForm(method, saveScope, project, apiEndpoint, returnHref)}</div></div></section>`}`, clientScript: PLANNING_SETTINGS_CLIENT_SCRIPT, requiresControl: true });
    };
}
