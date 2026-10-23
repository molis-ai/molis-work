import * as xterm from "@xterm/xterm";
import * as xtermFit from "@xterm/addon-fit";
import xtermCss from "@xterm/xterm/css/xterm.css";
import type { UiPageTerminal, UiTerminalMountOptions, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";
import { terminalPalette } from "./terminal-theme.js";

type Xterm = typeof import("@xterm/xterm");
const { Terminal } = ((xterm as { default?: Xterm }).default ?? xterm) as Xterm;
type Fit = typeof import("@xterm/addon-fit");
const { FitAddon } = ((xtermFit as { default?: Fit }).default ?? xtermFit) as Fit;

/** Shared terminal presentation. Process creation and panel ownership stay on the server. */
export async function mountTerminalView(element: HTMLElement, options: UiTerminalMountOptions,
  connection: Pick<UiPageTerminal, "send" | "listen">): Promise<UiTerminalView> {
  if (!document.querySelector("[data-terminal-style]")) {
    const style = document.createElement("style"); style.dataset.terminalStyle = "";
    style.textContent = String(xtermCss); document.head.append(style);
  }
  const wrapper = document.createElement("div"); wrapper.className = "tui-xterm is-ready";
  wrapper.style.cssText = "width:100%;height:100%;min-height:0"; element.append(wrapper);
  const term = new Terminal({ convertEol: false, fontSize: 13, lineHeight: 1.3, scrollback: 8000, macOptionIsMeta: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", Consolas, "Liberation Mono", "Courier New", monospace',
    cursorBlink: true, theme: terminalPalette() });
  const fitAddon = new FitAddon(); term.loadAddon(fitAddon); term.open(wrapper);
  let disposed = false, attached = false;
  const failed = (error: unknown) => {
    if (!disposed) options.onEvent?.({ type: "error", panelId: options.panelId, message: error instanceof Error ? error.message : String(error) });
  };
  const input = term.onData(data => { void connection.send({ type: "write", panelId: options.panelId, data }).catch(failed); });
  const unlisten = connection.listen(event => {
    if (disposed || "panelId" in event && event.panelId !== options.panelId) return;
    if (event.type === "data") term.write(event.data);
    else if (event.type === "spawned") { term.reset(); if (event.replay) term.write(event.replay); }
    options.onEvent?.(event);
  });
  const fit = () => {
    if (disposed || !element.clientWidth || !element.clientHeight) return;
    fitAddon.fit();
    if (attached) void connection.send({ type: "resize", panelId: options.panelId, cols: term.cols, rows: term.rows }).catch(failed);
  };
  const observer = new ResizeObserver(fit); observer.observe(element);
  const theme = () => { term.options.theme = terminalPalette(); };
  window.addEventListener("molis-work:terminal-theme-change", theme);
  const dispose = () => {
    if (disposed) return; disposed = true;
    observer.disconnect(); unlisten(); input.dispose();
    window.removeEventListener("molis-work:terminal-theme-change", theme); term.dispose(); wrapper.remove();
  };
  try { fit(); await connection.send({ type: "attach", panelId: options.panelId, cols: term.cols, rows: term.rows }); attached = true; }
  catch (error) { dispose(); throw error; }
  return { focus: () => { if (!disposed) term.focus(); }, fit, dispose };
}
