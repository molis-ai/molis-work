/**
 * The workbench's navigation parts as the 07-1 layout settled them (docs/design/workbench-navigation, scheme A with zoning 1,
 * user 2026-11-04), drawn on the component board first (`/__ui/catalog/navigation`) so the slices that move the product onto
 * them use these rules as they are. Each part is a small step on the tab strip and titlebar the product already draws
 * (tab-workspace.ts, tab-groups.ts): the group's head and its tabs a weight apart with a hairline between; the current tab of a
 * pane without the focus keeping only its place; the strip's text buttons (all tabs, one pane only); the menus that open from
 * the titlebar (＋, all tabs, layout); a tab whose record is gone, whose plugin did not start or was removed; the Main | Right
 * switch on a phone; a pinned tab that widens in place; and the layout button at the titlebar's end. The right side's glyph
 * row and its count are glyph-tabs.ts, which the arrival page loads too. Appended after TAB_GROUP_STYLES.
 *
 * Only rules that must win over an existing `body.immersive-workbench` rule (the tab and group rules, the toggle group) carry
 * that prefix; the new class names have no rule to compete with and are written bare. Written without spaces after `:` and
 * `;`, since the host only strips comments and indentation from a served sheet.
 */
const W = "body.immersive-workbench";
const GROUP_IN = ".tab-group:is([data-plugin-group],[data-tab-group])";
const REMOVED = `${W} .tab-strip .tab-group[data-plugin-group][data-group-state=removed]`;
const STRIP_BUTTON = ".tab-strip-button";
const UNFOCUSED = `${W} .tab-strip[data-unfocused]`;
const PINNED_GROWN = `${W} .tab-strip .tab-item[data-pinned].is-grown`;
const SWITCH = `${W} .tab-pane-switch`;
const EASE = "var(--dur-hover) var(--ease-quint)";
// Keyed on the strip that leads with the pane switch (the new titlebar), so today's titlebar strip is not changed until S3 moves onto it.
const BAR = `${W} [data-titlebar-tabs]:has(>.tab-pane-switch)`;

