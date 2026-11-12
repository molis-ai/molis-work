import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { createTerminalPanels } from "./panels.js";
import type { TerminalScreens } from "./types.js";

export interface TerminalViewOptions {
  els: TerminalPaneElements;
  text: TerminalTranslate;
  screens: TerminalScreens;
  guard: TerminalGuard;
  goalId(): string;
  setStatus: TerminalStatus;
  panels(): ReturnType<typeof createTerminalPanels>;
}

/** Paint the tabs, the visible screen and the buttons from the panel list; owns no state of its own. */
export function createTerminalView(options: TerminalViewOptions) {
  const { els, screens, guard, setStatus } = options;
  const { tabsEl, emptyEl, ownerTitleEl, advanceBtn, copyBtn, fillBtn, reopenBtn } = els;

  const renderTabs = () => {
    const controller = options.panels();
    tabsEl.innerHTML = controller.panels.map((panel) => {
      const active = panel.panel_id === controller.activeId ? " is-active" : "";
      const exited = panel.status === "exited" ? " is-exited" : "";
      const close = guard.readOnly()
        ? `<small class="tui-tab-readonly">${escapeHtml(uiText.text("workbench.client-view.read-only"))}</small>`
        : `<span class="tui-tab-close" data-tui-close="${escapeHtml(panel.panel_id)}" aria-label="${escapeHtml(uiText.text("workbench.client-view.close-terminal"))}"><svg aria-hidden="true"><use href="#icon-x"></use></svg></span>`;
      return `<button class="tui-tab${active}${exited}" type="button" data-tui-select="${escapeHtml(panel.panel_id)}" title="${escapeHtml(`${ownerTitleEl?.textContent || uiText.text("workbench.client-view.current-goal")} · ${panel.title}`)}"><span class="tui-tab-title">${escapeHtml(panel.title)}</span>${close}</button>`;
    }).join("");
  };

  const paintStatus = (live: boolean, hasPanel: boolean, belongsHere: boolean) => {
    if (!hasPanel) setStatus("");
    else if (guard.readOnly()) setStatus(uiText.text("workbench.client-view.historical-terminal-read-only-continue-specific-child-goal"));
    else if (!belongsHere) setStatus(uiText.text("workbench.client-view.terminal-belongs-another-goal-cannot-be-controlled-here"), "error");
    else if (live) setStatus(uiText.text("workbench.client-view.terminal-connected"), "live", "connected");
    else setStatus(uiText.text("workbench.client-view.terminal-process-gone-can-reopen"), "idle", "disconnected");
  };

  const showTerminal = (panelId: string | null) => {
    const controller = options.panels();
    for (const [id, session] of screens.entries()) {
      session.wrapper.hidden = id !== panelId;
    }
    if (emptyEl) emptyEl.hidden = controller.panels.length > 0;
    const panel = controller.current();
    const live = Boolean(panelId && controller.isAlive(panelId));
    const readOnly = guard.readOnly() || Boolean(panel && !guard.panelBelongsHere(panel));
    advanceBtn.disabled = !live || readOnly;
    if (copyBtn) copyBtn.disabled = readOnly || !options.goalId();
    fillBtn.disabled = !live || readOnly;
    reopenBtn.hidden = !(panel && !live && !readOnly);
    paintStatus(live, Boolean(panel), guard.panelBelongsHere(panel));
    const session = panelId ? screens.get(panelId) : undefined;
    if (session) {
      requestAnimationFrame(() => {
        session.fit.fit();
        if (live) session.term.focus();
      });
    }
  };

  return { renderTabs, showTerminal };
}
