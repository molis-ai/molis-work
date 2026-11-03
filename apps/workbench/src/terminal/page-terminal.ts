import type { UiPageTerminal, UiTerminalCommand, UiTerminalEvent, UiTerminalMountOptions, UiTerminalView } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTerminalConnection, type PtyServerMessage } from "./connection.js";

/** What draws a panel's screen (`molisTerminalRenderer`); given the page terminal itself to listen to and write through. */
export type TerminalRenderer = (element: HTMLElement, options: UiTerminalMountOptions, connection: Pick<UiPageTerminal, "send" | "listen">) => Promise<UiTerminalView>;

/**
 * The platform's terminal for a page the shell draws itself (PG-053): the same `UiPageTerminal` a plugin frame is handed, over the
 * shell's own authenticated /pty channel. A client asks for the panel its backend made, attaches to it, writes, resizes and kills
 * it; it cannot start a process (`spawn` is not a command it can send). Rendering is `molisTerminalRenderer`'s.
 */
export function createPageTerminal(render: TerminalRenderer): UiPageTerminal<HTMLElement> {
  const listeners = new Set<(event: UiTerminalEvent) => void>();
  const attached = new Map<string, { cols?: number; rows?: number }>();
  const emit = (event: UiTerminalEvent) => { for (const listen of listeners) listen(event); };
  const attach = (panelId: string, size: { cols?: number; rows?: number }) => connection.send({ type: "spawn", panelId, ...size, attachOnly: true });
  const connection = createTerminalConnection({
    controlToken: () => document.querySelector('meta[name="molis-work-control-token"]')?.getAttribute("content") ?? "",
    url: () => `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/pty`, text: value => value,
    onDisconnected: () => emit({ type: "disconnected" }),
    reconnect: async () => {
      try { for (const [panelId, size] of attached) await attach(panelId, size); connection.resetReconnect(); }
      catch { connection.scheduleReconnect(); }
    },
    onMessage: message => { const event = eventOf(message); if (event) emit(event); },
  });
  const service: UiPageTerminal<HTMLElement> = {
    mount: (element, options) => render(element, options, service),
    async send(command: UiTerminalCommand) {
      // Whatever the page's types say, only these four go out: a page cannot ask this channel to start a process.
      if (!command || !["attach", "write", "resize", "kill"].includes(command.type) || typeof command.panelId !== "string") throw new Error("Terminal request refused");
      if (command.type === "attach") {
        const size = { ...(command.cols ? { cols: command.cols } : {}), ...(command.rows ? { rows: command.rows } : {}) };
        attached.set(command.panelId, size);
        return attach(command.panelId, size);
      }
      if (command.type === "write") return connection.send({ type: "write", panelId: command.panelId, data: String(command.data) });
      if (command.type === "resize") {
        if (attached.has(command.panelId)) attached.set(command.panelId, { cols: command.cols, rows: command.rows });
        return connection.send({ type: "resize", panelId: command.panelId, cols: command.cols, rows: command.rows });
      }
      attached.delete(command.panelId);
      return connection.send({ type: "kill", panelId: command.panelId });
    },
    listen(receive) { listeners.add(receive); return () => { listeners.delete(receive); }; },
  };
  return service;
}

/** What the server says about a panel, in the words a page is given; `ready` is the channel's own and goes no further. */
function eventOf(message: PtyServerMessage): UiTerminalEvent | null {
  switch (message.type) {
    case "spawned": return { type: "spawned", panelId: message.panelId ?? "", attached: message.attached ?? false, started: message.started ?? false, replay: message.replay ?? "" };
    case "data": return { type: "data", panelId: message.panelId ?? "", data: message.data ?? "" };
    case "exit": return { type: "exit", panelId: message.panelId ?? "", exitCode: message.exitCode ?? 0, signal: message.signal ?? 0 };
    case "error": return { type: "error", ...(message.panelId ? { panelId: message.panelId } : {}), message: message.message ?? "" };
    default: return null;
  }
}
