import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";

export const JELLY_UI_CONTRIBUTION_ID = "io.molis.work.jelly.ui.v1";
export interface JellyUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}
export interface JellyUiModel { readonly primitives: JellyUiPrimitives }
export const jellyUiDescriptor: UiContributionDeclaration = {
  contribution_id: JELLY_UI_CONTRIBUTION_ID,
  kind: "primary-page", navigation_id: "jelly", label: "Jelly",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ], slots: [],
};
export const jellyUiContribution: UiContribution<JellyUiModel> = {
  descriptor: jellyUiDescriptor,
  render(request: UiRenderRequest<JellyUiModel>): string {
    if (request.surface === "directory") return "";
    if (request.surface === "workbench") return renderJellyWorkbench(request.model);
    throw new Error(`Unknown Jelly UI surface: ${request.surface}`);
  },
};

/** The page's frame; the client draws the calendar, the day beside it and the notes inside `[data-jelly-page]`. */
export function renderJellyWorkbench(_model: JellyUiModel): string {
  return renderPluginStageShell({ surface: "jelly", label: "Jelly", dataset: "jelly", extraAttrs: "data-stage-custom-layout", body: `
    <div class="jelly-page" data-jelly-page aria-live="polite"><p class="jelly-muted jelly-pad">${uiText("jelly.load.opening")}</p></div>
  ` });
}
