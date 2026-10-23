import type { UiPageTerminal, UiTerminalCommand, UiTerminalEvent } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";
import { mountPageTerminal } from "./terminal-renderer.js";

export function childTerminal(port: MessagePort, scope: FrameScope, origin: string): UiPageTerminal {
  let sequence = 0;
  const waiting = new Map<number, { resolve(): void; reject(error: Error): void }>();
  const listeners = new Set<(event: UiTerminalEvent) => void>();
  scope.own(() => { for (const pending of waiting.values()) pending.reject(new Error("View closed")); waiting.clear(); listeners.clear(); });
  port.addEventListener("message", (message: MessageEvent<FrameDown>) => {
    if (message.data.type === "terminal-event") for (const listen of listeners) listen(message.data.event);
    if (message.data.type !== "terminal-sent") return;
    const result = message.data, pending = waiting.get(result.id); waiting.delete(result.id);
    if (result.error) pending?.reject(new Error(result.error)); else pending?.resolve();
  });
  const service: UiPageTerminal = { mount: (element, options) => mountPageTerminal(element, options, service, scope, origin), send(command) {
    scope.assertCurrent(); const id = ++sequence;
    return new Promise<void>((resolve, reject) => { waiting.set(id, { resolve, reject }); port.postMessage({ type: "terminal", id, command } satisfies FrameUp); });
  }, listen(receive) { listeners.add(receive); return () => listeners.delete(receive); } };
  return service;
}

/** Only the owner opens the socket. The socket accepts attachment and control of this page's server-owned panels. */
export function frameTerminal(port: MessagePort, scope: FrameScope, pageId: string) {
  let socket: WebSocket | undefined, connecting: Promise<WebSocket> | undefined, retry: ReturnType<typeof setTimeout> | undefined;
  const attached = new Map<string, Extract<UiTerminalCommand, { type: "attach" }>>();
  const sendEvent = (event: UiTerminalEvent) => port.postMessage({ type: "terminal-event", event } satisfies FrameDown);
  scope.own(() => { clearTimeout(retry); socket?.close(); attached.clear(); });
  const connect = (): Promise<WebSocket> => connecting ??= new Promise((resolve, reject) => {
    const next = socket = new WebSocket(location.origin.replace(/^http/, "ws") + "/pty");
    let ready = false;
    const deadline = setTimeout(() => { reject(new Error("Terminal connection timed out")); next.close(); }, 10000);
    next.onopen = () => next.send(JSON.stringify({ type: "page-auth", pageId }));
    next.onmessage = message => {
      const value = JSON.parse(String(message.data)) as UiTerminalEvent | { type: "ready" };
      if (value.type === "ready") {
        ready = true; clearTimeout(deadline);
        for (const command of attached.values()) next.send(JSON.stringify({ ...command, type: "spawn", attachOnly: true }));
        resolve(next);
      } else sendEvent(value);
    };
    next.onerror = () => { if (!ready) reject(new Error("Terminal connection failed")); };
    next.onclose = () => {
      clearTimeout(deadline); connecting = undefined;
      if (!ready) reject(new Error("Terminal connection closed"));
      if (scope.alive) {
        sendEvent({ type: "disconnected" });
        if (attached.size) retry = setTimeout(() => { void connect().catch(() => { /* close schedules the next reconnect. */ }); }, 1500);
      }
    };
  });
  return async (message: Extract<FrameUp, { type: "terminal" }>) => {
    try {
      const command = message.command;
      if (!command || !["attach", "write", "resize", "kill"].includes(command.type) || typeof command.panelId !== "string") throw new Error("Terminal request refused");
      const connected = await connect(); scope.assertCurrent();
      if (command.type === "attach") attached.set(command.panelId, command);
      if (command.type === "resize" && attached.has(command.panelId)) attached.set(command.panelId, { ...command, type: "attach" });
      connected.send(JSON.stringify(command.type === "attach" ? { ...command, type: "spawn", attachOnly: true } : command));
      port.postMessage({ type: "terminal-sent", id: message.id } satisfies FrameDown);
    } catch (error) { if (scope.alive) port.postMessage({ type: "terminal-sent", id: message.id, error: error instanceof Error ? error.message : String(error) } satisfies FrameDown); }
  };
}
