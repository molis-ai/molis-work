import type { UiPageTerminal, UiTerminalEvent, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";
import { post } from "./request.js";
import type { ShelfPage, ShelfTui } from "./types.js";

declare global {
  // The platform leaves the terminal handle on every plugin frame; Shelf only asks.
  var molisPageTerminal: UiPageTerminal;
}

/**
 * The terminal well of 「对话」: the page asks Shelf's own backend to open a terminal, then attaches only to the panel it returns,
 * through the platform's terminal handle (the renderer is the platform's, loaded when the well first mounts). It leaves the bridge
 * `tui.ts` sends through on the page for as long as the root lives.
 */
export function installTerminal(page: ShelfPage): void {
  const ended = page.L("shelf.tui.terminal-ended"), dropped = page.L("shelf.tui.terminal-dropped");
  const screen = page.bench.querySelector<HTMLElement>("[data-shelf-tty-screen]");
  if (!screen) return;
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
  const end = (message: string) => { live = false; recover(message); view?.dispose(); view = undefined; panelId = undefined; };
  const onEvent = (event: UiTerminalEvent) => {
    if (event.type === "spawned") {
      live = event.started || event.attached;
      if (live) for (const line of queued.splice(0)) write(line);
      else end(ended);
    } else if (event.type === "exit") end(ended);
    else if (event.type === "disconnected") {
      live = false; recover(dropped);
    } else if (event.type === "error") recover(event.message);
  };
  const open = async () => {
    if (opening || view) { view?.fit(); return; }
    opening = true;
    try {
      const result = await post<{ panelId: string }>(page, "/terminal");
      panelId = result.panelId;
      view = await terminal.mount(screen, { panelId, onEvent }); view.focus();
    } catch (error) { panelId = undefined; recover(error instanceof Error ? error.message : String(error)); }
    finally { opening = false; }
  };
  const bridge: ShelfTui = {
    open: () => { void open(); },
    send(text) { if (!opening && !panelId) return false; if (live) write(text); else queued.push(text); return true; },
    isLive: () => live,
  };
  globalThis.molisWorkShelfTui = bridge;
  page.lifetime.signal.addEventListener("abort", () => { if (globalThis.molisWorkShelfTui === bridge) globalThis.molisWorkShelfTui = undefined; });
}
