import { GOAL_DISPLAY_STATUSES, createGoalActionPresenter } from "./action-presentation.js";
import type { GoalsMomentumBoardView, GoalsMomentumItem, GoalsMomentumUiPrimitives } from "./momentum-ui-model.js";
import { sortGoalTreeItems } from "./tree-order.js";

export function createKanbanRenderer(primitives: GoalsMomentumUiPrimitives) {
  const { translate: L, escapeHtml, renderVisibleGoalStatus } = primitives;
  const { goalDisplayStatusLabel } = createGoalActionPresenter(L);

  function renderGoalKanban(view: GoalsMomentumBoardView, selectedGoalId: string, items: readonly GoalsMomentumItem[]): string {
    const byId = new Map(items.map((item) => [item.goal.goal_id, item]));
    const columns = GOAL_DISPLAY_STATUSES.map((status) => {
      const cards = sortGoalTreeItems(items.filter((item) => item.display_status === status)).map((entry) => {
        const parent = view.snapshot.relations.find((relation) => relation.state === "active" && relation.type === "part_of" && relation.from_goal_id === entry.goal.goal_id);
        const parentTitle = parent ? byId.get(parent.to_goal_id)?.goal.title : "";
        const selected = entry.goal.goal_id === selectedGoalId;
        const complete = entry.display_status === "completed";
        return `<article tabindex="0" role="button" data-kanban-card data-goal-id="${escapeHtml(entry.goal.goal_id)}" class="goal-kanban-card${complete ? " is-complete" : ""}${selected ? " is-selected" : ""}" draggable="false" aria-label="${escapeHtml(L("展开 Goal：{title}", { title: entry.goal.title }))}">
        ${renderVisibleGoalStatus(entry)}<strong>${escapeHtml(entry.goal.title)}</strong>
        <span class="goal-kanban-card-outcome">${escapeHtml(entry.goal.outcome || L("还没有写清预期结果"))}</span>
        ${parentTitle ? `<small>${escapeHtml(L("属于：{title}", { title: parentTitle }))}</small>` : ""}
      </article>`;
      }).join("");
      return `<section class="goal-kanban-column" data-kanban-column="${status}" aria-label="${escapeHtml(goalDisplayStatusLabel(status))}">
      <h2>${escapeHtml(goalDisplayStatusLabel(status))}</h2>
      <div data-kanban-cards>${cards}</div>
    </section>`;
    }).join("");
    return `<section class="goal-kanban" data-goal-kanban aria-label="${L("看板")}">
      <div class="goal-kanban-board">${columns}</div>
    </section>`;
  }

  return { renderGoalKanban };
}
