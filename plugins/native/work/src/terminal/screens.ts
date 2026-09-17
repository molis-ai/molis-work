import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

export interface TerminalScreensOptions {
  host: HTMLElement;
  onInput(panelId: string, data: string): void;
}

/** Own xterm rendering, local output buffers and theme changes. */
export function createTerminalScreens(options: TerminalScreensOptions) {
  const terminalHost = options.host;
  const terminalPalette = () => document.documentElement.dataset.resolvedTerminalTheme === "light"
    ? {
        background: "#ffffff",
        foreground: "#222326",
        cursor: "#222326",
        cursorAccent: "#ffffff",
        selectionBackground: "#eef0fb",
        selectionInactiveBackground: "#eceef0",
        black: "#222326",
        red: "#b03d45",
        green: "#2d7a5a",
        yellow: "#8a6d12",
        blue: "#5e6ad2",
        magenta: "#7f5eb0",
        cyan: "#3d6f78",
        white: "#d0d6e0",
        brightBlack: "#6b6f76",
        brightRed: "#eb5757",
        brightGreen: "#4cb782",
        brightYellow: "#e2b203",
        brightBlue: "#8b93f1",
        brightMagenta: "#a78bda",
        brightCyan: "#4db7c9",
        brightWhite: "#f3f4f5",
      }
    : {
        background: "#0f1011",
        foreground: "#f7f8f8",
        cursor: "#f7f8f8",
        cursorAccent: "#0f1011",
        selectionBackground: "#262848",
        selectionInactiveBackground: "#23252a",
        black: "#0f1011",
        red: "#ee858c",
        green: "#6bc49a",
        yellow: "#e0c56a",
        blue: "#8b93f1",
        magenta: "#c0a0ea",
        cyan: "#86c0c7",
        white: "#d0d1d3",
        brightBlack: "#8a8f98",
        brightRed: "#eb5757",
        brightGreen: "#4cb782",
        brightYellow: "#e2b203",
        brightBlue: "#a8aef5",
        brightMagenta: "#a78bda",
        brightCyan: "#4db7c9",
        brightWhite: "#f7f8f8",
      };

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

  const terminalVisibleOutput = (panelId: string) => {
    const session = sessions.get(panelId);
    const buffer = session?.term.buffer.active;
    const renderedOutput = buffer
      ? Array.from({ length: Math.min(session?.term.rows ?? 24, Math.max(0, buffer.length - buffer.viewportY)) }, (_, index) =>
          buffer.getLine(buffer.viewportY + index)?.translateToString(true) ?? "",
        ).join("\n")
      : "";
    return [terminalHost.textContent ?? "", renderedOutput].join("\n");
  };

  return {
    get: (panelId: string) => sessions.get(panelId),
    has: (panelId: string) => sessions.has(panelId),
    entries: () => sessions.entries(),
    ensure: ensureSession,
    visibleOutput: terminalVisibleOutput,
    remove(panelId: string) {
      sessions.get(panelId)?.term.dispose();
      sessions.get(panelId)?.wrapper.remove();
      sessions.delete(panelId);
    },
  };
}
