import type { ContextActionChosen } from "@molis-ai/molis-work-contracts/services/contextual";
import type { FrameScope } from "./types.js";

type Report = "focus" | "landing" | "tools";
export type ContextUp = { type: "context-report"; report: Report; value: unknown }
  | { type: "context-unreadable"; itemId: unknown }
  | { type: "context-taken"; choice: string; taken: boolean }
  | { type: "context-call"; choice: string; id: number; operation: "prepare" | "run" };
export type ContextDown = { type: "context-choice"; choice: string; value: Omit<ContextActionChosen, "prepare" | "run" | "handled">; runnable: boolean }
  | { type: "context-result"; id: number; value?: unknown; error?: string }
  | { type: "context-tool"; value: unknown } | { type: "context-flash" }
  | { type: "context-effect" | "context-placement"; value: unknown };

/** Only serializable, bounded presentation data crosses this channel. The server validates its semantic shape. */
function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const json = JSON.stringify(value);
  return json.length <= 64_000 ? JSON.parse(json) as Record<string, unknown> : null;
}

function focusInParent(value: Record<string, unknown>, frame: HTMLIFrameElement): void {
  const screen = record(value.screen), rect = record(screen?.rect);
  if (!rect) return;
  const box = frame.getBoundingClientRect();
  const number = (key: string, max: number) => typeof rect[key] === "number" && Number.isFinite(rect[key]) ? Math.max(0, Math.min(max, rect[key])) : 0;
  const left = box.left + number("left", box.width), top = box.top + number("top", box.height);
  const width = Math.min(number("width", box.width), box.right - left), height = Math.min(number("height", box.height), box.bottom - top);
  value.screen = { rect: { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height }, placement: screen?.placement };
}

/** The real toolbar offers a closure, not an endpoint. Each choice belongs to exactly this mounted page and runs once. */
export function frameContext(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement, pluginId: string, pageId: string) {
  let chosen: { id: string; value: ContextActionChosen; reply(taken: boolean): void; pending: Partial<Record<"prepare" | "run", Promise<unknown>>> } | undefined;
  const send = (message: ContextDown) => port.postMessage(message);
  scope.own(() => { chosen?.reply(false); chosen = undefined; });
  scope.listen(window, "molis:assistant-context-action-chosen", event => {
    const value = (event as CustomEvent<ContextActionChosen>).detail;
    if (value?.plugin_id !== pluginId || !scope.visible || value.handled || typeof value.prepare !== "function") return;
    chosen?.reply(false);
    let reply!: (taken: boolean) => void;
    value.handled = new Promise<boolean>(resolve => { reply = resolve; });
    chosen = { id: crypto.randomUUID(), value, reply, pending: {} };
    const { prepare: _prepare, run: _run, handled: _handled, ...plain } = value;
    send({ type: "context-choice", choice: chosen.id, value: plain, runnable: typeof value.run === "function" });
  });
  scope.listen(root, "molis:context-tool-invoke", event => send({ type: "context-tool", value: (event as CustomEvent).detail }));
  scope.listen(root, "molis:surface-landing-flash", () => send({ type: "context-flash" }));
  scope.listen(window, "molis:assistant-effect", event => send({ type: "context-effect", value: (event as CustomEvent).detail }));
  scope.listen(window, "molis:placement-changed", event => send({ type: "context-placement", value: (event as CustomEvent).detail }));
  return async (message: ContextUp): Promise<void> => {
    if (!scope.alive) return;
    if (message.type === "context-unreadable") {
      if (typeof message.itemId === "string" && message.itemId.length > 0 && message.itemId.length <= 1000)
        root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: message.itemId } }));
      return;
    }
    if (message.type === "context-report") {
      const value = record(message.value);
      if (value) { value.plugin_id = pluginId; delete value.place; delete value.side_tab; delete value.pane_id; }
      if (message.report === "focus") {
        if (value) focusInParent(value, frame);
        root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: value }));
      } else if (message.report === "landing") root.dispatchEvent(new CustomEvent("molis:surface-landing", { bubbles: true, detail: value }));
      else if (message.report === "tools") root.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: value }));
      return;
    }
    const current = chosen;
    if (message.type === "context-taken") { if (current?.id === message.choice) current.reply(message.taken === true); return; }
    if (message.type !== "context-call" || !Number.isSafeInteger(message.id)) return;
    try {
      if (!current || current.id !== message.choice || !["prepare", "run"].includes(message.operation)) throw new Error("Choice expired");
      const callback = current.value[message.operation];
      if (typeof callback !== "function") throw new Error("Choice unavailable");
      const value = await (current.pending[message.operation] ??= callback({ signal: scope.signal, page_id: pageId }));
      scope.assertCurrent();
      if (chosen !== current) throw new Error("Choice expired");
      send({ type: "context-result", id: message.id, value });
    } catch (error) {
      if (scope.alive) send({ type: "context-result", id: message.id, error: error instanceof Error ? error.message : "Choice unavailable" });
    }
  };
}
