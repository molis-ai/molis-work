import type { UiDeclaredMountHost } from "@molis-ai/molis-work-ui-host";
import type { WorkUiModel } from "@molis-ai/molis-work-plugin-work";
import { WORK_UI_CONTRIBUTION_ID, type WorkUiSurface, type ProjectOperationsProject, type ProjectOperationsData, type ProjectOperationsSlice } from "@molis-ai/molis-work-plugin-work";

/** All Session presentation belongs to Work; each surface is mounted in the slot Work declares for it. */
export function createWorkSessionRenderer(host: UiDeclaredMountHost) {
  return function renderProjectOperations(
  project: ProjectOperationsProject | null,
  data: ProjectOperationsData | undefined,
  icon: WorkUiModel["icon"],
  text?: WorkUiModel["text"],
): ProjectOperationsSlice {
  const render = (surface: WorkUiSurface) => host.mountDeclared({
    contribution_id: WORK_UI_CONTRIBUTION_ID, surface, model: { project, data, icon, text },
  }).html;
  return { rootItems: render("root"), directories: render("directory"), surfaces: render("main"), overlays: render("overlay") };
  };
}
