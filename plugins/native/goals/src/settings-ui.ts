import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

export const GOALS_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.goals.settings.v1";

/**
 * Directory placement for the personal planning library.
 * The library, detail and edit documents stay on `/settings/planning`,
 * which the Host already renders. This contribution only registers the row.
 */
export const goalsSettingsUiDescriptor: UiContributionDescriptor = {
  contribution_id: GOALS_SETTINGS_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.goals",
  kind: "settings-page",
  navigation_id: "planning",
  label: "Goals",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

export const goalsSettingsUiContribution: UiContribution<{ marker?: string }> = {
  descriptor: goalsSettingsUiDescriptor,
  render(request: UiRenderRequest<{ marker?: string }>): string {
    if (request.surface !== "settings") {
      throw new Error(`Goals settings surface ${request.surface} 不存在`);
    }
    return `<section class="planning-catalog" data-goals-settings data-settings-panel="planning"></section>`;
  },
};
