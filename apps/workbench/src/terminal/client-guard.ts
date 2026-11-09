import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import type { PanelRecord } from "./types.js";

export type ChildGoalSummary = {
  goal: { goal_id: string; title: string };
  status_label: string;
  status_meaning: string;
  next_action: string;
};

export interface TerminalGuardOptions {
  els: TerminalPaneElements;
  text: TerminalTranslate;
  route(path: string): string;
  goalId(): string;
  setStatus: TerminalStatus;
  closeMenu(): void;
}

/** Whether this page may drive a terminal: a parent Goal is read-only, and a panel answers only to its own Goal. */
export function createTerminalGuard(options: TerminalGuardOptions) {
  const { els, route, goalId, setStatus } = options;
  const { pane, emptyEl, parentGuardEl, childChoicesEl, addBtn, emptyAddBtn } = els;
  let parentReadOnly = pane.dataset.tuiParentReadOnly === "true";

  const parentReadOnlyMessage = () =>
    uiText.text("workbench.client-guard.goal-completed-through-its-child-goals-so-its");

  const panelBelongsHere = (panel: PanelRecord | null | undefined) =>
    Boolean(panel && panel.goal_id === goalId());

  const canControlPanel = (panel: PanelRecord | null | undefined): panel is PanelRecord => {
    if (parentReadOnly) {
      setStatus(parentReadOnlyMessage(), "error");
      return false;
    }
    if (!panelBelongsHere(panel)) {
      setStatus(
        uiText.text("workbench.client-guard.page-has-switched-another-goal-terminal-stays-its"),
        "error",
      );
      return false;
    }
    return true;
  };

  const renderChildChoices = (children: ChildGoalSummary[]) => {
    if (!childChoicesEl) return;
    childChoicesEl.innerHTML = children.length
      ? children.map((child) => `<a class="tui-child-choice" href="${escapeHtml(route(`/goals/${encodeURIComponent(child.goal.goal_id)}`))}">
        <span><strong>${escapeHtml(child.goal.title)}</strong><small>${escapeHtml(child.status_label)} · ${escapeHtml(child.next_action)}</small></span>
        <b>${escapeHtml(uiText.text("workbench.client-guard.open-child-goal"))}<svg aria-hidden="true"><use href="#icon-chevron-right"></use></svg></b>
      </a>`).join("")
      : `<p>${escapeHtml(uiText.text("workbench.client-guard.there-no-child-goal-ready-work-check-how"))}</p>`;
  };

  const updateEmptyCopy = (readOnly: boolean) => {
    if (!emptyEl) return;
    if (emptyAddBtn) emptyAddBtn.hidden = readOnly;
    const paragraphs = emptyEl.querySelectorAll("p");
    const title = paragraphs[0]?.querySelector("strong");
    if (title) title.textContent = readOnly ? uiText.text("workbench.client-guard.parent-goal-does-not-use-terminal-directly") : uiText.text("workbench.client-guard.no-terminal-yet");
    if (paragraphs[1]) {
      paragraphs[1].textContent = readOnly
        ? uiText.text("workbench.client-guard.open-specific-child-goal-above")
        : uiText.text("workbench.client-guard.choose-runtime-custom-command-work-goal");
    }
  };

  const setParentGuard = (readOnly: boolean, children: ChildGoalSummary[] = []) => {
    parentReadOnly = readOnly;
    pane.dataset.tuiParentReadOnly = String(readOnly);
    pane.toggleAttribute("data-tui-read-only", readOnly);
    if (parentGuardEl) parentGuardEl.hidden = !readOnly;
    if (readOnly) renderChildChoices(children);
    updateEmptyCopy(readOnly);
    addBtn.disabled = readOnly;
    addBtn.title = readOnly ? uiText.text("workbench.client-guard.open-specific-child-goal") : "";
    if (readOnly) options.closeMenu();
  };

  return { readOnly: () => parentReadOnly, parentReadOnlyMessage, panelBelongsHere, canControlPanel, setParentGuard };
}

export type TerminalGuard = ReturnType<typeof createTerminalGuard>;
