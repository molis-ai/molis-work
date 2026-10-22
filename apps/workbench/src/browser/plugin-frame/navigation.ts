import type { FrameConfig, FrameDown, FrameScope, FrameUp } from "./types.js";

/** The trusted shell chooses which declared tool chords can cross this boundary. */
export function pageNavigation(scope: FrameScope, port: MessagePort, side: boolean) {
  let owner = document;
  if (parent !== window) {
    try { owner = parent.document; } catch { /* A foreign parent supplies no shell shortcuts. */ }
  }
  const shortcuts = [...owner.querySelectorAll<HTMLElement>("[data-side-keys]")].map(node => node.dataset.sideKeys!).filter(Boolean);
  // The channel keeps focus after the visibility message, including a previously hidden side view.
  const focus = () => { if (side && scope.visible && document.hasFocus()) port.postMessage({ type: "focus" } satisfies FrameDown); };
  scope.listen(window, "focus", focus);
  return { shortcuts, focus, todoAvailable: () => owner.body.hasAttribute("data-todo-available"), receive(message: Extract<FrameUp, { type: "shortcut" | "close-side" }>) {
    if (!scope.visible) return;
    if (message.type === "close-side") {
      if (side && parent !== window) parent.postMessage({ type: "molis:side-close" }, location.origin);
    } else if (shortcuts.includes(message.keys)) {
      if (parent !== window) parent.postMessage({ type: "molis:side-key", keys: message.keys }, location.origin);
      else {
        const keys = message.keys.split("+"), key = keys.at(-1)!;
        window.dispatchEvent(new KeyboardEvent("keydown", { key, code: "Key" + key,
          metaKey: keys.includes("Mod"), shiftKey: keys.includes("Shift"), altKey: keys.includes("Alt"), bubbles: true }));
      }
    }
  } };
}

export function childNavigation(port: MessagePort, scope: FrameScope, config: FrameConfig): void {
  scope.listen(window, "keydown", event => {
    const key = event as KeyboardEvent;
    if (key.repeat || key.isComposing || key.defaultPrevented) return;
    const chord = (key.metaKey || key.ctrlKey ? "Mod+" : "") + (key.shiftKey ? "Shift+" : "")
      + (key.altKey ? "Alt+" : "") + key.code.replace(/^Key/, "");
    if (config.shortcuts.includes(chord)) { key.preventDefault(); port.postMessage({ type: "shortcut", keys: chord } satisfies FrameUp); }
    else if (config.side && key.key === "Escape" && !document.querySelector("dialog[open],:popover-open")) {
      key.preventDefault(); port.postMessage({ type: "close-side" } satisfies FrameUp);
    }
  });
}
