import xtermCss from "@xterm/xterm/css/xterm.css";
import { createTerminalAutofill } from "./autofill.js";
import { createPageToast, errorText, paintTerminalStatus, queryTerminalPane, type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import { listenGoalEvents } from "./client-goal-events.js";
import { createTerminalGuard } from "./client-guard.js";
import { createTerminalMenu } from "./client-menu.js";
import { createAdvancePrompt } from "./client-prompt.js";
import { createTerminalView } from "./client-view.js";
import { createTerminalPanels } from "./panels.js";
import { createTerminalScreens } from "./screens.js";
import type { TerminalRequest, TerminalScreens } from "./types.js";

/** The page's request helper (`packages/ui-host`), installed by the Workbench program before this bundle runs. */
declare const molisWorkRequest: TerminalRequest;

/** The work terminal: the shell's own pane (`[data-tui-pane]`, a tab per panel of the open Goal); a page without the pane only gets xterm's styles. */
export function startWorkTerminalClient() {
  const style = document.createElement("style");
  style.textContent = String(xtermCss);
  document.head.appendChild(style);
  const pane = document.querySelector<HTMLElement>("[data-tui-pane]");
  if (pane) mountGoalTerminal(pane);
}

function mountGoalTerminal(pane: HTMLElement) {
  const els = queryTerminalPane(pane);
  const L: TerminalTranslate = (window as Window & { L?: TerminalTranslate }).L ?? ((zh: string) => zh);
  const routePrefix = document.body.dataset.routePrefix || "";
  const route = (pathname: string) => routePrefix + pathname;
  const request: TerminalRequest = (url, init) => molisWorkRequest(url, init);
  const goalId = () => pane.dataset.goalId || "";
  const setStatus: TerminalStatus = (text, tone = "idle", state) => paintTerminalStatus(els.statusEl, text, tone, state);
  const showPageToast = createPageToast(setStatus);
  const guard = createTerminalGuard({ els, text: L, route, goalId, setStatus, closeMenu: () => menu.setMenuOpen(false) });
  const { canControlPanel } = guard;

  const screens = createTerminalScreens({
    host: els.terminalHost,
    onInput: (panelId, data) => {
      const panel = panelController.panels.find((item) => item.panel_id === panelId);
      if (!canControlPanel(panel)) return;
      void panelController.send({ type: "write", panelId, data }).catch((error) => setStatus(errorText(error), "error"));
    },
  });
  const panelController = createTerminalPanels({
    screens, goalId,
    parentReadOnly: guard.readOnly,
    parentReadOnlyMessage: guard.parentReadOnlyMessage,
    canControlPanel,
    text: L, errorText, route, request, terminalsRoute: () => pane.dataset.tuiTerminalsRoute || "",
    controlToken: () => document.querySelector('meta[name="molis-work-control-token"]')?.getAttribute("content") || "",
    setStatus, setMenuOpen: (open) => menu.setMenuOpen(open),
    renderTabs: () => view.renderTabs(),
    showTerminal: (panelId) => view.showTerminal(panelId),
    afterOpened: () => fillPendingFeedContext(),
  });
  const menu = createTerminalMenu({ els, text: L, route, request, guard, setStatus, openPanel: panelController.openPanel });
  const view = createTerminalView({ els, text: L, screens, guard, goalId, setStatus, panels: () => panelController });
  const prompt = createAdvancePrompt({
    text: L, route, request, goalId, promptRoute: () => pane.dataset.tuiPromptRoute || "", guard, current: panelController.current,
    sendPty: panelController.send, copyBtn: els.copyBtn, showToast: showPageToast,
  });
  const { fillPendingFeedContext } = createTerminalAutofill({
    goalId, text: L, errorText,
    terminal: {
      current: panelController.current,
      isAlive: (panelId) => panelController.isAlive(panelId),
      output: (panelId) => screens.get(panelId),
      writePrompt: prompt.writePrompt,
    },
    setStatus, setMenuOpen: menu.setMenuOpen, showToast: showPageToast,
  });

  menu.listen();
  listenPaneButtons(els, setStatus, panelController, prompt);
  listenGoalEvents({ els, goalId, guard, panelController, resetPrompt: prompt.resetCache });
  followTerminalHost(els.terminalHost, screens, panelController);

  void (async () => {
    void menu.refreshRuntimeAvailability().catch(() => undefined);
    try {
      await panelController.connect();
    } catch (error) {
      setStatus(errorText(error), "error");
    }
    await panelController.loadPanels();
  })();
}

function listenPaneButtons(
  els: TerminalPaneElements,
  setStatus: TerminalStatus,
  panelController: ReturnType<typeof createTerminalPanels>,
  prompt: ReturnType<typeof createAdvancePrompt>,
) {
  const report = (error: unknown) => setStatus(errorText(error), "error");
  els.tabsEl.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const closeId = target.closest("[data-tui-close]")?.getAttribute("data-tui-close");
    if (closeId) {
      event.preventDefault();
      void panelController.closePanel(closeId);
      return;
    }
    const selectId = target.closest("[data-tui-select]")?.getAttribute("data-tui-select");
    if (selectId) panelController.select(selectId);
  });
  els.advanceBtn.addEventListener("click", () => { void prompt.writePrompt(true).catch(report); });
  els.copyBtn?.addEventListener("click", () => { void prompt.copyAdvancePrompt().catch(report); });
  els.fillBtn.addEventListener("click", () => { void prompt.writePrompt(false).catch(report); });
  els.reopenBtn.addEventListener("click", () => { void panelController.reopenPanel().catch(report); });
}

/** Keep the active screen sized to the pane and focused on a click; close the channel with the page. */
function followTerminalHost(host: HTMLElement, screens: TerminalScreens, panelController: ReturnType<typeof createTerminalPanels>) {
  new ResizeObserver(() => {
    const panelId = panelController.activeId;
    const session = panelId ? screens.get(panelId) : undefined;
    if (!panelId || !session) return;
    session.fit.fit();
    const size = session.fit.proposeDimensions();
    if (size) void panelController.send({ type: "resize", panelId, cols: size.cols, rows: size.rows }).catch(() => undefined);
  }).observe(host);

  host.addEventListener("pointerdown", () => {
    const panelId = panelController.activeId;
    if (panelId) screens.get(panelId)?.term.focus();
  });

  window.addEventListener("beforeunload", () => {
    panelController.stop();
  });
}
