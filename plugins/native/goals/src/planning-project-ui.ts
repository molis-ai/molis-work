import type { PlanningMethodPack, PlanningMethodComposition, GoalsPlanningView, GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningPresentation } from "./planning-presentation.js";
import { PLANNING_SETTINGS_CLIENT_SCRIPT, PLANNING_ADOPTION_CLIENT_SCRIPT } from "./planning-client.js";
export function createPlanningProjectRenderer(primitives: GoalsPlanningPrimitives) {
    const { translate: L, escapeHtml, icon, listJoin, withDesktopQuery, renderPage } = primitives;
    const { planningSettingsHref, renderPlanningCompositionRows, renderPlanningDirectory } = createPlanningPresentation(primitives);
    return function renderProject(view: GoalsPlanningView, methods: readonly PlanningMethodPack[], composition: PlanningMethodComposition, desktopShell = false): string {
        const project = view.project;
        const projectMethods = methods.filter((method) => method.scope === "project");
        const selectedMethods = projectMethods.filter((method) => method.enabled);
        const inactiveProjectMethods = projectMethods.filter((method) => !method.enabled);
        const availableMethods = methods.filter((method) => method.scope !== "project" && method.enabled);
        const basePath = `${view.route_prefix}/settings/planning`;
        const globalLibraryHref = planningSettingsHref("/settings/planning", project, desktopShell);
        const newProjectHref = desktopShell ? withDesktopQuery(`${basePath}/new`) : `${basePath}/new`;
        const orderedSelectedMethods = composition.method_pack_ids
            .map((methodId) => selectedMethods.find((method) => method.method_id === methodId))
            .filter((method): method is PlanningMethodPack => method != null);
        const compositionRows = renderPlanningCompositionRows(orderedSelectedMethods, basePath, desktopShell);
        const inactiveRows = renderPlanningCompositionRows(inactiveProjectMethods, basePath, desktopShell);
        const adoptedIds = new Set(projectMethods.map((method) => method.method_id));
        const methodDirectory = project ? renderPlanningDirectory(availableMethods, project, adoptedIds) : "";
        const pagePath = desktopShell ? withDesktopQuery(basePath) : basePath;
        const returnHref = view.route_prefix || "/";
        const projectName = project?.display_name ?? L("当前项目");
        const compositionContent = selectedMethods.length
            ? `<div class="planning-composition-overview"><div><strong>${L("{count} 套方法共同生效", { count: selectedMethods.length })}</strong><p>${escapeHtml(listJoin(composition.method_names))}</p></div><div class="planning-composition-facts"><span>${L("{count} 个覆盖项", { count: composition.required_coverage.length })}</span><span>${L("{count} 条依赖规则", { count: composition.dependency_rules.length })}</span><span>${L("{count} 项完成检查", { count: composition.completion_checks.length })}</span></div></div><div class="planning-composition-list">${compositionRows}</div>`
            : `<div class="work-planning-empty"><h3>${L("尚未建立项目规划组合")}</h3><p>${L("从左侧列表点开方法，再加入这个项目。尚未添加时，Runtime 仍会按每个 Goal 的具体工作选择相关方法。")}</p></div>`;
        const inactiveSection = inactiveProjectMethods.length
            ? `<section class="planning-inactive-section" aria-labelledby="planning-inactive-title"><div class="work-planning-section-header"><h2 id="planning-inactive-title">${L("未启用的方法")}</h2><p>${L("这些项目方法仍然保留，但不会参与当前组合；打开后可以重新启用。")}</p></div><div class="planning-composition-list">${inactiveRows}</div></section>`
            : "";
        return renderPage({ title: L("工作规划") + " · " + projectName, heading: projectName, subtitle: L("工作规划"), returnHref, pagePath,
            body: `<section class="work-planning" data-planning-split="hero"><div class="work-planning-layout"><div class="work-planning-directory" aria-label="${L("方法目录")}"><input class="mw-input" type="search" data-planning-search placeholder="${L("搜索规划方法")}" aria-label="${L("搜索规划方法")}">${methodDirectory}<p class="planning-filter-empty" data-planning-filter-empty${availableMethods.length ? " hidden" : ""}>${L("没有匹配的方法，试试其他关键词或分类。")}</p><p class="planning-adoption-error" data-planning-adoption-error role="alert" hidden></p></div><div class="work-planning-stage"><section class="planning-composition-section work-planning-hero" data-planning-hero aria-labelledby="planning-composition-title"><header><div><h1 id="planning-composition-title">${L("当前规划组合")}</h1><p>${L("这些方法共同生效。Runtime 还会根据具体 Goal 补充相关方法。")}</p></div><div class="work-planning-hero-actions"><a class="mw-btn mw-btn--secondary" href="${globalLibraryHref}">${L("浏览完整方法库")}</a><button class="mw-btn mw-btn--primary" type="button" data-planning-open data-planning-detail-path="${newProjectHref}">${icon("plus")}${L("从空白新建")}</button></div></header>${compositionContent}${inactiveSection}</section><section class="work-planning-detail" data-planning-detail aria-label="${L("方法正文")}"></section></div></div></section>`, clientScript: PLANNING_SETTINGS_CLIENT_SCRIPT + PLANNING_ADOPTION_CLIENT_SCRIPT, requiresControl: true });
    };
}
