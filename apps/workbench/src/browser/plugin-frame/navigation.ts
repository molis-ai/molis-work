import type { FrameConfig, FrameDown, FrameScope, FrameUp } from "./types.js";

export function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  if (typeof nav.userAgentData?.platform === "string" && nav.userAgentData.platform.length > 0) return nav.userAgentData.platform === "macOS";
  return /Mac|iPhone|iPad|iPod/.test(nav.platform || "");
}

const KEY_DESCRIPTOR: Record<string, { key: string; code: string }> = {
  Backslash: { key: "\\", code: "Backslash" },
  BracketLeft: { key: "[", code: "BracketLeft" },
  BracketRight: { key: "]", code: "BracketRight" },
  Period: { key: ".", code: "Period" },
  Enter: { key: "Enter", code: "Enter" },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft" },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight" },
};

/** Synthesizes a platform-aware KeyboardEvent matching a normalized plugin-frame shortcut chord. */
export function shortcutKeyboardEventInit(chord: string, mac = isMacPlatform()): KeyboardEventInit {
  const parts = chord.split("+");
  const token = parts.at(-1)!;
  const hasMod = parts.includes("Mod");
  const descriptor = KEY_DESCRIPTOR[token] ?? { key: token, code: token.length === 1 ? "Key" + token : token };
  return {
    key: descriptor.key,
    code: descriptor.code,
    metaKey: hasMod && mac,
    ctrlKey: hasMod && !mac,
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    bubbles: true,
    cancelable: true,
  };
}

/**
 * Normalizes a child-frame keydown into a portable chord name.
 * macOS strictly binds `Mod` to `metaKey` (never hijacking readline `ctrlKey` chords like `^K`/`^F`/`^B`).
 * Non-macOS binds `Mod` to `ctrlKey` and also accepts mutually exclusive `metaKey` chords dispatched by host shortcuts or cross-platform tests.
 */
export function normalizeChildShortcut(key: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">, mac = isMacPlatform()): string {
  if (mac && key.ctrlKey) return "";
  if (key.ctrlKey && key.metaKey) return "";
  const mod = mac ? key.metaKey : (key.ctrlKey || key.metaKey);
  let named: string;
  if (key.key === "\\") named = "Backslash";
  else if (key.code === "Backslash") named = "";
  else if (key.key === "[") named = "BracketLeft";
  else if (key.key === "]") named = "BracketRight";
  else if (key.key === ".") named = "Period";
  else if (key.key === "Enter" || key.code === "Enter") named = "Enter";
  else if (key.key === "ArrowLeft" || key.key === "ArrowRight") named = key.key;
  else named = key.code.replace(/^Key/, "");
  if (!named) return "";
  return (mod ? "Mod+" : "") + (key.shiftKey ? "Shift+" : "") + (key.altKey ? "Alt+" : "") + named;
}

