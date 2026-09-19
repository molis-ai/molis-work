import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

import type { WorkspaceSelectionView } from "./selection.js";

export const WORKSPACE_UI_CONTRIBUTION_ID = "io.molis.work.native.workspace.ui.v1";

export interface WorkspaceUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
}

export interface WorkspaceUiModel {
  readonly route_prefix: string;
  readonly view: WorkspaceSelectionView;
  readonly primitives: WorkspaceUiPrimitives;
}

export const workspaceUiDescriptor: UiContributionDescriptor = {
  contribution_id: WORKSPACE_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.workspace",
  kind: "primary-page",
  navigation_id: "workspace",
  label: "Workspace",
  surfaces: [
    { surface_id: "source", target_slot_id: "workbench.directory", format: "declarative-html" },
  ],
  slots: [],
};

export const workspaceUiContribution: UiContribution<WorkspaceUiModel> = {
  descriptor: workspaceUiDescriptor,
  render(request: UiRenderRequest<WorkspaceUiModel>): string {
    return renderWorkspaceSource(request.model);
  },
};

/**
 * The source panel.
 *
 * When there is nothing to publish it says so and says what to do, because the
 * consequence — every downstream Plugin sitting empty — is otherwise
 * unexplained wherever the user happens to be looking.
 */
export function renderWorkspaceSource(model: WorkspaceUiModel): string {
  const { escape, icon } = model.primitives;
  const view = model.view;
  const header = view.workspace === null
    ? `<p class="workspace-empty">${escape(view.message)}</p>`
    : `<p class="workspace-current" data-workspace-id="${escape(view.workspace.workspace_id)}">`
      + `${icon("folder")}<span class="workspace-name">${escape(view.workspace.name)}</span></p>`;
  const trouble = view.recovery === undefined
    ? ""
    : `<p class="workspace-trouble">${escape(view.message)}<span class="workspace-recovery">${escape(view.recovery)}</span></p>`;
  const candidates = view.candidates.length === 0
    ? ""
    : `<ul class="workspace-candidates">${view.candidates.map((candidate) =>
      `<li><button type="button" data-action="workspace.select" data-workspace-id="${escape(candidate.workspace_id)}">`
      + `${escape(candidate.name)}</button></li>`).join("")}</ul>`;
  return `<section class="workspace-source" data-phase="${escape(view.phase)}" data-route="${escape(model.route_prefix)}">`
    + `${view.phase === "ready" ? header : trouble || header}${candidates}</section>`;
}
