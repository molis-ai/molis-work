import { SHELL } from "./craft-finish-selectors.js";

/**
 * The bar in three zones (docs/design/workbench-navigation, zoning 1, user 2026-11-04): where to go at the left (the switcher as
 * its glyph alone, then the Dock), the Assistant in the middle, and the person's own at the right — the personal plugins they
 * keep, in the tray the bar already gives its right group (`.bar-side`, navigation-flow.ts) with the Dock's own `.dock-pin`
 * buttons, then the project. So only what is new is here: the right tray's sizing and the amber point of a plugin that did not start, which
 * the tab strip, the switcher rows and the ＋ menu draw too (one mark wherever that plugin is named). Written without spaces
 * after `:` and `;`, since the host only strips comments and indentation from a served sheet, and this block ships in three.
 */
export const BAR_ZONE_STYLES = `
.nav-warn-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--amber)}
${SHELL} .bar-own{flex:0 1 auto;min-width:0}
${SHELL} .bar-own:empty{display:none}
${SHELL} .dock-pin>.nav-warn-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;box-shadow:0 0 0 2px var(--desk);pointer-events:none}
`;
