import type { UiHostApi, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { WorkUiModel } from "@molis-ai/molis-work-plugin-work";
import { WORK_UI_CONTRIBUTION_ID, type WorkUiSurface, type ProjectOperationsProject, type ProjectOperationsData, type ProjectOperationsSlice } from "@molis-ai/molis-work-plugin-work";

/** Keep placement in the Workbench while all Session presentation belongs to Work. */
export function createWorkSessionRenderer(
  host: UiHostApi,
  slots: Readonly<Record<"directory" | "main" | "overlay", UiSlotDescriptor>>,
) {
  return function renderProjectOperations(
  project: ProjectOperationsProject | null,
  data: ProjectOperationsData | undefined,
  icon: WorkUiModel["icon"],
  text?: WorkUiModel["text"],
): ProjectOperationsSlice {
  const render = (surface: WorkUiSurface) => host.mount({
    slot: slots[surface === "root" ? "directory" : surface],
    contribution: { contribution_id: WORK_UI_CONTRIBUTION_ID, surface, model: { project, data, icon, text } },
  }).html;
  return { rootItems: render("root"), directories: render("directory"), surfaces: render("main"), overlays: render("overlay") };
  };
}
