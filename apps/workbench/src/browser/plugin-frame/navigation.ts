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
  return { shortcuts, focus, receive(message: Extract<FrameUp, { type: "shortcut" | "close-side" }>) {
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
  const openBehind = (raw: Event) => {
    const event = raw as MouseEvent;
    if (event.type === "click" ? !event.metaKey && !event.ctrlKey : event.button !== 1) return;
    const target = event.target instanceof Element ? event.target : null, rowSpec = config.recordRow ?? config.searchRow;
    if (!target || !rowSpec || target.closest("a[href]")) return;
    const row = target.closest<HTMLElement>(rowSpec.selector), id = row?.dataset[rowSpec.idDataset];
    if (!row || !id || event.type === "click" && row.closest('[aria-multiselectable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    port.postMessage({ type: "open-behind", itemId: id, title: row.getAttribute("data-frame-asset-title") || row.querySelector("strong")?.textContent?.trim() || id } satisfies FrameUp);
  };
  for (const name of ["click", "auxclick"]) {
    window.addEventListener(name, openBehind, true);
    scope.own(() => window.removeEventListener(name, openBehind, true));
  }
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
