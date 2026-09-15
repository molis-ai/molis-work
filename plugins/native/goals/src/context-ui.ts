import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import type { GoalsContextUiPrimitives } from "./context-ui-model.js";
import { createGoalContextRecordsRenderer } from "./context-records-ui.js";
import { createGoalContextCoverageRenderer } from "./context-coverage-ui.js";

function createContextRenderer(primitives: GoalsContextUiPrimitives) {
  const { renderAcceptanceSummary } = createGoalContextRecordsRenderer(primitives);
  const { renderChildProgress, renderContractCoverage } = createGoalContextCoverageRenderer(primitives);
  return { renderAcceptanceSummary, renderChildProgress, renderContractCoverage };
}
export type GoalsContextRenderer = ReturnType<typeof createContextRenderer>;
export const GOALS_CONTEXT_UI_CONTRIBUTION_ID = "io.molis.work.native.goals.context.v1";
export type GoalsContextUiModel = { primitives: GoalsContextUiPrimitives } & (
  | { kind: "acceptance-summary"; args: Parameters<GoalsContextRenderer["renderAcceptanceSummary"]> }
  | { kind: "child-progress"; args: Parameters<GoalsContextRenderer["renderChildProgress"]> }
  | { kind: "contract-coverage"; args: Parameters<GoalsContextRenderer["renderContractCoverage"]> }
);
export const goalsContextUiContribution: UiContribution<GoalsContextUiModel> = {
  descriptor: {
    contribution_id: GOALS_CONTEXT_UI_CONTRIBUTION_ID, plugin_id: "io.molis.work.native.goals", kind: "embedded", label: "Goal context",
    surfaces: ["acceptance-summary", "child-progress", "contract-coverage"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })), slots: [],
  },
  render({ surface, model }) {
    if (surface !== model.kind) throw new Error("Goals context surface does not match its model");
    const renderer = createContextRenderer(model.primitives);
    switch (model.kind) {
      case "acceptance-summary": return renderer.renderAcceptanceSummary(...model.args);
      case "child-progress": return renderer.renderChildProgress(...model.args);
      case "contract-coverage": return renderer.renderContractCoverage(...model.args);
    }
  },
};
