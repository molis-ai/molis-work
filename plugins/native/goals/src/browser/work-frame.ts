import { elementOf } from "./dom.js";
import type { GoalsPageData, SetWorkspaceMode } from "./types.js";

export interface WorkFrameHost {
  readonly documentPane: HTMLElement;
  readonly getSelected: () => string;
  readonly getState: () => GoalsPageData;
  readonly projectId: string;
  readonly setWorkspaceMode: SetWorkspaceMode;
  readonly setMobileView: (view: string) => void;
  /** Lays the shell's panes out again; `presenceOnly` re-reads only which panes are shown. */
  readonly syncShell: (presenceOnly: boolean) => void;
}

interface GoalView { view?: string; details?: boolean }

/**
 * The open Goal's work frame (`[data-goal-node-workspace]`): its document or work view, the details rail, and the view
 * each Goal was last shown in. The shell's immersive navigation only asks `presence()` when it lays the panes out.
 */
export function workFrameClient(host: WorkFrameHost) {
  const { documentPane, getSelected, getState, projectId, setWorkspaceMode, setMobileView, syncShell } = host;
  const frame = document.querySelector<HTMLElement>("[data-goal-node-workspace]");
  const workMain = document.querySelector("[data-goal-work-main]");
  const modesKey = "molis-work-goal-work-modes:" + projectId;
  let modes: Record<string, GoalView> = {};
  try { modes = JSON.parse(localStorage.getItem(modesKey) || "{}"); } catch { /* unreadable: every Goal opens in its default view */ }
  const narrow = () => matchMedia("(max-width: 600px)").matches;
  const persistModes = () => { try { localStorage.setItem(modesKey, JSON.stringify(modes)); } catch { /* the view is remembered for this page only */ } };
  const presence = () => {
    const editing = Boolean(documentPane && !documentPane.hidden && documentPane.querySelector(".is-editing-goal"));
    const overlayDetails = Boolean(frame && frame.dataset.detailsOpen === "true" && frame.clientWidth < 840);
    workMain?.toggleAttribute("inert", editing || overlayDetails);
  };
  const setDetails = (open: boolean, persist = false) => {
    if (!frame) return;
    // The document view is the Goal's details; it stays open while that view is shown.
    if (frame.dataset.viewMode === "document") open = true;
    frame.dataset.detailsOpen = String(open);
    documentPane.hidden = !open;
    const button = frame.querySelector("[data-goal-details-toggle]");
    button?.setAttribute("aria-expanded", String(open));
    button?.setAttribute("aria-label", open ? globalThis.t.text("goals.chrome.collapse-goal-info-timeline") : globalThis.t.text("goals.work-frame-client.expand-goal-info-timeline"));
    const goalId = getSelected();
    if (persist && goalId) {
      modes[goalId] = { ...modes[goalId], details: open };
      persistModes();
    }
    syncShell(true);
  };
  let viewChosenAt = 0;
  // 打开工作区 on a Goal's frame asks for its work area: the Goal opens in its terminal, and that is remembered as its view.
  let workRequestedAt = 0;
  const hasTerminalSession = () => {
    const empty = frame?.querySelector<HTMLElement>("[data-tui-empty]");
    return Boolean(empty && empty.hidden);
  };
  const setView = (view: string, persist = false) => {
    if (!frame) return;
    frame.dataset.viewMode = view;
    frame.querySelectorAll<HTMLElement>("[data-goal-view-tab]").forEach(button => {
      const active = button.dataset.goalViewTab === view;
      button.classList.toggle("is-current", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const info = documentPane.querySelector<HTMLDetailsElement>("[data-goal-info]");
    if (view === "document") {
      if (info) info.open = true;
      setDetails(true);
    }
    else setDetails((modes[getSelected()] || {}).details ?? frame.clientWidth >= 840);
    const goalId = getSelected();
    if (persist && goalId) {
      modes[goalId] = { ...modes[goalId], view };
      persistModes();
    }
  };
  const syncGoalMode = () => {
    if (!frame) return;
    const goalId = getSelected();
    const item = getState().goals.find(entry => entry.goal.goal_id === goalId);
    const title = frame.querySelector("[data-workspace-goal-title]");
    if (title) title.textContent = item?.goal.title || "";
    const status = frame.querySelector("[data-workspace-goal-status]");
    const source = documentPane.querySelector(".goal-info-popover > summary .goal-status");
    if (status) {
      status.className = source?.className || "goal-status";
      status.setAttribute("data-workspace-goal-status", "");
      status.innerHTML = source?.innerHTML || "";
    }
    const saved = modes[goalId] || {};
    const workMode = "terminal";
    frame.dataset.workMode = workMode;
    frame.querySelectorAll<HTMLElement>("[data-goal-work-mode]").forEach(button => {
      const active = button.dataset.goalWorkMode === workMode;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    const terminal = frame.querySelector<HTMLElement>("[data-tui-pane]");
    if (terminal) {
      terminal.hidden = false;
      terminal.setAttribute("role", "tabpanel");
      terminal.setAttribute("aria-labelledby", "goal-terminal-tab");
    }
    // A Goal opens as its document unless it already has a terminal session or the person last chose the terminal.
    viewChosenAt = Date.now();
    if (Date.now() - workRequestedAt < 3000) {
      workRequestedAt = 0;
      setView("work", true);
    }
    else setView(saved.view || (hasTerminalSession() ? "work" : "document"));
  };
  document.addEventListener("click", (event) => {
    if (!elementOf(event)?.closest("[data-frame-goal-work]")) return;
    workRequestedAt = Date.now();
    if (getSelected()) setView("work", true);
  }, true);
  // Sessions arrive shortly after the Goal opens: a Goal that turns out to have one moves to its terminal,
  // unless the person has chosen a view for it.
  // Opening a form or reader in the document view starts it at the top of the Goal.
  const aside = frame?.querySelector("[data-goal-details-aside]");
  if (aside) new MutationObserver(() => {
    const editing = aside.querySelector(".goal-event-document.is-editing-goal");
    if (!editing) return;
    // The form covers the document from its top in either view, so neither the rail nor the document stays scrolled.
    aside.scrollTop = 0;
    editing.scrollTop = 0;
  }).observe(aside, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const emptyState = frame?.querySelector("[data-tui-empty]");
  if (frame && emptyState) new MutationObserver(() => {
    const goalId = getSelected();
    if (!goalId || (modes[goalId] || {}).view || frame.dataset.viewMode !== "document") return;
    if (hasTerminalSession() && Date.now() - viewChosenAt < 2500) setView("work");
  }).observe(emptyState, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("click", event => {
    const target = elementOf(event);
    if (!target) return;
    const button = target.closest<HTMLButtonElement>("[data-goal-work-mode]");
    if (button) {
      if (button.disabled) return;
      setWorkspaceMode("runtime");
      return;
    }
    const viewTab = target.closest<HTMLElement>("[data-goal-view-tab]");
    if (viewTab && frame?.contains(viewTab)) {
      setView(viewTab.dataset.goalViewTab || "", true);
      return;
    }
    const detailsToggle = target.closest<HTMLElement>("[data-goal-details-toggle]");
    if (detailsToggle) {
      // A Goal's copy in another split pane keeps its own details rail; only the page's own frame is remembered (102-1).
      const targetFrame = detailsToggle.closest<HTMLElement>("[data-goal-node-workspace]");
      if (targetFrame && targetFrame !== frame) {
        const nextOpen = targetFrame.dataset.detailsOpen !== "true";
        targetFrame.dataset.detailsOpen = String(nextOpen);
        const cloneDocument = targetFrame.querySelector<HTMLElement>("[data-document-pane]");
        if (cloneDocument) cloneDocument.hidden = !nextOpen;
        detailsToggle.setAttribute("aria-expanded", String(nextOpen));
      } else if (frame) setDetails(frame.dataset.detailsOpen !== "true", true);
    }
    if (target.closest("[data-select-goal]")) {
      if (narrow()) setMobileView("document");
      syncShell(false);
    }
  });
  document.addEventListener("keydown", event => {
    const tab = elementOf(event)?.closest?.("[data-goal-work-mode]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = frame?.querySelector<HTMLElement>('[data-goal-work-mode="terminal"]');
      next?.click();
      next?.focus();
    }
  });
  if (frame) new ResizeObserver(() => {
    const saved = modes[getSelected()] || {};
    if (saved.details == null) setDetails(frame.clientWidth >= 840);
    else syncShell(true);
  }).observe(frame);
  return { presence, syncGoalMode };
}
