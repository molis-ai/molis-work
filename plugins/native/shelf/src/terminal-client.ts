/// <reference lib="dom" />
import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiPageTerminal, UiTerminalEvent, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";

interface ShelfTuiBridge { open(): void; send(text: string): boolean; isLive(): boolean }
declare global {
  var molisWorkShelfTui: ShelfTuiBridge | undefined;
  var molisPageTerminal: UiPageTerminal;
}

/** The page asks its own backend to open a terminal, then attaches only to the returned panel. */
export function startShelfTerminalClient(): void {
  const host = document.querySelector<HTMLElement>("[data-shelf-tty-screen]");
  if (!host) {
    const observer = new MutationObserver(() => {
      if (!document.querySelector("[data-shelf-tty-screen]")) return;
      observer.disconnect(); startShelfTerminalClient();
    });
    observer.observe(document.body, { childList: true, subtree: true }); return;
  }
  if (host.dataset.shelfTuiBound === "1") return;
  host.dataset.shelfTuiBound = "1";
  const terminal = globalThis.molisPageTerminal;
  let panelId: string | undefined, view: UiTerminalView | undefined, opening = false, live = false;
  const queued: string[] = [];
  const recover = (message: string) => {
    const texts = queued.splice(0);
    if (texts.length) window.dispatchEvent(new CustomEvent("molis-shelf-tui-unsent", { detail: { texts, message } }));
    window.dispatchEvent(new CustomEvent("molis-shelf-notice", { detail: { message } }));
  };
  const write = (text: string) => {
    if (!panelId) return;
    void terminal.send({ type: "write", panelId, data: text + "\r" }).catch(error => {
      queued.push(text); recover(error.message);
    });
  };
  const onEvent = (event: UiTerminalEvent) => {
    if (event.type === "spawned") {
      live = event.started || event.attached;
      if (live) for (const line of queued.splice(0)) write(line);
      else { recover("终端会话已结束，未发送的输入已恢复。"); view?.dispose(); view = undefined; panelId = undefined; }
    } else if (event.type === "exit") {
      live = false; recover("终端会话已结束，未发送的输入已恢复。"); view?.dispose(); view = undefined; panelId = undefined;
    } else if (event.type === "disconnected") {
      live = false; recover("终端连接已断开，未发送的输入已恢复。");
    } else if (event.type === "error") recover(event.message);
  };
  const open = async () => {
    if (opening || view) { view?.fit(); return; }
    opening = true;
    try {
      const prefix = document.body.dataset.routePrefix || "";
      const result = await molisWorkRequest<{ panelId: string }>(prefix + "/api/plugins/io.molis.work.shelf/terminal", { body: {} });
      panelId = result.panelId;
      view = await terminal.mount(host, { panelId, onEvent }); view.focus();
    } catch (error) { panelId = undefined; recover(error instanceof Error ? error.message : String(error)); }
    finally { opening = false; }
  };
  globalThis.molisWorkShelfTui = {
    open: () => { void open(); },
    send(text) { if (!opening && !panelId) return false; if (live) write(text); else queued.push(text); return true; },
    isLive: () => live,
  };
}
