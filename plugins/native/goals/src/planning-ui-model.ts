import type { PlanningMethodPack, PlanningMethodComposition } from "@molis-ai/molis-work-contracts/modules/goals";
export type { PlanningMethodPack, PlanningMethodComposition };
export interface GoalsPlanningProject {
    project_id: string;
    display_name: string;
}
export interface GoalsPlanningView {
    project: GoalsPlanningProject | null;
    route_prefix: string;
}
export interface GoalsPlanningPage {
    title: string;
    heading: string;
    subtitle: string;
    returnHref: string;
    pagePath: string;
    body: string;
    clientScript: string;
    requiresControl: boolean;
    documentComment?: string;
}
export interface GoalsPlanningPrimitives {
    translate(text: string, values?: Record<string, string | number>): string;
    escapeHtml(value: string): string;
    icon(name: "arrow" | "plus" | "book" | "folder" | "user" | "trash" | "copy" | "settings" | "chevron-down"): string;
    listJoin(values: readonly string[]): string;
    settingsContextHref(path: string, project: GoalsPlanningProject | null, desktop: boolean): string;
    withDesktopQuery(path: string): string;
    /** Internal host frame; body is produced only by this contribution. */
    renderPage(page: GoalsPlanningPage): string;
}