/** The trusted shell chooses which search, workspace navigation, and declared tool chords can cross this boundary. */
export function pageNavigation(scope: FrameScope, port: MessagePort, side: boolean, frame?: HTMLIFrameElement, isReady: () => boolean = () => true) {
  let owner = document;
  if (parent !== window) {
    try { owner = parent.document; } catch { /* A foreign parent supplies no shell shortcuts. */ }
  }
  const shortcuts = [...owner.querySelectorAll<HTMLElement>("[data-side-keys]")].map(node => node.dataset.sideKeys!).filter(Boolean);
  if (owner.querySelector("[data-global-search-dialog]")) shortcuts.push("Mod+K", "Mod+F");
  // ⌘\ / Ctrl+\ collapses or opens the shell's right side wherever the keyboard is.
  if (owner.querySelector("[data-side-tabs]")) shortcuts.push("Mod+Backslash");
  // Workspace navigation shortcuts forwarded from inside Layer 2 plugin frames (102-1):
  // Advertise only when THIS document owns a tab workspace (top workbench or embedded side pane),
  // so standalone side-view frames do not intercept and silently drop them.
  const WORKSPACE_SHORTCUTS = ["Mod+BracketLeft", "Mod+BracketRight", "Alt+ArrowLeft", "Alt+ArrowRight", "Mod+Shift+T", "Mod+Shift+Enter"];
  const ownsWorkspace = Boolean(document.querySelector("[data-tab-workspace], .workspace-history"));
  if (ownsWorkspace) shortcuts.push(...WORKSPACE_SHORTCUTS);
  // The channel keeps focus after the visibility message, including a previously hidden side view.
  // Hand DOM and WindowProxy focus into the opaque child iframe only after it reports ready so an
  // uncommitted OOPIF swap never drops focus while Chromium 158+ still allows its internal .focus() call.
  const focus = () => {
    if (!side || !scope.visible || !isReady() || !document.hasFocus()) return;
    if (frame && frame.isConnected) {
      if (document.activeElement !== frame) frame.focus({ preventScroll: true });
      try { frame.contentWindow?.focus(); } catch { /* Ignore cross-origin focus handoff refusal. */ }
    }
    port.postMessage({ type: "focus" } satisfies FrameDown);
  };
  scope.listen(window, "focus", focus);
  return { shortcuts, focus, receive(message: Extract<FrameUp, { type: "shortcut" | "close-side" }>) {
    if (!scope.visible) return;
    if (message.type === "close-side") {
      if (side && parent !== window) parent.postMessage({ type: "molis:side-close" }, location.origin);
    } else if (shortcuts.includes(message.keys)) {
      const localWorkspaceChord = ownsWorkspace && WORKSPACE_SHORTCUTS.includes(message.keys);
      if (parent !== window && !localWorkspaceChord) parent.postMessage({ type: "molis:side-key", keys: message.keys }, location.origin);
      else {
        // Dispatch on `document` with `bubbles: true` so both `document` listeners (tab-workspace, plugin-tab-groups,
        // context-bar) and `window` listeners (global-search, side-panel) receive the forwarded shortcut.
        document.dispatchEvent(new KeyboardEvent("keydown", shortcutKeyboardEventInit(message.keys)));
      }
    }
  } };
}

export function childNavigation(port: MessagePort, scope: FrameScope, config: FrameConfig, itemTab: () => FrameConfig["itemTab"]): void {
  const openBehind = (raw: Event) => {
    const event = raw as MouseEvent;
    const behind = event.type === "click" ? event.metaKey || event.ctrlKey : event.button === 1;
    const ordinary = event.type === "click" && event.isTrusted && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (!behind && !ordinary) return;
    const target = event.target instanceof Element ? event.target : null, rowSpec = config.recordRow ?? config.searchRow;
    if (!target || !rowSpec || target.closest("a[href]")) return;
    const row = target.closest<HTMLElement>(rowSpec.selector), id = row?.dataset[rowSpec.idDataset];
    if (!row || !id) return;
    if (ordinary) {
      const current = itemTab();
      if (!current || current.itemId === id) return;
      const control = target.closest('button,a[href],input,select,textarea,summary,[contenteditable="true"],[role="button"]');
      if (control && control !== row && row.contains(control)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      port.postMessage({ type: "ui", name: "openItem", itemTabId: current.tabId,
        args: [config.surface, id, row.getAttribute("data-frame-asset-title") || row.querySelector("strong")?.textContent?.trim() || id] } satisfies FrameUp);
      return;
    }
    if (event.type === "click" && row.closest('[aria-multiselectable="true"]')) return;
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
    if (document.querySelector("dialog[open],:popover-open")) return;
    const mac = isMacPlatform();
    const chord = normalizeChildShortcut(key, mac);
    const target = key.target instanceof Element ? key.target : null;
    const inTerminal = Boolean(target?.closest("[data-tui-pane],.xterm"));
    const inEditable = inTerminal
      || Boolean(target instanceof HTMLElement && target.isContentEditable)
      || Boolean(target?.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"]'));
    if (inTerminal && ["Mod+K", "Mod+F", "Mod+BracketLeft", "Mod+BracketRight", "Mod+Shift+T", "Mod+Shift+Enter", "Alt+ArrowLeft", "Alt+ArrowRight"].includes(chord)) return;
    if (inEditable && ["Mod+Shift+T", "Mod+Shift+Enter", "Alt+ArrowLeft", "Alt+ArrowRight"].includes(chord)) return;
    if (!mac && (chord === "Mod+BracketLeft" || chord === "Mod+BracketRight")) return;
    if (mac && (chord === "Alt+ArrowLeft" || chord === "Alt+ArrowRight")) return;
    if (chord && config.shortcuts.includes(chord)) { key.preventDefault(); port.postMessage({ type: "shortcut", keys: chord } satisfies FrameUp); }
    else if (config.side && key.key === "Escape") {
      key.preventDefault(); port.postMessage({ type: "close-side" } satisfies FrameUp);
    }
  });
}
