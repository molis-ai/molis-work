import { sideOpenedPlugins } from "../../plugin-catalog.js";

/** The side tab of each plugin that opens in the side panel, for the page (`sideOpenedPlugins`). */
export const sideOpenedTabs = (): string => JSON.stringify(sideOpenedPlugins());

/**
 * Where opening a plugin lands (specs/context-program §21.6, W2'-2): the one place the workbench turns a plugin name —
 * `?openPlugin=`, a search hit's `open.surface`, an opener's plugin — into a place. A plugin the declarations put in the
 * side panel (`tabs`, from `sideOpenedPlugins`) opens its tab there; the item asked for goes to that tab as it is, the
 * workbench never reads it. Anything else is left to the work area: the answer is false. A link opened on load goes to
 * the panel before the page is first painted (else it shows at full width, then narrows): at once if the panel already
 * listens, else when the script that sets it up has run, else once the page's scripts have.
 * Stringified into the tab workspace's factory (kept terse: it ships in the page's script as written here).
 */
export function openPluginInSide(tabs: Record<string, string>, plugin: string, item?: string | null, title?: string | null): boolean {
  const tab = Object.hasOwn(tabs, plugin) && tabs[plugin], open = () => !document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab, target: item ? { item, title } : null }, cancelable: true }));
  if (tab && !open() && document.readyState === "loading") queueMicrotask(() => open() || document.addEventListener("DOMContentLoaded", open, { once: true }));
  return !!tab;
}
