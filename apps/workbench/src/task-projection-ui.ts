import type { TaskRecord } from "@molis-ai/molis-work-contracts/modules/task";
import {
  toTaskUiItem,
  type TaskUiModel,
  type TaskUiPrimitives,
  type TaskUiSurface,
} from "@molis-ai/molis-work-plugin-task";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderTaskContribution } from "./ui-composition.js";
import type { MolisWorkWebView } from "./page-view.js";

export function createWorkbenchTaskProjectionRenderer(primitives: {
  L(text: string, values?: Record<string, string | number>): string;
}) {
  const { L } = primitives;

  function buildTaskNativePluginModel(view: MolisWorkWebView): TaskUiModel {
    const goals = [...view.goals, ...view.archived_goals, ...view.trashed_goals];
    return {
      tasks: (view.tasks ?? []).map((task: TaskRecord) => toTaskUiItem(
        task,
        task.goal_id
          ? goals.find((item) => item.goal.goal_id === task.goal_id)?.goal.title ?? null
          : null,
      )),
      primitives: taskUiPrimitives,
    };
  }

  function renderTaskNativePluginSurface(view: MolisWorkWebView, surface: TaskUiSurface): string {
    return renderTaskContribution(surface, buildTaskNativePluginModel(view));
  }

  const taskUiPrimitives: TaskUiPrimitives = {
    escape: escapeHtml,
    icon,
    text: L,
  };

  return { buildTaskNativePluginModel, renderTaskNativePluginSurface };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
