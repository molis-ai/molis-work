import { SETTINGS_DIRECTORY_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";
import vm from "node:vm";

type Event = { type: string; detail?: { href?: string } };
type Listener = (event: Event) => void;
export type SettingsAddressSection = string | { id: string; query?: string; hash?: string };

/** One production factory and its listeners survive replacement of the navigation rows. */
export function createSettingsAddressHarness(pluginSections: readonly SettingsAddressSection[] = []) {
  let rows = pluginSections;
  const listeners = new Map<string, Listener[]>();
  const opened: string[] = [];
  const document = {
    querySelector: (selector: string) => selector.includes("data-directory-panel") || selector.includes("data-work-surface") ? panel() : null,
    querySelectorAll: (selector: string) => selector.includes("[data-settings-section]")
      ? [...["appearance", "directories", "memory", "models", "assistant", "characters", "prompts", "runtimes", "library", "connections", "access", "history", "diagnostics", "projects"], ...rows].map((entry) => typeof entry === "string"
        ? { dataset: { settingsSection: entry } }
        : { dataset: { settingsSection: entry.id, settingsAddressQuery: entry.query, settingsAddressHash: entry.hash } })
      : [],
    createElement: () => panel(),
    adoptNode: (node: unknown) => node,
    addEventListener: (type: string, listener: Listener) => { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    dispatchEvent: (event: Event) => { for (const listener of listeners.get(event.type) ?? []) listener(event); return true; },
  };
  function panel(): Record<string, unknown> {
    const node: Record<string, unknown> = { dataset: {}, children: [], hidden: false, scrollTop: 0, scrollLeft: 0, ownerDocument: document,
      className: "", textContent: "", querySelector: () => null, querySelectorAll: () => [], replaceChildren: () => {}, append: () => {},
      remove: () => {}, matches: () => false, closest: () => null, setAttribute: () => {}, addEventListener: () => {}, contains: () => false };
    return node;
  }
  const host = { translate: (text: string) => text, projectId: "p1", setDirectory: () => {}, setExclusive: () => {}, hideDirectory: () => {},
    closeCover: () => false, openCover: () => {}, registerCover: () => {}, showToast: () => {},
    noteCover: (kind: string, place: string) => { opened.push(`${kind} ${place}`); } };
  vm.runInNewContext(`(${SETTINGS_DIRECTORY_FACTORY_SCRIPT})(host)`, {
    host, document, location: { origin: "http://127.0.0.1:4173", href: "http://127.0.0.1:4173/projects/p1/" }, URL, URLSearchParams,
    molisWorkRequest: () => new Promise(() => {}), requestAnimationFrame: () => {}, CSS: { escape: (text: string) => text },
  });
  return {
    replaceNavigation(next: readonly SettingsAddressSection[]) { rows = next; },
    open(href: string, via: "event" | "link" = "event"): string | null {
      const before = opened.length;
      if (via === "event") document.dispatchEvent({ type: "molis-work:open-settings-path", detail: { href } });
      else {
        // A plugin page draws a plain link to the settings address; the shell's own click handling opens it (from outside the settings shell).
        const anchor = { href, tagName: "A", closest: (selector: string) => selector === "a[href]" ? anchor : null, hasAttribute: () => false, matches: () => false };
        document.dispatchEvent({ type: "click", target: anchor, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; } });
      }
      const latest = opened.slice(before);
      if (latest.length > 1) throw new Error("one request opened multiple settings pages");
      return latest[0]?.split(" ").slice(2).join(" ") ?? null;
    },
  };
}
