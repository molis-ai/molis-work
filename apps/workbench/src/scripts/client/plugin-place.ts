import { sideOpenedPlugins } from "../../plugin-catalog.js";

/**
 * Where opening a plugin lands (specs/context-program §21.6, W2'-2): the side view of each plugin whose only place is the right
 * side (`sideOpenedPlugins`), for the page. The tab workspace turns a plugin name — `?openPlugin=`, a search hit's `open.surface`,
 * an opener's plugin — into that view of its right side, and hands the item asked for to it as it is; the workbench never reads
 * it. A plugin not named here opens in the work area.
 */
export const sideOpenedTabs = (): string => JSON.stringify(sideOpenedPlugins());
