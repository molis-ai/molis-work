import type { PlanningMethodPack, GoalsPlanningProject, GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningPresentation } from "./planning-presentation.js";
import { createPlanningDetailRenderer } from "./planning-detail-ui.js";
import { createPlanningEditRenderer } from "./planning-edit-ui.js";
import { PLANNING_SETTINGS_CLIENT_SCRIPT } from "./planning-client.js";
export function createPlanningMethodRenderer(primitives: GoalsPlanningPrimitives) {
    const { translate: L, escapeHtml, icon, withDesktopQuery, renderPage } = primitives;
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
        const title = mode === "new" ? (projectScope ? L("新建项目方法") : L("新建我的方法")) : mode === "edit" ? (method?.scope === "built_in" ? L("创建「{name}」的个人版本", { name: method.name }) : L("编辑「{name}」", { name: method?.name ?? "" })) : method?.name ?? L("规划方法");
        const pagePath = mode === "detail" ? detailHref : editHref;
        const shellReturn = project ? (desktopShell ? withDesktopQuery(`/projects/${encodeURIComponent(project.project_id)}`) : `/projects/${encodeURIComponent(project.project_id)}`) : (desktopShell ? withDesktopQuery("/") : "/");
        const actionLabel = method?.scope === "built_in" ? L("创建我的版本") : projectScope ? L("编辑项目方法") : L("编辑方法");
        return renderPage({ title, heading: project?.display_name ?? L("规划方法"), subtitle: projectScope ? L("工作规划") : L("规划方法库"), returnHref: shellReturn, pagePath,
            body: `${mode === "detail" && method ? `<article class="planning-detail"><nav class="mw-breadcrumb" aria-label="${L("路径")}"><ol><li><a class="planning-back" href="${libraryHref}">${icon("arrow")}${projectScope ? L("返回工作规划") : L("返回方法库")}</a></li></ol></nav><div class="planning-detail-scroll"><header class="planning-detail-header"><div class="planning-detail-header-main"><div><div class="planning-detail-meta"><span>${escapeHtml(planningMethodKindLabel(method.kind))}</span><span>${escapeHtml(planningMethodScopeLabel(method.scope))}</span><span>${L("版本 {version}", { version: method.version })}</span></div><h1>${escapeHtml(method.name)}</h1><div class="planning-detail-lede"><p>${escapeHtml(method.summary)}</p>${method.applies_to.length ? `<div class="planning-detail-tags" aria-label="${L("适合哪些工作")}">${method.applies_to.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}</div></div><a class="mw-btn mw-btn--primary" href="${editHref}">${icon(method.scope === "built_in" ? "copy" : "settings")}${actionLabel}</a></div></header><div class="settings-body">${renderPlanningMethodDetailSections(method)}</div></div></article>` : `<section class="planning-edit"><a class="planning-back" href="${returnHref}">${icon("arrow")}${method ? L("返回方法详情") : projectScope ? L("返回工作规划") : L("返回方法库")}</a><div class="planning-detail-scroll"><header class="planning-page-header"><div><h1>${escapeHtml(title)}</h1><p>${method?.scope === "built_in" ? L("系统模板不会被修改；保存后会生成你自己的版本。") : L("按用户能理解的方式维护规划路径、必答问题和依赖判断。")}</p></div></header><div class="settings-body">${renderPlanningEditForm(method, saveScope, project, apiEndpoint, returnHref)}</div></div></section>`}`, clientScript: PLANNING_SETTINGS_CLIENT_SCRIPT, requiresControl: true });
    };
}
