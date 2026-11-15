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
import type { ProjectGuidanceView, GoalPolicyHistoryRecord } from "./contract/goals.js";

/** Existing owner facts, carried by the platform model; presentation selection is the requested surface. */
interface GoalsSettingsData {
  guidance?: ProjectGuidanceView;
  policy_bindings?: GoalPolicyHistoryRecord[];
}

function renderSettingsContent(surface: string, model: StagePageModel<GoalsSettingsData>): string {
  const ports = goalsPagePorts(model), data = model.data ?? {}, project = model.context?.project ?? null;
  if (surface === "guidance") {
    if (!data.guidance) throw new Error("Goals guidance data is missing");
    return createProjectGuidanceDocumentRenderer({ readText: ports.readText, escapeHtml, icon, formatDate: ports.formatDate, renderHint: ports.renderHint })(data.guidance);
  }
  if (surface === "rules") return createGoalsPage(ports).goals.renderProjectPolicyDocument({ project, policy_bindings: data.policy_bindings ?? [] });
  throw new Error(`Goals settings surface ${surface} 不存在`);
}

export const GOALS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.goals.settings.v1";

/**
 * The project's guidance and rules, drawn where the project's settings place them. Embedded: Goals has no row of its own in the
 * settings directory, so this is no view of its Manifest.
 */
export const goalsSettingsUiDescriptor: UiContributionDeclaration = {
  contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID,
  kind: "embedded",
  label: "Goals",
  surfaces: ["guidance", "rules"].map(surface_id => ({ surface_id, target_slot_id: "workbench.settings", format: "declarative-html" })),
  slots: [],
};

export const goalsSettingsUiContribution: UiContribution<StagePageModel<GoalsSettingsData>> = {
  descriptor: goalsSettingsUiDescriptor,
  render(request: UiRenderRequest<StagePageModel<GoalsSettingsData>>): string {
    return renderSettingsContent(request.surface, request.model);
  },
};
