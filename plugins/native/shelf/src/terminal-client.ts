import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import xtermCss from "@xterm/xterm/css/xterm.css";

/**
 * The Shelf's 对话 pane. One terminal session for the whole shelf: only 对话
 * opens it, collapsing or switching preview never kills it, and what goes in is
 * exactly what the person sent — the TUI is never parsed or driven.
 *
 * A send goes to the terminal, not to a job copy. The pane says so.
 */
const PANEL_ID = "molis-shelf-tui";
const STYLE_ID = "molis-shelf-xterm-css";

interface ShelfTuiBridge {
  open(options: { command: string; cwd: string; title: string }): void;
  send(text: string): boolean;
  isLive(): boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var molisWorkShelfTui: ShelfTuiBridge | undefined;
}

export function startShelfTerminalClient(): void {
  const host = document.querySelector<HTMLElement>("[data-shelf-tty-screen]");
  if (!host || host.dataset.shelfTuiBound === "1") return;
  host.dataset.shelfTuiBound = "1";
  ensureStyle();

  const term = new Terminal({
    convertEol: false,
    fontSize: 12,
    lineHeight: 1.45,
    scrollback: 8000,
    macOptionIsMeta: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    cursorBlink: true,
    theme: palette(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);
  const refit = () => {
    if (!host.isConnected || host.clientWidth === 0) return;
    try {
      fit.fit();
      send({ type: "resize", panelId: PANEL_ID, cols: term.cols, rows: term.rows });
    } catch {
      /* the pane is collapsed; the next open refits */
    }
  };
  new ResizeObserver(refit).observe(host);
  window.addEventListener("molis-work:terminal-theme-change", () => {
    term.options.theme = palette();
  });

  let socket: WebSocket | null = null;
  let live = false;
  let spawning = false;
  let authenticated = false;
  let queued: string[] = [];
  let pending: { command: string; cwd: string; title: string } | null = null;

  const recoverQueued = (message: string): void => {
    const unsent = queued.splice(0).map((line) => line.replace(/\r$/, ""));
    spawning = false;
    if (unsent.length) window.dispatchEvent(new CustomEvent("molis-shelf-tui-unsent", { detail: { texts: unsent, message } }));
  };

  const send = (message: unknown): void => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  term.onData((data) => send({ type: "write", panelId: PANEL_ID, data }));

  const connect = (): void => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    const token = document.querySelector('meta[name="molis-work-control-token"]')?.getAttribute("content") || "";
    if (!token) {
      term.writeln("[38;5;180m没有本地控制令牌，终端连不上。[0m");
      return;
    }
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/pty`;
    const next = new WebSocket(url);
    socket = next;
    next.addEventListener("open", () => next.send(JSON.stringify({ type: "auth", token })));
    next.addEventListener("message", (event) => {
      let message: { type?: string; panelId?: string; data?: string; message?: string; replay?: string };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (socket !== next) return;
      if (message.type === "ready") {
        authenticated = true;
        if (pending) spawn(pending);
        return;
      }
      if (message.panelId && message.panelId !== PANEL_ID) return;
      if (message.type === "spawned") {
        live = true;
        spawning = false;
        if (message.replay) term.write(message.replay);
        refit();
        for (const line of queued.splice(0)) send({ type: "write", panelId: PANEL_ID, data: line });
        return;
      }
      if (message.type === "data" && message.data) {
        term.write(message.data);
        return;
      }
      if (message.type === "exit") {
        live = false;
        recoverQueued("终端会话已结束，未发送的输入已恢复。");
        term.writeln("\r\n[38;5;180m终端会话已结束。再次发送会重新打开。[0m");
        return;
      }
      if (message.type === "error" && message.message) {
        recoverQueued(message.message);
        window.dispatchEvent(new CustomEvent("molis-shelf-notice", { detail: { message: message.message } }));
        term.writeln(`\r\n[38;5;180m${message.message}[0m`);
      }
    });
    next.addEventListener("close", () => {
      if (socket !== next) return;
      socket = null;
      live = false;
      recoverQueued("终端连接已断开，未发送的输入已恢复。");
      authenticated = false;
    });
  };

  const spawn = (options: { command: string; cwd: string; title: string }): void => {
    pending = options;
    if (spawning || live) return;
    if (!socket || socket.readyState !== WebSocket.OPEN || !authenticated) {
      connect();
      return;
    }
    spawning = true;
    send({
      type: "spawn",
      panelId: PANEL_ID,
      command: options.command,
      args: [],
      cwd: options.cwd,
      cols: term.cols,
      rows: term.rows,
      title: options.title,
    });
  };

  globalThis.molisWorkShelfTui = {
    open(options) {
      if (!options.command) {
        term.writeln("[38;5;180m未发现终端 Agent。装一个再来对话。[0m");
        return;
      }
      refit();
      if (live) return;
      spawn(options);
    },
    send(text) {
      if (!socket || !pending) return false;
      const line = `${text}\r`;
      if (live) send({ type: "write", panelId: PANEL_ID, data: line });
      else queued.push(line);
      return true;
    },
    isLive: () => live,
  };
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = xtermCss;
  document.head.appendChild(style);
}

/** The terminal well keeps its own colours; ANSI from the agent is never repainted. */
function palette(): Record<string, string> {
  const read = (name: string, fallback: string): string => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  const light = document.documentElement.dataset.resolvedTheme !== "dark";
  return {
    background: read("--content-tty", light ? "#F8F7F4" : "#222329"),
    foreground: read("--content-tty-ink", light ? "#292A2E" : "#E9E9ED"),
    cursor: read("--content-ink", light ? "#292A2E" : "#E9E9ED"),
    cursorAccent: read("--content-tty", light ? "#F8F7F4" : "#222329"),
  };
}
