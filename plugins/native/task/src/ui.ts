import type { TaskFrame, TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";
import type {
  UiContribution,
  UiContributionDescriptor,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";

export const TASK_UI_CONTRIBUTION_ID = "io.molis.work.native.task.ui.v1";

export type TaskUiSurface = "directory" | "workbench" | "frame";

export interface TaskUiPrimitives {
  escape(value: unknown): string;
  icon(name: string): string;
  text(value: string, values?: Record<string, string | number>): string;
}

export interface TaskUiItem {
  readonly task_id: string;
  readonly title: string;
  readonly goal_id: string | null;
  readonly goal_title: string | null;
  readonly updated_at: string;
}

export interface TaskUiModel {
  readonly tasks: readonly TaskUiItem[];
  readonly primitives: TaskUiPrimitives;
}

export const taskUiDescriptor: UiContributionDescriptor = {
  contribution_id: TASK_UI_CONTRIBUTION_ID,
  plugin_id: "io.molis.work.native.task",
  kind: "primary-page",
  navigation_id: "task",
  label: "Task",
  surfaces: [
    { surface_id: "directory", target_slot_id: "workbench.directory", format: "declarative-html" },
    { surface_id: "workbench", target_slot_id: "workbench.main", format: "declarative-html" },
    { surface_id: "frame", target_slot_id: "workbench.main", format: "declarative-html" },
  ],
  slots: [],
};

export const taskUiContribution: UiContribution<TaskUiModel> = {
  descriptor: taskUiDescriptor,
  render(request: UiRenderRequest<TaskUiModel>): string {
    switch (request.surface as TaskUiSurface) {
      case "directory":
        return renderTaskDirectory(request.model);
      case "workbench":
        return renderTaskWorkbench(request.model);
      case "frame":
        return renderTaskFrame(request.model);
      default:
        throw new Error(`Task UI surface ${(request as UiRenderRequest).surface} 不存在`);
    }
  },
};

export function toTaskUiItem(task: TaskRecord, goalTitle: string | null = null): TaskUiItem {
  return {
    task_id: task.task_id,
    title: task.title,
    goal_id: task.goal_id,
    goal_title: goalTitle,
    updated_at: task.updated_at,
  };
}

export function renderTaskDirectory(model: TaskUiModel): string {
  const { primitives: p } = model;
  const rows = model.tasks.map((task, index) => {
    const selected = index === 0;
    const caption = task.goal_title || p.text("未关联 Goal");
    return `<button class="feed-list-item directory-list-row${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" data-task-row data-task-id="${p.escape(task.task_id)}" data-task-goal="${p.escape(task.goal_id || "")}" data-task-title="${p.escape(task.title)}"><span class="feed-list-icon">${p.icon("list")}</span><span class="feed-list-copy"><span class="feed-list-meta"><em>Task</em><small>${p.escape(caption)}</small></span><strong title="${p.escape(task.title)}">${p.escape(task.title)}</strong></span></button>`;
  }).join("");
  return `<section class="desktop-directory-panel" data-directory-panel="task" data-task-directory>
    <header class="desktop-directory-heading"><button type="button" data-directory-back aria-label="${p.text("返回上一级")}">${p.icon("back")}</button><span><strong>Task</strong><small>${p.text("真正开始做的工作台")}</small></span></header>
    <div class="inbox-filter-row" data-directory-list-actions><button type="button" data-task-create>${p.icon("plus")}${p.text("新建 Task")}</button></div>
    <div class="feed-item-scroll" data-task-list role="listbox" aria-label="${p.text("Task 列表")}">${rows}<div class="feed-list-empty" data-task-empty${model.tasks.length ? " hidden" : ""}>${p.icon("list")}<strong>${p.text("还没有 Task")}</strong><p>${p.text("可以先建一条工作台，稍后再挂到 Goal。")}</p></div></div>
  </section>`;
}

export function renderTaskWorkbench(model: TaskUiModel): string {
  const { primitives: p } = model;
  return `<section class="desktop-work-surface" data-work-surface="task" data-work-surface-label="Task" hidden data-task-workbench>
    <div class="feed-detail-empty" data-task-detail-empty>${p.icon("list")}<h1>${p.text("选择或新建一条 Task")}</h1><p>${p.text("Task 是真正干活的工作台，不必先有 Goal。")}</p><button type="button" class="button" data-task-create>${p.icon("plus")}${p.text("新建 Task")}</button></div>
  </section>`;
}

export function renderTaskFrame(model: TaskUiModel): string {
  const { primitives: p } = model;
  return `<section class="goal-frame-surface" data-task-frame-surface data-goal-frame-surface aria-label="Task" hidden>
    <header class="frame-goal-summary"><div class="frame-goal-heading"><h1 data-frame-goal-title></h1><span data-frame-goal-status></span></div><p data-frame-goal-outcome></p><div class="frame-goal-actions"><button type="button" data-frame-add-content>${p.icon("plus")}${p.text("添加已有内容")}</button><button type="button" data-frame-goal-work>${p.icon("terminal")}${p.text("打开工作区")}</button><button type="button" data-frame-goal-locate>${p.icon("target")}${p.text("在关系画布中定位")}</button></div></header>
    <div class="goal-frame-canvas" data-frame-canvas><div class="frame-empty" data-frame-empty><strong>${p.text("把这条工作需要的内容放在这里")}</strong><p>${p.text("从目录拖入消息、会话或资料，在同一个画布上组织工作。")}</p><button type="button" class="button" data-frame-add-content>${p.icon("plus")}${p.text("添加已有内容")}</button></div>
      <div class="goal-frame-world" data-frame-world></div>
    </div>
    <dialog class="frame-picker" data-frame-picker aria-labelledby="frame-picker-title">
      <header><h2 id="frame-picker-title">${p.text("添加已有内容")}</h2><button type="button" class="icon-button" data-frame-picker-close aria-label="${p.text("关闭")}">${p.icon("x")}</button></header>
      <div class="frame-picker-tools"><input type="search" data-frame-picker-search placeholder="${p.text("搜索标题或来源")}" aria-label="${p.text("搜索标题或来源")}" autofocus><select data-frame-picker-kind aria-label="${p.text("内容来源")}"><option value="all">${p.text("全部来源")}</option><option value="feed">Feed</option><option value="inbox">Inbox</option><option value="session">${p.text("会话")}</option><option value="artifact">${p.text("交付物")}</option></select></div>
      <div class="frame-picker-list" data-frame-picker-list></div>
      <footer><span>${p.text("添加引用，原内容保持在所属来源。")}</span><button type="button" class="button" data-frame-picker-close>${p.text("取消")}</button></footer>
    </dialog>
    <footer class="goal-canvas-tools goal-frame-tools"><div role="group" aria-label="${p.text("画布缩放")}"><button type="button" data-frame-zoom="out" aria-label="${p.text("缩小")}">−</button><output data-frame-zoom-value>100%</output><button type="button" data-frame-zoom="in" aria-label="${p.text("放大")}">+</button></div></footer>
  </section>`;
}

export type { TaskFrame };
