import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import { renderWorkSessionSurface } from "./render.js";
import type { WorkUiModel, WorkUiSurface } from "./types.js";

export const WORK_UI_CONTRIBUTION_ID = "io.molis.work.native.work.ui.v1";
export const workUiContribution: UiContribution<WorkUiModel> = {
  descriptor: {
    contribution_id: WORK_UI_CONTRIBUTION_ID,
    plugin_id: "io.molis.work.native.work",
    kind: "primary-page",
    navigation_id: "sessions",
    label: "Sessions",
    surfaces: [
      { surface_id: "root", target_slot_id: "workbench.directory", format: "declarative-html" },
      { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
      { surface_id: "main", target_slot_id: "workbench.main", format: "declarative-html" },
      { surface_id: "overlay", target_slot_id: "workbench.overlay", format: "declarative-html" },
    ],
    slots: [],
  },
  render(request) {
    return renderWorkSessionSurface(request.surface as WorkUiSurface, request.model);
  },
};
