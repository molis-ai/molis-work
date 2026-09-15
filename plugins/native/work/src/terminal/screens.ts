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
        background: "#fbfbfc",
        foreground: "#202023",
        cursor: "#202023",
        cursorAccent: "#fbfbfc",
        selectionBackground: "#dce4f8",
        selectionInactiveBackground: "#eceefa",
        black: "#252528",
        red: "#a64e51",
        green: "#347759",
        yellow: "#936b2d",
        blue: "#5068b7",
        magenta: "#8157a2",
        cyan: "#36787f",
        white: "#d7d7dc",
        brightBlack: "#6a6a73",
        brightRed: "#b95c5f",
        brightGreen: "#43886a",
        brightYellow: "#a47a38",
        brightBlue: "#6078c8",
        brightMagenta: "#9569b5",
        brightCyan: "#478b92",
        brightWhite: "#ffffff",
      }
    : {
        background: "#101012",
        foreground: "#f0f0f2",
        cursor: "#f0f0f2",
        cursorAccent: "#101012",
        selectionBackground: "#33405b",
        selectionInactiveBackground: "#282b34",
        black: "#202023",
        red: "#e08386",
        green: "#78b391",
        yellow: "#d0a15b",
        blue: "#91a7f2",
        magenta: "#c594d8",
        cyan: "#75b7be",
        white: "#d8d8dd",
        brightBlack: "#73737c",
        brightRed: "#ee9a9d",
        brightGreen: "#91c7a7",
        brightYellow: "#dfb773",
        brightBlue: "#acbdf6",
        brightMagenta: "#d8abe8",
        brightCyan: "#91cbd0",
        brightWhite: "#ffffff",
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
