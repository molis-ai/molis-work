/**
 * The right side's glyph-only tabs (docs/design/workbench-navigation 12, 13): a row of 32px tabs against the titlebar's right
 * edge, each widening in place to say its name (`.is-grown`, set after a short rest or on keyboard focus), and the count of
 * unfinished work on a glyph. The row is drawn in two sheets: the project page (workbench.css) and the arrival page
 * (arrival.css), and only the first carries the generic `.tab-item` rules of tab-workspace.ts and linear-density.ts. So the
 * row brings its own tab: the same tokens and values those rules give a tab on the project page, at a specificity that wins
 * over them there (each state one class above the generic one), so the two pages draw the same tab. The trigger is a button,
 * so it is reset here too; a div's own defaults (margin, outline, font) are not restated.
 *
 * Written without spaces after `:` and `;`: the host only strips comments and indentation from a served sheet, and this
 * block ships twice.
 */
const T = ".tab-glyph-row>.tab-item[data-glyph-only]";

export const GLYPH_TAB_STYLES = `
/* The row keeps its width: its tabs are fixed, so it is the strip before it that gives way, never the row over its neighbours. */
.tab-glyph-row{display:flex;flex:none;align-items:center;justify-content:flex-end;gap:4px}
${T}{--glyph-tab:32px;box-sizing:border-box;position:relative;display:flex;align-items:center;flex:0 0 auto;width:var(--glyph-tab);min-width:var(--glyph-tab);max-width:var(--glyph-tab);height:26px;padding:0;border:0;border-radius:6px;background:color-mix(in srgb,var(--nav-hover) 55%,var(--nav-bg));color:var(--ink-soft);font-size:12px;font-weight:400;box-shadow:none;transition:background-color var(--dur-move) var(--ease-quint),box-shadow var(--dur-move) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
${T}:not([aria-current]):is(:hover,.is-grown){background:var(--nav-hover);color:var(--ink)}
${T}:active:not([aria-current]){background:var(--nav-press,var(--nav-active))}
${T}[aria-current]{background:var(--nav-raised);color:var(--ink);box-shadow:var(--surface-shadow),inset 0 0 0 1px var(--hairline),inset 0 1px 0 var(--edge-highlight)}
${T}:has(.tab-item-trigger:focus-visible){outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset)}
/* In a row against the right edge the name comes before the glyph, so the glyph stays where it was. */
${T} .tab-item-trigger{display:flex;flex:1;flex-direction:row-reverse;align-items:center;justify-content:center;gap:6px;min-width:0;height:100%;margin:0;padding:0;border:0;border-radius:4px;background:none;color:inherit;font:inherit;cursor:pointer;outline:none}
${T} .tab-item-icon{flex:none;width:14px;height:14px;color:var(--plugin-color,var(--muted))}
${T} .tab-item-name{display:none;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
/* The width steps at once; only the name fades in. The right padding is the 14px glyph's inset in the folded tab, (tab - 14) / 2,
   so the glyph does not move; the name gets a pixel more on its side. */
${T}.is-grown{width:max-content;max-width:208px;padding:0 calc(var(--glyph-tab) / 2 - 7px) 0 calc(var(--glyph-tab) / 2 - 6px)}
${T}.is-grown .tab-item-name{display:block;animation:tab-name-in var(--dur-hover) var(--ease-quint) both}
@keyframes tab-name-in{from{opacity:0}}
/* The count of unfinished work on a glyph (background tasks). */
.tab-count-badge{position:absolute;top:-1px;right:-1px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:var(--action);color:var(--action-ink);font-size:11px;font-weight:600;line-height:15px;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none}
/* A touch target folds to 44 × 44, as the generic tab grows to 44px high there; the open padding follows from the same width.
   The corner stays: a pointer changes a target's size, not its shape. */
@media (max-width:760px),(pointer:coarse){${T}{--glyph-tab:44px;height:44px}}
@media (prefers-reduced-motion:reduce){${T},${T} .tab-item-name{transition:none;animation:none}}
`;
