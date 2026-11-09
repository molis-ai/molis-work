import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PlanningMethodPack, PlanningMethodComposition, GoalsPlanningView, GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningPresentation } from "./planning-presentation.js";
import { PLANNING_SETTINGS_CLIENT_SCRIPT, PLANNING_ADOPTION_CLIENT_SCRIPT } from "./planning-client.js";
export function createPlanningProjectRenderer(primitives: GoalsPlanningPrimitives) {
    const { escapeHtml, icon, listJoin, withDesktopQuery, renderPage } = primitives;
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
        const projectName = project?.display_name ?? uiText.text("goals.planning-project-ui.current-project");
        const compositionContent = selectedMethods.length
            ? `<div class="planning-composition-overview"><div><strong>${uiText("goals.planning-project-ui.count-count-together", { count: selectedMethods.length })}</strong><p>${escapeHtml(listJoin(composition.method_names))}</p></div><div class="planning-composition-facts"><span>${uiText("goals.planning-project-ui.count-coverage-checks", { count: composition.required_coverage.length })}</span><span>${uiText("goals.planning-project-ui.count-dependency-rules", { count: composition.dependency_rules.length })}</span><span>${uiText("goals.planning-project-ui.count-completion-checks", { count: composition.completion_checks.length })}</span></div></div><div class="planning-composition-list">${compositionRows}</div>`
            : `<div class="work-planning-empty"><h3>${uiText("goals.planning-project-ui.no-project-planning-composition-yet")}</h3><p>${uiText("goals.planning-project-ui.open-method-list-left-then-add-project-until")}</p></div>`;
        const inactiveSection = inactiveProjectMethods.length
            ? `<section class="planning-inactive-section" aria-labelledby="planning-inactive-title"><div class="work-planning-section-header"><h2 id="planning-inactive-title">${uiText("goals.planning-project-ui.disabled-methods")}</h2><p>${uiText("goals.planning-project-ui.these-project-methods-preserved-but-do-not-participate")}</p></div><div class="planning-composition-list">${inactiveRows}</div></section>`
            : "";
        return renderPage({ title: uiText.text("goals.planning-project-ui.work-planning") + " · " + projectName, heading: projectName, subtitle: uiText.text("goals.planning-project-ui.work-planning"), returnHref, pagePath,
            body: `<section class="work-planning" data-planning-split="hero"><div class="work-planning-layout"><div class="work-planning-directory" aria-label="${uiText("goals.planning-project-ui.method-directory")}"><input class="mw-input" type="search" data-planning-search placeholder="${uiText("goals.planning-project-ui.search-planning-methods")}" aria-label="${uiText("goals.planning-project-ui.search-planning-methods")}">${methodDirectory}<p class="planning-filter-empty" data-planning-filter-empty${availableMethods.length ? " hidden" : ""}>${uiText("goals.planning-project-ui.no-matching-methods-try-another-search-category")}</p><p class="planning-adoption-error" data-planning-adoption-error role="alert" hidden></p></div><div class="work-planning-stage"><section class="planning-composition-section work-planning-hero" data-planning-hero aria-labelledby="planning-composition-title"><header><div><h1 id="planning-composition-title">${uiText("goals.planning-project-ui.current-planning-composition")}</h1><p>${uiText("goals.planning-project-ui.these-methods-apply-together-runtime-adds-relevant-methods")}</p></div><div class="work-planning-hero-actions"><a class="mw-btn mw-btn--secondary" href="${globalLibraryHref}">${uiText("goals.planning-project-ui.browse-full-method-library")}</a><button class="mw-btn mw-btn--primary" type="button" data-planning-open data-planning-detail-path="${newProjectHref}">${icon("plus")}${uiText("goals.planning-project-ui.create-scratch")}</button></div></header>${compositionContent}${inactiveSection}</section><section class="work-planning-detail" data-planning-detail aria-label="${uiText("goals.planning-project-ui.method")}"></section></div></div></section>`, clientScript: PLANNING_SETTINGS_CLIENT_SCRIPT + PLANNING_ADOPTION_CLIENT_SCRIPT, requiresControl: true });
    };
}
