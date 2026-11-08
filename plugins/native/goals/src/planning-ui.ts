import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsPlanningPrimitives } from "./planning-ui-model.js";
import { createPlanningLibraryRenderer } from "./planning-library-ui.js";
import { createPlanningMethodRenderer } from "./planning-method-ui.js";
import { createPlanningProjectRenderer } from "./planning-project-ui.js";
export interface GoalsPlanningRenderer {
    renderLibrary: ReturnType<typeof createPlanningLibraryRenderer>;
    renderMethod: ReturnType<typeof createPlanningMethodRenderer>;
    renderProject: ReturnType<typeof createPlanningProjectRenderer>;
}
export const GOALS_PLANNING_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.planning.v1";
export type GoalsPlanningUiModel = {
    primitives: GoalsPlanningPrimitives;
} & ({
    kind: "library";
    args: Parameters<GoalsPlanningRenderer["renderLibrary"]>;
} | {
    kind: "method";
    args: Parameters<GoalsPlanningRenderer["renderMethod"]>;
} | {
    kind: "project";
    args: Parameters<GoalsPlanningRenderer["renderProject"]>;
});
/** Which surface each renderer method mounts (W5-06): the shell builds its renderer from this, and the descriptor lists these. */
export const GOALS_PLANNING_UI_SURFACES = { renderLibrary: "library", renderMethod: "method", renderProject: "project" } as const satisfies Record<keyof GoalsPlanningRenderer, GoalsPlanningUiModel["kind"]>;
export const goalsPlanningUiContribution: UiContribution<GoalsPlanningUiModel> = {
    descriptor: {
        contribution_id: GOALS_PLANNING_UI_CONTRIBUTION_ID, kind: "embedded", label: "Planning methods",
        surfaces: Object.values(GOALS_PLANNING_UI_SURFACES).map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
    },
    render({ surface, model }) {
        if (surface !== model.kind)
            throw new Error("Goals Planning surface does not match its model");
        switch (model.kind) {
            case "library": return createPlanningLibraryRenderer(model.primitives)(...model.args);
            case "method": return createPlanningMethodRenderer(model.primitives)(...model.args);
            case "project": return createPlanningProjectRenderer(model.primitives)(...model.args);
        }
    },
};
