import type {
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type { StagePageModel } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { goalsPagePorts } from "./page/workbench-stage.js";
import { createProjectGuidanceDocumentRenderer } from "./page/guidance-document.js";
import type { ProjectGuidanceView } from "./contract/goals.js";

/** Existing owner facts, carried by the platform model; presentation selection is the requested surface. */
interface GoalsSettingsData {
  guidance?: ProjectGuidanceView;
}

function renderSettingsContent(surface: string, model: StagePageModel<GoalsSettingsData>): string {
  const ports = goalsPagePorts(model), data = model.data ?? {};
  if (surface === "guidance") {
    if (!data.guidance) throw new Error("Goals guidance data is missing");
    return createProjectGuidanceDocumentRenderer({ readText: ports.readText, escapeHtml, icon, formatDate: ports.formatDate, renderHint: ports.renderHint })(data.guidance);
  }
  throw new Error(`Goals settings surface ${surface} 不存在`);
}

export const GOALS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.goals.settings.v1";

/**
 * Project guidance is drawn where the project settings place it. Embedded: Goals has no row of its own in the
 * settings directory, so this is no view of its Manifest.
 */
export const goalsSettingsUiDescriptor: UiContributionDeclaration = {
  contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID,
  kind: "embedded",
  label: "Goals",
  surfaces: [{ surface_id: "guidance", target_slot_id: "workbench.settings", format: "declarative-html" }],
  slots: [],
};

export const goalsSettingsUiContribution: UiContribution<StagePageModel<GoalsSettingsData>> = {
  descriptor: goalsSettingsUiDescriptor,
  render(request: UiRenderRequest<StagePageModel<GoalsSettingsData>>): string {
    return renderSettingsContent(request.surface, request.model);
  },
};
