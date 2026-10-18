import { sideOpenedPlugins } from "../../plugin-catalog.js";

/** The side tab of each plugin that opens in the side panel, for the page (`sideOpenedPlugins`). */
export const sideOpenedTabs = (): string => JSON.stringify(sideOpenedPlugins());

/**
 * Where opening a plugin lands (specs/context-program §21.6, W2'-2): the one place the workbench turns a plugin name —
 * `?openPlugin=`, a search hit's `open.surface`, an opener's plugin — into a place. A plugin the declarations put in the
 * side panel (`tabs`, from `sideOpenedPlugins`) opens its tab there; the item asked for goes to that tab as it is, the
 * workbench never reads it. Anything else is left to the work area: the answer is false. The panel starts listening once
 * the page's scripts have run, so a link opened on load waits for that.
 * Stringified into the tab workspace's factory (kept terse: it ships in the page's script as written here).
 */
export function openPluginInSide(tabs: Record<string, string>, plugin: string, item?: string | null, title?: string | null): boolean {
  const tab = Object.hasOwn(tabs, plugin) && tabs[plugin], open = () => document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab, target: item ? { item, title } : null } }));
  if (tab) document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", open, { once: true }) : open();
  return !!tab;
}
