import { errorMessage } from "../dom.js";
import type { ClickRule } from "./click-types.js";
import { loadGoals, openGoals, renderGoalPreview } from "./goals.js";
import { api } from "./request.js";
import type { GoalChoice } from "./shapes.js";

/** Marks the goal row that is chosen (none: no row). */
function markChosen(root: ParentNode, goalId: string | null) {
  root.querySelectorAll<HTMLElement>("[data-coding-goal-id]").forEach(node => {
    const on = node.dataset.codingGoalId === goalId;
    node.classList.toggle("is-selected", on);
    node.setAttribute("aria-pressed", String(on));
  });
}

export const GOAL_CLICKS: readonly ClickRule[] = [
  ["[data-coding-goal-open],[data-coding-goal-face-open]", page => openGoals(page)],
  ["[data-coding-goal-close]", page => {
    const { q, s } = page;
    if (s.goalSaving) return;
    s.goalTicket++;
    s.goalReading++;
    q<HTMLDialogElement>("[data-coding-goal-dialog]").close();
  }],
  ["[data-coding-goal-none]", page => {
    const { q, s } = page;
    if (s.goalSaving) return;
    s.goalReading++;
    s.goalChoice = null;
    renderGoalPreview(page);
    markChosen(q("[data-coding-goal-list]"), null);
    q<HTMLButtonElement>("[data-coding-goal-save]").disabled = false;
    q("[data-coding-goal-error]").textContent = "";
  }],
  ["[data-coding-goal-more]", async (page, target) => {
    target.disabled = true;
    try {
      await loadGoals(page, page.s.goalTicket);
    } finally {
      target.disabled = false;
    }
  }],
  ["[data-coding-goal-id]", async (page, target) => {
    const { lifetime, q, s } = page;
    if (s.goalSaving) return;
    const ticket = s.goalTicket, reading = ++s.goalReading, id = target.dataset.codingGoalId || "";
    q<HTMLButtonElement>("[data-coding-goal-save]").disabled = true;
    q("[data-coding-goal-error]").textContent = "";
    try {
      const value = await api<GoalChoice>(page, "/goals/" + encodeURIComponent(id));
      if (ticket !== s.goalTicket || reading !== s.goalReading) return;
      s.goalChoice = value;
      renderGoalPreview(page);
      markChosen(q("[data-coding-goal-list]"), id);
      q<HTMLButtonElement>("[data-coding-goal-save]").disabled = false;
    } catch (error) {
      if (!lifetime.alive) return;
      if (ticket === s.goalTicket && reading === s.goalReading) q("[data-coding-goal-error]").textContent = errorMessage(error);
    }
  }],
];
