import type { UiContribution, UiContributionDeclaration, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderPluginStageShell, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export const WORK_BRIEF_UI_CONTRIBUTION_ID = "io.molis.work.native.work-brief.ui";
/**
 * Where the page shows objects of other plugins: the shell draws each as its owner presents it (name, state, open, peek), outside
 * the page. A page has at most four such places, so they go by section: the basis of the sentence in hand, what waits for the
 * person, what changed since the version before, and the object of a next step.
 */
const WORK_BRIEF_SLOTS = { cite: "work-brief.cite", attention: "work-brief.attention", changed: "work-brief.changed", next: "work-brief.next" } as const;

const workBriefUiDescriptor: UiContributionDeclaration = {
  contribution_id: WORK_BRIEF_UI_CONTRIBUTION_ID,
  kind: "primary-page",
  navigation_id: "work-brief",
  label: "Work Brief",
  surfaces: [{ surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" }],
  slots: Object.values(WORK_BRIEF_SLOTS).map(slot_id => ({ slot_id, accepts: [], accepts_forms: ["row"], max: slot_id === WORK_BRIEF_SLOTS.cite ? 8 : 12 })),
};

/** The page's frame. The client (src/browser, bundled into dist/work-brief-client.js) draws inside `[data-work-brief-body]`. */
export const workBriefUiContribution: UiContribution = {
  descriptor: workBriefUiDescriptor,
  render(request: UiRenderRequest): string {
    if (request.surface !== "workbench") throw new Error(`Unknown Work Brief UI surface: ${String(request.surface)}`);
    return renderPluginStageShell({ surface: "work-brief", label: uiText("work-brief.view.brief"), dataset: "workBrief",
      body: `<div class="wb mw-layout-primitives" data-work-brief-body aria-live="polite"><p class="wb-muted" aria-busy="true">${uiText("work-brief.page.loading")}</p></div>` });
  },
};
