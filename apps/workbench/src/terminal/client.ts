import xtermCss from "@xterm/xterm/css/xterm.css";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createPageToast, errorText, paintTerminalStatus, queryTerminalPane, type TerminalPaneElements, type TerminalStatus, type TerminalTranslate } from "./client-dom.js";
import { listenSubjectEvents } from "./client-subject-events.js";
import { createTerminalGuard } from "./client-guard.js";
import { createTerminalMenu } from "./client-menu.js";
import { createAdvancePrompt } from "./client-prompt.js";
import { createTerminalView } from "./client-view.js";
import { createTerminalPanels } from "./panels.js";
import { createTerminalScreens } from "./screens.js";
import type { TerminalRequest, TerminalScreens, WorkTerminalSubjectRef } from "./types.js";

/** The page's request helper (`packages/ui-host`), installed by the Workbench program before this bundle runs. */
declare const molisWorkRequest: TerminalRequest;

/** The platform object work terminal: the shell's own pane (`[data-tui-pane]`, a tab per panel of the open object); a page without the pane only gets xterm's styles. */
export function startWorkTerminalClient() {
  const style = document.createElement("style");
  style.textContent = String(xtermCss);
  document.head.appendChild(style);
  const pane = document.querySelector<HTMLElement>("[data-tui-pane]");
  if (pane) mountWorkTerminal(pane);
}

function mountWorkTerminal(pane: HTMLElement) {
  const els = queryTerminalPane(pane);
  const readText: TerminalTranslate = uiText.text;
  const routePrefix = document.body.dataset.routePrefix || "";
  const route = (pathname: string) => routePrefix + pathname;
  const request: TerminalRequest = (url, init) => molisWorkRequest(url, init);
  const subject = (): WorkTerminalSubjectRef => ({
    plugin_id: pane.dataset.tuiPluginId || "",
    subject_kind: pane.dataset.tuiSubjectKind || "",
    subject_id: pane.dataset.tuiSubjectId || "",
  });
  const setStatus: TerminalStatus = (text, tone = "idle", state) => paintTerminalStatus(els.statusEl, text, tone, state);
  const showPageToast = createPageToast(setStatus);
  const guard = createTerminalGuard({ els, text: readText, route, subject, setStatus, closeMenu: () => menu.setMenuOpen(false) });
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
    screens, subject,
    readOnly: guard.readOnly,
    readOnlyMessage: guard.readOnlyMessage,
    canControlPanel,
    text: readText, errorText, route, request,
    controlToken: () => document.querySelector('meta[name="molis-work-page-session"]')?.getAttribute("content") || "",
    setStatus, setMenuOpen: (open) => menu.setMenuOpen(open),
    renderTabs: () => view.renderTabs(),
    showTerminal: (panelId) => view.showTerminal(panelId),
  });
  const menu = createTerminalMenu({ els, text: readText, route, request, guard, setStatus, openPanel: panelController.openPanel });
  const view = createTerminalView({ els, text: readText, screens, guard, subject, setStatus, panels: () => panelController });
  const prompt = createAdvancePrompt({
    text: readText, route, request, subject, guard, current: panelController.current,
    sendPty: panelController.send, copyBtn: els.copyBtn, showToast: showPageToast,
  });
  menu.listen();
  listenPaneButtons(els, setStatus, panelController, prompt);
  listenSubjectEvents({ els, subject, guard, panelController, resetPrompt: prompt.resetCache });
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
      void panelController.closePanel(closeId).catch(report);
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
  const fit = () => {
    const panelId = panelController.activeId;
    const session = panelId ? screens.get(panelId) : undefined;
    if (!panelId || !session) return;
    session.fit.fit();
    const size = session.fit.proposeDimensions();
    if (size) void panelController.send({ type: "resize", panelId, cols: size.cols, rows: size.rows }).catch(() => undefined);
  };
  new ResizeObserver(fit).observe(host);
  window.addEventListener("molis-work:ui-environment-changed", () => { screens.remeasure(); fit(); });

  host.addEventListener("pointerdown", () => {
    const panelId = panelController.activeId;
    if (panelId) screens.get(panelId)?.term.focus();
  });

  window.addEventListener("beforeunload", () => {
    panelController.stop();
  });
}
