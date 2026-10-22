import type { ContextActionChosen } from "@molis-ai/molis-work-contracts/services/contextual";
import type { FrameScope } from "./types.js";
import type { ContextDown, ContextUp } from "./context.js";

/** Surface events stay in the child; only their data and callbacks for a choice the shell actually offered cross the port. */
export function childContext(port: MessagePort, scope: FrameScope, root: HTMLElement): void {
  let sequence = 0, landing: Element | null = null, tools: Element | null = null;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  const send = (message: ContextUp) => port.postMessage(message);
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  scope.listen(document, "molis:surface-focus", event => {
    let value: unknown = (event as CustomEvent).detail;
    if (value && typeof value === "object" && !("screen" in value)) {
      const selection = getSelection();
      if (selection?.rangeCount && !selection.isCollapsed) value = { ...value, screen: { rect: selection.getRangeAt(0).getBoundingClientRect().toJSON() } };
    }
    send({ type: "context-report", report: "focus", value });
  });
  scope.listen(document, "molis:surface-landing", event => {
    landing = event.target instanceof Element ? event.target : null;
    send({ type: "context-report", report: "landing", value: (event as CustomEvent).detail });
  });
  scope.listen(document, "molis:context-tools", event => {
    tools = event.target instanceof Element ? event.target : null;
    send({ type: "context-report", report: "tools", value: (event as CustomEvent).detail });
  });
  const invoke = (choice: string, operation: "prepare" | "run") => new Promise<unknown>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject }); send({ type: "context-call", id, choice, operation });
  });
  scope.listen(port, "message", event => {
    const message = (event as MessageEvent<ContextDown>).data;
    if (message.type === "context-choice") {
      const detail = { ...message.value, prepare: () => invoke(message.choice, "prepare") as ReturnType<ContextActionChosen["prepare"]>,
        ...(message.runnable ? { run: () => invoke(message.choice, "run") } : {}) };
      const chosen = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail });
      window.dispatchEvent(chosen);
      send({ type: "context-taken", choice: message.choice, taken: chosen.defaultPrevented });
    } else if (message.type === "context-result") {
      const entry = pending.get(message.id); if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.value);
    } else if (message.type === "context-tool") (tools ?? root).dispatchEvent(new CustomEvent("molis:context-tool-invoke", { bubbles: true, detail: message.value }));
    else if (message.type === "context-flash") landing?.dispatchEvent(new CustomEvent("molis:surface-landing-flash"));
    else if (message.type === "context-effect") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: message.value }));
    else if (message.type === "context-placement") window.dispatchEvent(new CustomEvent("molis:placement-changed", { detail: message.value }));
  });
}
