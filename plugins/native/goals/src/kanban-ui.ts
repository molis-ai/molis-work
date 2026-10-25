import { GOAL_DISPLAY_STATUSES, createGoalActionPresenter } from "./action-presentation.js";
import type { GoalsMomentumBoardView, GoalsMomentumItem, GoalsMomentumUiPrimitives } from "./momentum-ui-model.js";
import { renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";
import { DISPLAY_STATUS_MARKS } from "./status-rings.js";
import { sortGoalTreeItems } from "./tree-order.js";

const KANBAN_CARET = `<svg class="goal-kanban-caret" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6.8 4.9 10.6 8 6.8 11.1z"/></svg>`;
export function createKanbanRenderer(primitives: GoalsMomentumUiPrimitives) {
  const { translate: L, escapeHtml, renderVisibleGoalStatus } = primitives;
  const { goalDisplayStatusLabel } = createGoalActionPresenter(L);

  function renderGoalKanban(view: GoalsMomentumBoardView, selectedGoalId: string, items: readonly GoalsMomentumItem[]): string {
    const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
    const columns = GOAL_DISPLAY_STATUSES.map((status) => {
      const columnItems = sortGoalTreeItems(items.filter((item) => item.display_status === status));
      const mark = renderStateRing({ state: DISPLAY_STATUS_MARKS[status] });
      const cards = columnItems.map((entry) => {
        const parent = view.snapshot.relations.find((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === entry.goal.goal_id);
        const parentTitle = parent ? byId.get(parent.to_goal_id)?.goal.title : "";
        const selected = entry.goal.goal_id === selectedGoalId;
        const complete = entry.display_status === "completed";
        return `<article tabindex="0" role="button" data-kanban-card data-goal-id="${escapeHtml(entry.goal.goal_id)}" class="goal-kanban-card${complete ? " is-complete" : ""}${selected ? " is-selected" : ""}" draggable="false" aria-label="${escapeHtml(L("展开 Goal：{title}", { title: entry.goal.title }))}">
        <span class="goal-kanban-status" aria-hidden="true">${mark}</span>
        <strong>${escapeHtml(entry.goal.title)}</strong>
        <span class="goal-kanban-card-outcome">${escapeHtml(entry.goal.outcome || L("还没有写清预期结果"))}</span>
        <div class="goal-kanban-card-meta">${renderVisibleGoalStatus(entry)}${parentTitle ? `<small>${escapeHtml(L("属于：{title}", { title: parentTitle }))}</small>` : ""}</div>
      </article>`;
      }).join("");
      return `<section class="goal-kanban-column" data-kanban-column="${status}" aria-label="${escapeHtml(goalDisplayStatusLabel(status))}">
      <details${columnItems.length ? " open" : ""} data-kanban-group>
        <summary><span class="goal-kanban-chevron" aria-hidden="true">${KANBAN_CARET}</span><span class="goal-kanban-status" aria-hidden="true">${mark}</span><span class="goal-kanban-group-name">${escapeHtml(goalDisplayStatusLabel(status))}</span><span class="goal-kanban-count">${columnItems.length}</span></summary>
        <div data-kanban-cards>${cards || `<p class="goal-kanban-empty">${escapeHtml(L("暂无 Goal"))}</p>`}</div>
      </details>
    </section>`;
    }).join("");
    return `<section class="goal-kanban" data-goal-kanban aria-label="${L("看板")}">
      <div class="goal-kanban-board">${columns}</div>
    </section>`;
  }

  return { renderGoalKanban };
}
