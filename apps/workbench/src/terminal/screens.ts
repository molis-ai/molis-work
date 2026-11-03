import * as xterm from "@xterm/xterm";
import * as xtermFit from "@xterm/addon-fit";
import { terminalPalette } from "../terminal-theme.js";

// The bundler reads these packages' ES modules; Node reads their UMD main, whose named exports sit on `default`.
// Either way the same classes are used, so the controllers can also be exercised outside a browser.
type Xterm = typeof import("@xterm/xterm");
const { Terminal } = ((xterm as { default?: Xterm }).default ?? xterm) as Xterm;
type Terminal = InstanceType<typeof Terminal>;
const { FitAddon } = ((xtermFit as { default?: typeof import("@xterm/addon-fit") }).default ?? xtermFit) as typeof import("@xterm/addon-fit");
type FitAddon = InstanceType<typeof FitAddon>;

interface TerminalScreensOptions {
  host: HTMLElement;
  onInput(panelId: string, data: string): void;
}

/** Own xterm rendering, local output buffers and theme changes. */
export function createTerminalScreens(options: TerminalScreensOptions) {
  const terminalHost = options.host;
  const sessions = new Map<string, {
    term: Terminal;
    fit: FitAddon;
    wrapper: HTMLElement;
    hasOutput: boolean;
    recentOutput: string;
    lastOutputAt: number;
  }>();
  const applyTerminalPalette = () => {
    const palette = terminalPalette();
    sessions.forEach(({ term }) => {
      term.options.theme = palette;
    });
  };
  window.addEventListener("molis-work:terminal-theme-change", applyTerminalPalette);
  const ensureSession = (panelId: string) => {
    let session = sessions.get(panelId);
    if (session) return session;
    const wrapper = document.createElement("div");
    wrapper.className = "tui-xterm";
    terminalHost.appendChild(wrapper);
    const term = new Terminal({
      convertEol: false,
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: 8000,
      macOptionIsMeta: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", Consolas, "Liberation Mono", "Courier New", monospace',
      cursorBlink: true,
      theme: terminalPalette(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(wrapper);
    requestAnimationFrame(() => wrapper.classList.add("is-ready"));
    term.onData((data) => options.onInput(panelId, data));
    session = { term, fit, wrapper, hasOutput: false, recentOutput: "", lastOutputAt: 0 };
    sessions.set(panelId, session);
    return session;
  };

  return {
    get: (panelId: string) => sessions.get(panelId),
    has: (panelId: string) => sessions.has(panelId),
    entries: () => sessions.entries(),
    ensure: ensureSession,
    remove(panelId: string) {
      sessions.get(panelId)?.term.dispose();
      sessions.get(panelId)?.wrapper.remove();
      sessions.delete(panelId);
    },
  };
}
