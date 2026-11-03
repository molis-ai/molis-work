import { escapeHtml, type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
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
  const { els, text: L, screens, guard, setStatus } = options;
  const { tabsEl, emptyEl, ownerTitleEl, advanceBtn, copyBtn, fillBtn, reopenBtn } = els;

  const renderTabs = () => {
    const controller = options.panels();
    tabsEl.innerHTML = controller.panels.map((panel) => {
      const active = panel.panel_id === controller.activeId ? " is-active" : "";
      const exited = panel.status === "exited" ? " is-exited" : "";
      const close = guard.readOnly()
        ? `<small class="tui-tab-readonly">${escapeHtml(L("只读"))}</small>`
        : `<span class="tui-tab-close" data-tui-close="${escapeHtml(panel.panel_id)}" aria-label="${escapeHtml(L("关闭终端"))}"><svg aria-hidden="true"><use href="#icon-x"></use></svg></span>`;
      return `<button class="tui-tab${active}${exited}" type="button" data-tui-select="${escapeHtml(panel.panel_id)}" title="${escapeHtml(`${ownerTitleEl?.textContent || L("当前 Goal")} · ${panel.title}`)}"><span class="tui-tab-title">${escapeHtml(panel.title)}</span>${close}</button>`;
    }).join("");
  };

  const paintStatus = (live: boolean, hasPanel: boolean, belongsHere: boolean) => {
    if (!hasPanel) setStatus("");
    else if (guard.readOnly()) setStatus(L("历史终端只读；请到具体的子 Goal 继续。"));
    else if (!belongsHere) setStatus(L("这个终端属于另一条 Goal，当前不可操作。"), "error");
    else if (live) setStatus(L("终端已连接"), "live", "connected");
    else setStatus(L("终端进程已不在，可重新打开"), "idle", "disconnected");
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
