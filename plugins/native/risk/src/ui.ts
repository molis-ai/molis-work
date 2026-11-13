import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderEmpty, renderPluginStageShell, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export const RISK_UI_CONTRIBUTION_ID = "io.molis.work.native.risk.ui.v1";

export const riskUiDescriptor: UiContributionDeclaration = {
  contribution_id: RISK_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "risk",
  label: "Risk",
  surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }],
  slots: [],
};

/** The overview's frame; its rows, the detail and the side view are drawn by the page's client (specs/risk-plugin §4.1, design docs/design/risk-plugin). */
export const riskUiContribution: UiContribution = {
  descriptor: riskUiDescriptor,
  render(request: UiRenderRequest): string {
    if (request.surface !== "workbench") throw new Error(`Risk UI surface ${request.surface} 不存在`);
    return renderPluginStageShell({ surface: "risk", label: uiText("risk.view.overview"), dataset: "risk",
      body: `<div data-risk="overview">${renderEmpty({ icon: "shield", title: uiText("risk.empty.title"), body: uiText("risk.empty.body") })}</div>` });
  },
};
