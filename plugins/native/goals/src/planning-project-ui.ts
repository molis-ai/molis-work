import type { PlanningMethodPack, PlanningMethodComposition, GoalsPlanningView, GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningPresentation } from "./planning-presentation.js";
import { PLANNING_SETTINGS_CLIENT_SCRIPT, PLANNING_ADOPTION_CLIENT_SCRIPT } from "./planning-client.js";
export function createPlanningProjectRenderer(primitives: GoalsPlanningPrimitives) {
    const { translate: L, escapeHtml, icon, listJoin, withDesktopQuery, renderPage } = primitives;
    const { planningSettingsHref, renderPlanningCompositionRows, renderPlanningAdoptionCards } = createPlanningPresentation(primitives);
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
        const adoptionCards = project ? renderPlanningAdoptionCards(availableMethods, project, desktopShell) : "";
        const pagePath = desktopShell ? withDesktopQuery(basePath) : basePath;
        const returnHref = view.route_prefix || "/";
        const projectName = project?.display_name ?? L("当前项目");
        const compositionContent = selectedMethods.length
            ? `<div class="planning-composition-overview"><div><strong>${L("{count} 套方法共同生效", { count: selectedMethods.length })}</strong><p>${escapeHtml(listJoin(composition.method_names))}</p></div><div class="planning-composition-facts"><span>${L("{count} 个覆盖项", { count: composition.required_coverage.length })}</span><span>${L("{count} 条依赖规则", { count: composition.dependency_rules.length })}</span><span>${L("{count} 项完成检查", { count: composition.completion_checks.length })}</span></div></div><div class="planning-composition-list">${compositionRows}</div>`
            : `<div class="work-planning-empty"><h3>${L("尚未建立项目规划组合")}</h3><p>${L("从下方添加项目长期采用的方法。尚未添加时，Runtime 仍会按每个 Goal 的具体工作选择相关方法。")}</p></div>`;
        const inactiveSection = inactiveProjectMethods.length
            ? `<section class="planning-inactive-section" aria-labelledby="planning-inactive-title"><div class="work-planning-section-header"><h2 id="planning-inactive-title">${L("未启用的方法")}</h2><p>${L("这些项目方法仍然保留，但不会参与当前组合；打开后可以重新启用。")}</p></div><div class="planning-composition-list">${inactiveRows}</div></section>`
            : "";
        return renderPage({ title: L("工作规划") + " · " + projectName, heading: projectName, subtitle: L("工作规划"), returnHref, pagePath,
            body: `<section class="work-planning"><header class="planning-page-header"><div><h1>${L("工作规划")}</h1><p>${L("选择项目共同采用的方法。它们将用于拆分目标、检查依赖和确认完成依据。", { name: projectName })}</p></div><div><a class="planning-secondary-action" href="${globalLibraryHref}">${L("浏览完整方法库")}</a> <a class="planning-primary-action" href="${newProjectHref}">${icon("plus")}${L("从空白新建")}</a></div></header><div class="settings-body"><section class="planning-composition-section" aria-labelledby="planning-composition-title"><div class="work-planning-section-header"><h2 id="planning-composition-title">${L("当前规划组合")}</h2><p>${L("这些方法共同生效。Runtime 还会根据具体 Goal 补充相关方法。")}</p></div>${compositionContent}</section><section class="planning-adoption-section" aria-labelledby="planning-adoption-title"><div class="work-planning-section-header"><h2 id="planning-adoption-title">${L("添加规划方法")}</h2><p>${L("可以继续加入多套互补方法。加入后会建立该项目的独立版本，原方法和其他项目不变。")}</p></div><div class="planning-adoption-tools"><input type="search" data-planning-search placeholder="${L("搜索规划方法")}" aria-label="${L("搜索规划方法")}"><nav class="planning-filters" aria-label="${L("筛选已有方法")}"><button type="button" data-planning-filter="all" aria-pressed="true">${L("全部")}</button><button type="button" data-planning-filter="work_type" aria-pressed="false">${L("工作类型")}</button><button type="button" data-planning-filter="domain" aria-pressed="false">${L("专业领域")}</button><button type="button" data-planning-filter="industry" aria-pressed="false">${L("行业方法")}</button><button type="button" data-planning-filter="overlay" aria-pressed="false">${L("场景叠加层")}</button><button type="button" data-planning-filter="mine" aria-pressed="false">${L("我的方法")}</button></nav></div><div class="planning-adoption-grid">${adoptionCards}<p class="planning-filter-empty" data-planning-filter-empty${availableMethods.length ? " hidden" : ""}>${L("没有匹配的方法，试试其他关键词或分类。")}</p></div><p class="planning-adoption-error" data-planning-adoption-error role="alert" hidden></p></section>${inactiveSection}</div></section>`, clientScript: PLANNING_SETTINGS_CLIENT_SCRIPT + PLANNING_ADOPTION_CLIENT_SCRIPT, requiresControl: true });
    };
}
