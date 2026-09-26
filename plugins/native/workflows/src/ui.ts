import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { icon, renderPluginStageShell } from "@molis-ai/molis-work-design-system";
import { WORKFLOWS_PLUGIN_ID } from "./model.js";

export const WORKFLOWS_UI_CONTRIBUTION_ID = "io.molis.work.workflows.ui.v1";

export type WorkflowsUiSurface = "directory" | "workbench";

export interface WorkflowsUiPrimitives {
  escape(value: unknown): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface WorkflowsUiModel {
  readonly primitives: WorkflowsUiPrimitives;
}

export const workflowsUiDescriptor: UiContributionDescriptor = {
  contribution_id: WORKFLOWS_UI_CONTRIBUTION_ID,
  plugin_id: WORKFLOWS_PLUGIN_ID,
  kind: "primary-page",
  navigation_id: "workflows",
  label: "工作流程",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const workflowsUiContribution: UiContribution<WorkflowsUiModel> = {
  descriptor: workflowsUiDescriptor,
  render(request: UiRenderRequest<WorkflowsUiModel>): string {
    switch (request.surface as WorkflowsUiSurface) {
      case "directory":
        return "";
      case "workbench":
        return renderWorkflowsWorkbench(request.model);
      default:
        throw new Error(`Workflows UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

/** The shell only; the client draws the list, the chain editor and the run view from the plugin API. */
export function renderWorkflowsWorkbench(model: WorkflowsUiModel): string {
  const { primitives: p } = model;
  const t = (value: string) => p.escape(p.text(value));
  return renderPluginStageShell({
    surface: "workflows",
    label: p.text("工作流程"),
    dataset: "workflows",
    extraAttrs: 'data-wf-mode="list"',
    body: `
    <div class="plugin-stage-list feed-stage-list feed-stage-tree wf-list" data-wf-list-pane>
      <header class="plugin-stage-chrome">
        <button class="mw-btn mw-btn--ghost tree-create" type="button" data-wf-action="new">${icon("plus")}<span>${t("新建流程")}</span></button>
      </header>
      <div data-wf-list aria-live="polite"><p class="wf-muted">${t("正在读取流程…")}</p></div>
    </div>
    <div class="plugin-stage-workspace wf-workspace" data-wf-workspace hidden>
      <div class="wf-view" data-wf-view></div>
    </div>
    <div class="wf-pop" data-wf-pop popover="auto" role="dialog" aria-label="${t("编辑")}"></div>
    <dialog class="mw-dialog mw-dialog--form wf-dialog" data-wf-dialog aria-labelledby="wf-dialog-title">
      <form method="dialog" class="mw-form" data-wf-dialog-form>
        <header class="mw-form__header"><h2 id="wf-dialog-title" data-wf-dialog-title></h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-wf-action="dialog-close" aria-label="${t("关闭")}">${icon("x")}</button></header>
        <div class="mw-form__body" data-wf-dialog-body></div>
        <p class="wf-error" role="alert" data-wf-dialog-error hidden></p>
        <footer class="mw-form__footer"><button class="mw-btn mw-btn--secondary" type="button" data-wf-action="dialog-close">${t("取消")}</button><button class="mw-btn mw-btn--primary" type="submit" data-wf-dialog-submit></button></footer>
      </form>
    </dialog>
    <p class="wf-toast" role="status" data-wf-toast hidden></p>`,
  });
}
