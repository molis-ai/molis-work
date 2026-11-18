import { SHELL } from "./craft-finish-selectors.js";

/**
 * The amber point of a plugin that did not start (docs/design/workbench-navigation, zoning 1, user 2026-11-04), which the Dock's
 * glyphs, the tab strip, the switcher rows and the ＋ menu draw alike (one mark wherever that plugin is named). The person's own
 * tray it once sized at the bar's right end is gone with specs/screen-polish §3 方案 C. Written without spaces after `:` and `;`,
 * since the host only strips comments and indentation from a served sheet, and this block ships in three.
 */
export const BAR_ZONE_STYLES = `
.nav-warn-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--amber)}
${SHELL} .dock-pin>.nav-warn-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;box-shadow:0 0 0 2px var(--desk);pointer-events:none}
`;
