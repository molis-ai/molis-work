import type { TerminalPaneElements } from "./client-dom.js";
import type { ChildGoalSummary, TerminalGuard } from "./client-guard.js";
import type { createTerminalPanels } from "./panels.js";

type GoalChangedDetail = {
  goalId?: string;
  goalTitle?: string;
  status?: string;
  statusLabel?: string;
  statusMeaning?: string;
  statusIconMarkup?: string;
  parentReadOnly?: boolean;
  children?: ChildGoalSummary[];
};

function paintOwnerStatus(ownerStatusEl: HTMLElement, detail: GoalChangedDetail | undefined) {
  const status = detail?.status ?? "";
  const label = ownerStatusEl.querySelector("[data-tui-owner-status-label]");
  if (label) label.textContent = detail?.statusLabel ?? "";
  ownerStatusEl.hidden = !detail?.statusLabel;
  ownerStatusEl.title = detail?.statusMeaning ?? "";
  Array.from(ownerStatusEl.classList)
    .filter((className) => className.startsWith("goal-status--"))
    .forEach((className) => ownerStatusEl.classList.remove(className));
  if (/^[a-z_]+$/.test(status)) ownerStatusEl.classList.add(`goal-status--${status}`);
  if (detail?.statusIconMarkup) {
    const template = document.createElement("template");
    template.innerHTML = detail.statusIconMarkup.trim();
    const nextIcon = template.content.firstElementChild;
    const currentIcon = ownerStatusEl.querySelector(":scope > svg");
    if (nextIcon?.tagName.toLowerCase() === "svg") {
      if (currentIcon) currentIcon.replaceWith(nextIcon);
      else ownerStatusEl.prepend(nextIcon);
    }
  }
}

export interface GoalEventsOptions {
  els: TerminalPaneElements;
  goalId(): string;
  guard: TerminalGuard;
  panelController: ReturnType<typeof createTerminalPanels>;
  resetPrompt(): void;
}

/** Follow the Goals page: a Goal switch empties the pane; the new Goal's document being loaded brings its panels. */
export function listenGoalEvents(options: GoalEventsOptions) {
  const { els: { ownerTitleEl, ownerStatusEl }, goalId, guard, panelController } = options;
  const { loadPanels } = panelController;
  document.addEventListener("molis-work:goal-changed", (event) => {
    const detail = (event as CustomEvent<GoalChangedDetail>).detail;
    if (ownerTitleEl && detail?.goalTitle) ownerTitleEl.textContent = detail.goalTitle;
    if (ownerStatusEl) paintOwnerStatus(ownerStatusEl, detail);
    options.resetPrompt();
    guard.setParentGuard(Boolean(detail?.parentReadOnly), detail?.children ?? []);
    panelController.resetGoal();
  });

  document.addEventListener("molis-work:goal-document-loaded", (event) => {
    const detail = (event as CustomEvent<{ goalId?: string }>).detail;
    if (!detail?.goalId || detail.goalId !== goalId()) return;
    void loadPanels();
  });
}
