import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderPluginStageShell, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export { RISK_STYLES } from "./styles.js";

export const RISK_UI_CONTRIBUTION_ID = "io.molis.work.native.risk.ui";
/** Where the record shows each linked object: the shell draws it as its owner presents it, outside the page. */
export const RISK_LINKS_SLOT = "risk.links";

export const riskUiDescriptor: UiContributionDeclaration = {
  contribution_id: RISK_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "risk",
  label: "Risk",
  surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "record", target_slot_id: "workbench.side", format: "declarative-html" }],
  slots: [{ slot_id: RISK_LINKS_SLOT, accepts: [], accepts_forms: ["card"], max: 1 }],
};

/**
 * The page's frame: the stage (overview, a risk's record, the new-risk form) and the side view (one risk, compact). The client
 * (src/browser, bundled into dist/risk-client.js) draws inside `[data-risk-body]` (specs/risk-plugin/implementation.md §4.1).
 */
export const riskUiContribution: UiContribution = {
  descriptor: riskUiDescriptor,
  render(request: UiRenderRequest): string {
    if (request.surface !== "workbench" && request.surface !== "record") throw new Error(`Risk UI surface ${request.surface} 不存在`);
    const side = request.surface === "record";
    return renderPluginStageShell({ surface: "risk", label: uiText("risk.view.overview"), dataset: "risk", extraAttrs: side ? "data-risk-side" : undefined,
      body: `<div class="rk" data-risk-body aria-live="polite"><p class="rk-muted" aria-busy="true">${uiText("risk.overview.loading")}</p></div>` });
  },
};