export const WORKBENCH_NAVIGATION_STYLES = `
/* Two tiers in a group: the head names the plugin in its colour (tab-groups.ts), its tabs stay at the base weight, a hairline between them. */
.tab-group-sep{flex:none;width:1px;height:14px;margin:0 2px;background:color-mix(in srgb,var(--group-color) 30%,transparent)}
/* A pane without the focus: its current tab says where that pane is, without the lift that says "you are here". */
${UNFOCUSED} .tab-item[aria-current]{background:var(--nav-active);box-shadow:none}
${UNFOCUSED} ${GROUP_IN} .tab-item[aria-current]{background:color-mix(in srgb,var(--group-color) 18%,transparent);box-shadow:none}
${UNFOCUSED} .tab-item[aria-current]::after{display:none}
/* The strip's own text buttons (.tab-strip-button): every tab, once the strip cannot hold them; the way back from one pane only. */
${STRIP_BUTTON}{flex:none;display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border:0;border-radius:var(--r-control,8px);background:none;color:var(--ink-soft);font:inherit;font-size:12px;font-weight:var(--weight-control,500);white-space:nowrap;cursor:pointer;transition:background-color ${EASE},color ${EASE}}
${STRIP_BUTTON} svg{width:14px;height:14px;flex:none}
${STRIP_BUTTON}:hover{background:var(--nav-hover);color:var(--ink)}
${STRIP_BUTTON}:active{background:var(--nav-press,var(--nav-active))}
${STRIP_BUTTON}:focus-visible{outline:var(--focus-stroke);outline-offset:1px}
.tab-all-button[aria-expanded="true"]{background:var(--nav-active);color:var(--ink)}
.titlebar-layout>.mw-btn[aria-expanded="true"]{background:var(--nav-hover);color:var(--ink)}
.tab-all-count{color:var(--muted);font-variant-numeric:tabular-nums}
.tab-solo-chip{background:var(--accent-soft);color:var(--accent-strong,var(--accent))}
.tab-solo-chip:hover{background:color-mix(in srgb,var(--accent) 18%,var(--paper));color:var(--accent-strong,var(--accent))}
/* 全部标签 shows only once the strip cannot hold its tabs (tab-workspace-strip.ts); the right side's 独看 chip sits before its glyphs. */
${STRIP_BUTTON}[hidden]{display:none}
.side-solo-chip{order:5}
/* The right side without the focus: its current glyph keeps only its place, as a pane's tab does. */
.tab-glyph-row[data-unfocused]>.tab-item[data-glyph-only][aria-current]{background:var(--nav-active);box-shadow:none}
/* Menus that open from the titlebar: a search field on top, sections, a row's place and its "open beside", the keys at the foot. */
.mw-menu.tab-menu[hidden]{display:none}
.mw-menu.tab-menu{--ops-btn:var(--control-h,32px);width:320px;max-width:calc(100vw - 16px);max-height:min(70dvh,560px);overflow:auto;overscroll-behavior:contain}
.tab-menu-head{padding:6px 12px 4px;font-size:12px;font-weight:600}
.tab-menu-head,.tab-menu-foot{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* The search field is the grouped field (mw-input-group); in a menu it sits at the top, over the rows. */
.tab-menu-find{margin:0 0 6px}
.tab-menu-find .mw-input{flex:1}
.tab-menu .mw-menu__item[aria-current]{background:var(--nav-active)}
.tab-menu .mw-menu__label{display:flex;align-items:center;gap:6px}
.tab-menu-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--group-color)}
.tab-menu .mw-menu__item>svg:first-child{color:var(--group-color,var(--ink-soft))}
.tab-menu-row{position:relative;display:flex;align-items:center}
/* A row's place keeps the column of the shortcuts below it, at their size; "open beside" covers it on hover or keyboard focus
   instead of pushing it. The button is the switcher row's (.plugin-rail-ops > .mw-btn): the floor's size, arriving the same way. */
.tab-menu-where,.tab-menu-note{flex:none;margin-left:auto;padding-left:8px;color:var(--muted);font-size:12px;white-space:nowrap;transition:opacity ${EASE}}
.tab-menu-note{color:var(--amber)}
.tab-menu-row>.tab-menu-beside{position:absolute;right:4px;top:50%;width:var(--ops-btn);min-width:var(--ops-btn);height:var(--ops-btn);min-height:var(--ops-btn);margin-top:calc(var(--ops-btn) / -2);padding:0;opacity:0;transform:translateX(8px) scale(.92);transition:opacity ${EASE},transform var(--dur-move) var(--ease-quint),background-color ${EASE},color ${EASE}}
.tab-menu-row:is(:hover,:has(:focus-visible))>.tab-menu-beside{opacity:1;transform:none}
.tab-menu-row:is(:hover,:has(:focus-visible)) :is(.tab-menu-where,.tab-menu-note){opacity:0}
.tab-menu-foot{margin-top:4px;padding:8px 12px 4px;box-shadow:inset 0 1px 0 var(--line);color:var(--muted);font-size:12px}
/* A tab whose record is gone is struck through and still opens, so it keeps a readable ink; a plugin that did not start carries the amber point. */
${W} .tab-item[data-tab-state="gone"] .tab-item-name{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--ink-soft)}
.tab-item-trigger>.nav-warn-dot{margin-left:-2px}
.tab-menu .mw-menu__item[data-tab-state="gone"] [data-slot]{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--ink-soft)}
/* A removed plugin's group greys. Its hue is written inline on the group, which no sheet rule can override there, so the grey
   replaces what the group derives from the hue (its wash and head ink) and the hue itself on everything inside it, where the
   tabs' own ink is mixed from it. One step above the active group's wash (tab-groups.ts), so it holds while the group is active. */
${REMOVED}{--group-wash:color-mix(in srgb,var(--faint) 14%,transparent);--group-ink:var(--muted)}
${REMOVED}>*{--group-color:var(--faint);--group-fill:var(--faint)}
.tab-group-tag{flex:none;padding:0 6px 0 2px;color:var(--muted);font-size:11px;font-weight:var(--weight-control,500);white-space:nowrap}
/* On a phone only the focused pane shows: the strip leads with which one. */
${SWITCH}{display:none;flex:none;margin-right:4px}
/* A pinned tab widens in place like the right side's glyphs (glyph-tabs.ts). */
${PINNED_GROWN}{width:max-content;max-width:208px;padding:0 10px 0 8px;background:var(--nav-hover);color:var(--ink)}
${PINNED_GROWN} .tab-item-name{display:block;animation:craft-fade-in ${EASE} both}
/* The window's one layout button (a ghost icon .mw-btn) at the titlebar's end, after a hairline; with the right side hidden, its glyphs sit before it. */
.titlebar-layout{position:relative;display:flex;align-items:center;flex:none;gap:4px;padding-left:9px}
.titlebar-layout::before{content:"";position:absolute;left:0;top:50%;width:1px;height:16px;margin-top:-8px;background:var(--line-strong)}
/* Touch targets on a phone and under a coarse pointer at any width, as the tabs beside them. With no hover to look with,
   "open beside" stays shown and the row's place moves left of it. */
@media (max-width:760px),(pointer:coarse){
${STRIP_BUTTON}{height:44px;min-width:44px}
/* The small icon button is a fixed 28px square (primitives.ts); here it is the strip's touch target. */
.titlebar-layout>.mw-btn{width:44px;min-width:44px;height:44px;min-height:44px}
.tab-menu .mw-menu__item{min-height:44px}
.tab-menu-row>.tab-menu-beside{opacity:1;transform:none}
.tab-menu-row>.mw-menu__item{padding-right:calc(var(--ops-btn) + 8px)}
.tab-menu-row:is(:hover,:has(:focus-visible)) :is(.tab-menu-where,.tab-menu-note){opacity:1}
}
@media (max-width:760px){
${SWITCH}{display:inline-flex}
/* The menus take the phone's width, less the gutters, so the search prompt reads whole. */
.mw-menu.tab-menu{width:calc(100vw - 32px)}
/* The titlebar's strip on a phone: the switch and the strip's chips on one row, the current tab alone on the next, as wide as the
   strip so its title reads in full; the other tabs, pinned ones too, are reached from 全部标签, which a phone always shows. */
${BAR}{flex-wrap:wrap;gap:4px;height:auto}
${BAR}>.tab-scroll{order:1;flex:1 0 100%;width:auto}
${BAR} :is(.tab-item:not([aria-current]),.tab-group:not(:has([aria-current])),.tab-group-sep,.tab-group-tag){display:none}
${BAR} :is(.tab-group,.tab-group-pages,.tab-item[aria-current]){flex:1;min-width:0;max-width:none}
/* Each half is a 44px target; the current one is told by a ring as well as the chip, which is faint against the track in the dark. */
${SWITCH}>.mw-toggle{min-height:44px}
${SWITCH}>.mw-toggle.is-current{box-shadow:var(--shadow-soft),inset 0 0 0 1px var(--line-strong)}
.tab-all-button>span:not(.tab-all-count){display:none}
}
/* Where the right side's glyphs share the first row (side-panel.ts), the layout button ends that row instead of taking a row of its own under the strip. */
@media (max-width:600px){
${W}:not(.arrival-page) .immersive-titlebar>.titlebar-layout{order:1}
}
@media (prefers-reduced-motion:reduce){
${PINNED_GROWN} .tab-item-name{animation:none}
${STRIP_BUTTON},.tab-menu-row>.tab-menu-beside,.tab-menu-where,.tab-menu-note{transition:none}
}
`;
