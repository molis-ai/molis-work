import type { UiPageView } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

/** Only the shell supplies the floating context. The page asks for a target, never for a document or another installation. */
export function childTaskView(port: MessagePort, scope: FrameScope, initial?: Readonly<Record<string, string>>): Pick<UiPageView, "openTask" | "task"> {
  let sequence = 0, input = initial ? Object.freeze({ ...initial }) : undefined;
  let returnFocus: HTMLElement | null = null;
  let waitingForFocus: (() => void) | undefined;
  let focusFrame = 0;
  const pending = new Map<number, { resolve(): void; reject(error: Error): void }>(), listeners = new Set<(input: Readonly<Record<string, string>>) => void>();
  const close = () => { if (scope.alive && input) port.postMessage({ type: "task-close" } satisfies FrameUp); };
  const cancelReturnFocus = () => {
    waitingForFocus?.(); waitingForFocus = undefined;
    cancelAnimationFrame(focusFrame); focusFrame = 0;
  };
  scope.whenVisible(() => cancelReturnFocus);
  scope.own(() => { cancelReturnFocus(); for (const one of pending.values()) one.reject(new Error("View closed")); pending.clear(); listeners.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    const message = event.data;
    if (message.type === "task-opened") {
      const one = pending.get(message.id); if (!one) return; pending.delete(message.id);
      if (message.error) one.reject(new Error(message.error)); else one.resolve();
    } else if (message.type === "task-input" && input) {
      input = Object.freeze({ ...message.input }); for (const listener of listeners) listener(input);
    } else if (message.type === "task-return-focus") {
      if (message.id !== sequence) return;
      const entry = returnFocus;
      returnFocus = null;
      cancelReturnFocus();
      if (!entry || !scope.visible) return;
      // The port message can arrive before Chromium transfers focus to this frame.
      const restore = () => {
        if (!document.hasFocus()) return;
        cancelReturnFocus();
        focusFrame = requestAnimationFrame(() => {
          focusFrame = 0;
          if (!scope.visible || !document.hasFocus() || document.activeElement !== document.body) return;
          (entry.isConnected ? entry : document.getElementById(entry.id))?.focus({ preventScroll: true });
        });
      };
      if (document.hasFocus()) restore();
      else waitingForFocus = scope.listen(window, "focus", restore);
    }
  });
  if (initial) scope.listen(document, "keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key === "Escape" && !key.defaultPrevented && !key.isComposing) { key.preventDefault(); close(); }
  });
  return {
    openTask: value => new Promise<void>((resolve, reject) => {
      scope.assertCurrent(); const id = ++sequence; pending.set(id, { resolve, reject });
      cancelReturnFocus();
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      port.postMessage({ type: "task-open", id, input: { ...value } } satisfies FrameUp);
    }),
    ...(input ? { task: { get input() { return input!; }, subscribe(listener: (value: Readonly<Record<string, string>>) => void) { listeners.add(listener); return () => listeners.delete(listener); }, close } } : {}),
  };
}
