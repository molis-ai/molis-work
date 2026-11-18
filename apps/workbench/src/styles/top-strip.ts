/**
 * The top strip as 方案 C「纸上的页签」 draws it (specs/screen-polish §3, §10; mock docs/design/screen-polish, screens 12–14).
 *
 * The strip holds tabs and nothing else. The current tab is an ear grown on its sheet: paper-coloured, joined to the sheet below
 * with two concave corners, and, while its column has the focus, a 2px accent line on top. Every other tab is words on the desk.
 * 项目首页 and the plugins chosen to stay are glyphs before a hairline (a kept plugin's own page is its glyph, so the strip draws
 * no second tab for it). A cover (settings, the market) is a tab like the others, after them, with its whole name and its close
 * (POLISH-06). Over the side sheet stands the name of the view it shows; it opens the list of the side's views. The right end
 * holds three controls: the side's switch, the layout button and the project (POLISH-05). A phone has one row (POLISH-07): the
 * way back, the current tab (the side view's name while the side shows), 全部标签, ＋, the side's switch, the project.
 *
 * These rules follow the work line's in the page (page-assets.ts), so they are the last word on the strip. Written without spaces
 * after `:` and `;`, since the host only strips comments and indentation.
 */
/** The shell outside a pane and the component board's real-bar specimen, as the design system's own rules name it. */
const SHELL = "html :is(body.immersive-workbench:not([data-pane-embedded]),.mw-catalog-bar-stage)";
/** The strip. Its mark is written three times so that these rules weigh what the strip's earlier rules weigh (0,4,2), in half
 * the bytes of the shell's long name: this selector opens nearly every rule below, and the sheet is paid for on every page. An
 * embedded pane's page needs no `:not([data-pane-embedded])` here: it does not draw the title bar at all (tab-workspace.ts). */
const TOP = "html body .workbench-header[data-dock][data-dock][data-dock]";
const TABS = `${TOP}>.tab-strip`;
const HOVER = "var(--dur-hover) var(--ease-quint)";
/** A pane's own strip, where the work area is split: each sheet carries its tabs. */
const PANE = "html body.immersive-workbench:not([data-pane-embedded]) .tab-workspace[data-split] .tab-workspace-panes>.tab-pane";
const PANE_TABS = `${PANE}>.tab-strip`;
/** The ears, each marked `data-ear` by the script that knows it: the current tab of a strip (tab-workspace-strip.ts; none while
 * a cover shows), the kept plugin whose own page shows (navigation-presentation.ts), the side sheet's view (immersive-shell.ts). */
const TOP_EAR = `${TOP} :is(.tab-item,.dock-pin,.side-ear)[data-ear]`;
const PANE_EAR = `${PANE_TABS} .tab-item[data-ear]`;
const EARS = `${TOP_EAR},${PANE_EAR}`;
/** The ears whose column has the focus: the strip, the Dock and the side's tab each carry `data-unfocused` while it is elsewhere. */
const TOP_FOCUSED = `${TOP}>:not([data-unfocused]) [data-ear],${TOP}>.side-ear:not([data-unfocused])`;
const PANE_FOCUSED = `${PANE_TABS}:not([data-unfocused]) [data-ear]`;
/** A selector of the shell, while the side is open (the mark is on the body). */
const sideOpen = (selector: string): string => selector.replace(/^html /, "html:has(>body[data-side-open=true]) ");

const SHEET = `
@media (min-width:761px){html body.immersive-workbench:not(.arrival-page){--desktop-titlebar-height:44px}}
${TOP}{position:relative;gap:2px;padding:0 var(--sheet-inset,14px) 0 8px;--dock-btn:28px;--ear-rest:28px;--ear-rise:36px;--ear-foot:calc((var(--desktop-titlebar-height,44px) - var(--ear-rest))/2)}
/* The kept plugins are this browser's choice, so the page's script draws them after the first paint: until it has, what they
   would push along is held unseen, so the strip is not laid out a second way while it loads (VUX-31). Should the script never
   get there, the strip shows anyway. */
${TOP}:not([data-dock-drawn])>:not(.workspace-history){visibility:hidden;animation:top-strip-shown 0s forwards;animation-delay:3s}
@keyframes top-strip-shown{to{visibility:visible}}

/* 项目首页 and the kept plugins: glyphs, then a hairline. */
${TOP}>.dock-pins{order:1;align-self:stretch;flex:0 1 auto;display:flex;align-items:center;height:auto;margin:0;padding:0 0 0 10px;gap:2px;border-radius:0;background:none;box-shadow:none}
${TOP}>.dock-pins::before,${TOP} .dock-pin[aria-current]::after,${TOP}>.plugin-picker::after{content:none}
${TOP}>.dock-pins::after{content:"";flex:none;width:1px;height:16px;margin:0 0 0 8px;background:var(--line-strong)}
${TOP} .dock-pin{flex:none;width:30px;height:var(--ear-rest);padding:0;border-radius:8px;background:transparent;box-shadow:none;color:var(--ink-soft);transition:background-color ${HOVER},color ${HOVER}}
${TOP} .dock-pin:not([data-ear]):hover{transform:none;background:var(--nav-hover);color:var(--ink)}
${TOP} .dock-pin svg{width:16px;height:16px}
${TOP} .dock-pin[aria-current]:not([data-ear]){color:var(--ink)}
${TOP} .dock-pin.is-fixed{margin-right:0}
${TOP} .dock-pin-more{width:auto;min-width:30px;padding:0 6px;font-size:12px}
.dock-pin-name{display:none}

/* The tabs take what they need and ＋ follows them. What they need is written by the script that shares their widths
   (--tabs-hug: every tab at its own width; --tabs-floor: every tab at its narrowest). Where the strip runs short the tabs narrow
   first, down to that floor while it leaves the rest of the strip 360px; then the kept plugins fold; then the tabs slide. A strip
   with no tab in it is not drawn, so ＋ stands at the hairline (POLISH-03); one with a tab is at least 2px wide before the
   script has measured it, since that script measures only a strip that has a width. */
${TABS}{order:1;align-self:stretch;flex:0 1000 var(--tabs-hug,0px);min-width:clamp(2px,var(--tabs-floor,2px),100% - 360px);height:auto;margin-right:-4px;padding:0;gap:2px}
${TABS}:not(:has(.tab-item:not([data-kept]),.tab-view-chip,.tab-strip-button:not([hidden]),[data-tab-reorder-slot])),${TABS}>.tab-strip-spacer{display:none}
${TABS}>.tab-scroll{align-self:stretch;align-items:center;box-sizing:border-box;height:auto;gap:2px;padding:0 10px}
${TABS} .tab-item{height:var(--ear-rest);border-radius:8px;background-color:transparent;box-shadow:none;color:var(--ink-soft);font-size:12px}
${TABS} .tab-item:not([data-ear]):hover{background-color:var(--nav-hover);color:var(--ink)}
${TABS} .tab-item .tab-item-icon{color:currentColor}
/* A kept plugin's own page is its glyph before the hairline; a group that holds nothing else takes no room. */
${TABS} .tab-item[data-kept],${TABS} .tab-item[data-kept]+.tab-group-sep,${TABS} .tab-plugin-group:not(:has(.tab-item:not([data-kept]))){display:none}
/* One plugin's tabs stand together with no ground of their own; a hairline parts them from the tabs before. */
${TABS} .tab-group{align-self:stretch;align-items:center;height:auto;min-height:0}
${TABS} .tab-group>.tab-group-pages{align-self:stretch;align-items:center;height:auto;min-height:0;gap:2px}
${TABS} .tab-plugin-group{padding:0;border-radius:0;background:none;box-shadow:none}
${TABS} .tab-plugin-group .tab-group-sep{display:none}
${TABS} .tab-scroll>:is(.tab-item:not([data-kept]),.tab-group:has(.tab-item:not([data-kept])))~.tab-plugin-group{position:relative;padding-left:11px}
${TABS} .tab-scroll>:is(.tab-item:not([data-kept]),.tab-group:has(.tab-item:not([data-kept])))~.tab-plugin-group::before{content:"";position:absolute;left:5px;top:50%;width:1px;height:14px;translate:0 -50%;background:var(--line-strong)}
${TABS} .tab-plugin-group:has([data-ear])::before,${TABS} .tab-plugin-group:has([data-ear])+.tab-plugin-group::before{opacity:0}
${TABS} .tab-group[data-pinned-group]{padding:0;background:none;box-shadow:none}
/* A cover's tab: after the others, never narrowed, with its whole name and its close (POLISH-06). The page it names is not a
   sheet, so its tab is a raised piece of paper and joins nothing. */
${TABS}>.tab-view-chip.is-exclusive{flex:none;display:inline-flex;align-items:center;gap:6px;height:var(--ear-rest);margin:0 10px 0 0;padding:0 6px 0 10px;border-radius:8px;background:var(--paper);box-shadow:var(--lift-1);color:var(--ink);font-size:12px;font-weight:500;cursor:default}
${TABS}>.tab-view-chip.is-exclusive>span{white-space:nowrap}
${TABS}>.tab-view-chip.is-exclusive>svg{width:14px;height:14px;color:var(--accent)}
${TABS}>.tab-view-chip .tab-view-chip-close{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--ink-soft);cursor:pointer}
${TABS}>.tab-view-chip .tab-view-chip-close:hover{background:var(--nav-active);color:var(--ink)}
${TABS}>.tab-view-chip .tab-view-chip-close svg{width:12px;height:12px}
${TOP} .tab-add-button{display:none}

/* An ear: as tall as the strip from its top edge down, paper, joined to the sheet by a concave corner on each side. These
   follow the rules of a tab and of a kept plugin at rest, which they outweigh or equal. */
${EARS}{align-self:flex-end;box-sizing:border-box;height:var(--ear-rise);padding-bottom:var(--ear-foot);border-radius:10px 10px 0 0;background-color:var(--paper);box-shadow:none;color:var(--ink);font-weight:500;transform:none;filter:drop-shadow(0 -1px 1.5px color-mix(in srgb,var(--shadow-color) 9%,transparent))}
${TOP} :is(.tab-item,.dock-pin)[data-ear],${PANE_EAR}{position:relative}
${TOP_EAR}::before,${TOP_EAR}::after,${PANE_EAR}::before,${PANE_EAR}::after{content:"";display:block;position:absolute;bottom:0;width:10px;height:10px;pointer-events:none}
${TOP_EAR}::before,${PANE_EAR}::before{right:100%;background:radial-gradient(circle at 0 0,transparent 9.5px,var(--paper) 10px)}
${TOP_EAR}::after,${PANE_EAR}::after{left:100%;background:radial-gradient(circle at 100% 0,transparent 9.5px,var(--paper) 10px)}
${TOP} .dock-pin.is-fixed::before{content:none}
/* Without the focus the ear stays its sheet's paper (the strip's older rule gave such a tab a ground of its own). */
${TABS}[data-unfocused] .tab-item[data-ear]{background:var(--paper)}
${TOP_FOCUSED},${PANE_FOCUSED}{background-image:linear-gradient(var(--accent),var(--accent));background-size:calc(100% - 22px) 2px;background-position:50% 0;background-repeat:no-repeat}
${TOP}>:not([data-unfocused]) [data-ear] .tab-item-icon,${TOP}>.dock-pins:not([data-unfocused]) [data-ear]>svg:first-child,${TOP}>.side-ear:not([data-unfocused]) .side-ear-glyph svg,${PANE_FOCUSED} .tab-item-icon{color:var(--accent)}

/* ＋ opens the start page: a plain glyph after the last tab. */
${TOP}>.plugin-picker{order:2;position:static;flex:none;max-width:none;margin-left:0;padding:0}
${TOP} .plugin-picker-trigger{justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ink-soft)}
${TOP} .plugin-picker-trigger:hover{background:var(--nav-hover);color:var(--ink)}
${TOP} .plugin-picker-trigger[aria-expanded="true"]{background:var(--nav-active);color:var(--ink)}
${TOP} .plugin-picker-trigger>svg{width:14px;height:14px}
${TOP} .plugin-picker-current{display:none}
${TOP} .plugin-picker-popover:not([hidden]){animation:craft-fade-in var(--dur-hover) var(--ease-quint) both}
${TOP}>.desktop-titlebar-drag{order:3;flex:1 1 0;width:auto;min-width:0}

/* The side sheet's own tab: the view it shows, by name, 18px in from the sheet's left edge. The tabs stop before the side's column. */
${TOP}>.side-ear{order:4;position:absolute;bottom:0;left:calc(100% - var(--sheet-inset,14px) - var(--side-panel-width,35vw) + 18px);display:inline-flex;align-items:center;gap:6px;max-width:min(210px,var(--side-panel-width,35vw) - 150px);padding-inline:10px 8px;border:0;font:inherit;font-size:12px;cursor:pointer}
${TOP}>.side-ear[hidden]{display:none}
${TOP}>.side-ear>.side-ear-glyph{display:inline-grid;flex:none}
${TOP}>.side-ear svg{flex:none;width:14px;height:14px;color:var(--ink-soft)}
${TOP}>.side-ear>svg:last-child{width:12px;height:12px}
${TOP}>.side-ear>.side-ear-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (min-width:761px){
  ${sideOpen(TOP)}>.desktop-titlebar-drag{flex-basis:calc(var(--side-panel-width,35vw) - 76px);flex-shrink:0}
  ${sideOpen(TABS)}{min-width:clamp(2px,var(--tabs-floor,2px),100% - 320px - var(--side-panel-width,35vw))}
}
/* The side's views, as the list that opens from that name: every one with its name. */
${TOP}>.side-views{order:4;position:absolute;top:calc(100% - 2px);z-index:30;display:flex;flex-direction:column;align-items:stretch;gap:1px;min-width:200px;max-width:min(320px,100vw - 16px);max-height:min(420px,100dvh - var(--dock-h,76px) - 52px);margin:0;padding:4px;overflow:hidden auto;border-radius:12px;background:var(--paper);box-shadow:var(--lift-3);animation:craft-fade-in var(--dur-hover) var(--ease-quint) both}
${TOP}>.side-views[hidden]{display:none}
${TOP}>.side-views>.tab-item{flex:none;width:auto;max-width:none;height:32px;padding:0;border-radius:8px;background:transparent;box-shadow:none;color:var(--ink-soft)}
${TOP}>.side-views>.tab-item:has(>[role=tab]:is([hidden],[data-side-closed])){display:none}
${TOP}>.side-views>.tab-item>.tab-item-trigger{flex:1 1 auto;display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:100%;padding:0 10px;font-size:13px}
${TOP}>.side-views>.tab-item .tab-item-name{display:block;position:static;width:auto;max-width:none;opacity:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;clip-path:none}
${TOP}>.side-views>.tab-item:is(:hover,:has(:focus-visible)){background:var(--nav-hover);color:var(--ink)}
${TOP}>.side-views>.tab-item[aria-current],${TOP}>.side-views>.tab-item:has([aria-selected="true"]){background:var(--nav-active);color:var(--ink);font-weight:500}
${TOP}>.side-undo-chip{order:4}

/* The right end: the side's switch, the layout button, the project. */
${TOP}>.titlebar-layout{order:6;flex:none;display:flex;align-items:center;gap:2px;padding:0}
${TOP}>.titlebar-layout::before{content:none}
${TOP} [data-side-toggle][aria-pressed="true"]{background:var(--nav-active);color:var(--ink)}
${TOP}>.titlebar-end{order:8;flex:none;display:flex;align-items:center;gap:8px;margin-left:6px}

/* Split, each sheet carries its own tabs (POLISH-38): the pane's strip stands on the desk and its body is the sheet. The tabs
   start 18px in from the sheet's left edge; the focused sheet's current tab has the accent line, the other's has none. */
${PANE},${PANE}.is-focused{background:transparent;box-shadow:none;overflow:visible}
${PANE}>.tab-pane-body{border-radius:14px;box-shadow:var(--sheet-shadow)}
${PANE_TABS}{--ear-rest:24px;--ear-rise:28px;--ear-foot:4px;height:32px;padding:0 64px 0 0;gap:2px;border-bottom:0;background:transparent;align-items:stretch;overflow:visible}
${PANE_TABS}>.tab-scroll{align-self:stretch;align-items:center;box-sizing:border-box;height:auto;gap:2px;padding:0 10px 0 18px}
${PANE_TABS} .tab-group,${PANE_TABS} .tab-group>.tab-group-pages{align-self:stretch;align-items:center;height:auto;min-height:0;padding:0;gap:2px;border-radius:0;background:none;box-shadow:none}
${PANE_TABS} .tab-plugin-group .tab-group-sep{display:none}
${PANE_TABS} .tab-item{height:var(--ear-rest);border-radius:7px;background-color:transparent;box-shadow:none;color:var(--ink-soft);font-size:12px}
${PANE_TABS} .tab-item:not([data-ear]):hover{background-color:var(--nav-hover);color:var(--ink)}
${PANE_TABS} .tab-item .tab-item-icon{color:currentColor}
${PANE_EAR}{border-radius:9px 9px 0 0}
@media (max-width:760px),(pointer:coarse){
  ${PANE_TABS}{--ear-rest:36px;--ear-rise:40px;height:44px}
}

/* A phone: one row (POLISH-07). The way back, the current tab, 全部标签, ＋, the side's switch and the project; 项目首页 and the
   kept plugins are in the start page (＋) and the other tabs in 全部标签, so a kept glyph is in the row only while its own page is
   the one showing, as the current tab. While the side shows, its view's name stands where the current tab was. The layout button
   is in the row only while the work area is split (the work area hides the title bar's own strip then, tab-workspace.ts): its
   menu is the way to the other panes. Nothing here is an ear: the sheet
   below is the whole window. */
@media (max-width:760px){
  /* The strip's second row is gone, so nothing outside the work area leaves room for one; a pane's own strip keeps its height. */
  html body.immersive-workbench:not(.arrival-page):not([data-pane-embedded]){--tab-strip-h:0px}
  html body.immersive-workbench:not(.arrival-page):not([data-pane-embedded]) .tab-workspace{--tab-strip-h:44px}
  ${TOP}{--dock-btn:44px;--ear-rise:44px;--ear-foot:0px;padding:0 4px;gap:0;flex-wrap:nowrap}
  ${TOP}>.workspace-history{order:0;gap:0;padding:0}
  ${TOP} [data-workspace-history="forward"]{display:none}
  ${TOP}>.dock-pins{flex:none;padding:0;overflow:visible}
  ${TOP}>.dock-pins::after{margin:0 4px}
  ${TOP} .dock-pin{width:44px;height:44px}
  ${TOP}>.dock-pins:not(:has([data-ear])),${TOP} .dock-pin:not([data-ear]){display:none}
  /* The current piece is a 36px chip drawn inside a 44px target. */
  ${TOP_EAR}{position:relative;isolation:isolate;height:44px;padding-bottom:0;border-radius:0;background-color:transparent;filter:none}
  ${TOP_FOCUSED}{background-image:none}
  ${TOP_EAR}::before{content:"";inset:4px 0;z-index:-1;width:auto;height:auto;border-radius:8px;background:var(--control-fill)}
  ${TOP_EAR}::after{content:none}
  /* A row that cannot hold it all scrolls rather than clips; the current tab keeps 98px (07-1 S3). */
  ${TABS}{flex:1 1 0;min-width:0;min-height:44px;margin-right:0;overflow:auto hidden}
  /* !important over the width the strip's script writes on the scroll box (tab-workspace-strip.ts shares the room on a desk). */
  ${TABS}>.tab-scroll{flex:0 1 auto;min-width:auto;width:auto!important;padding:0;overflow:visible;mask-image:none}
  ${TABS} .tab-group:not(:has([data-ear])){display:none}
  ${TABS} .tab-group,${TABS} .tab-group>.tab-group-pages{flex:0 1 auto;min-width:auto}
  ${TABS} .tab-item{height:36px}
  ${TABS} .tab-item:not([data-ear]),${TABS}:has(>.tab-view-chip.is-exclusive) .tab-scroll,${TABS}:has(>.tab-view-chip.is-exclusive) .tab-all-button,${TABS} .tab-plugin-group::before{display:none}
  /* Only the current tab is drawn, so no group needs the room before its hairline; !important over the desk's rule, which reads
     what comes before the group and so outweighs any plain selector here. */
  ${TABS} .tab-plugin-group{padding-left:0!important}
  /* A pinned tab stays its glyph, 44px. */
  ${TABS} .tab-item[data-ear]:not([data-pinned]){flex:0 1 auto;min-width:98px;max-width:100%}
  /* The cover's chip gives its name the room: no margin, and the close mark's 44px is its right end. */
  ${TABS}>.tab-view-chip.is-exclusive{flex:0 1 auto;min-width:52px;height:36px;margin:0;padding:0 0 0 8px;gap:4px;background-color:var(--control-fill);box-shadow:none}
  ${TABS}>.tab-view-chip.is-exclusive>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
  /* The close mark is a 44px target on the 36px chip. */
  ${TABS}>.tab-view-chip .tab-view-chip-close{width:44px;height:44px;margin-block:-4px}
  ${TABS}>.tab-all-button{flex:none;min-width:44px;min-height:44px}
  ${TOP} .plugin-picker-trigger{width:44px;height:44px}
  ${TOP}>.desktop-titlebar-drag,${TOP}>[data-titlebar-tabs]:not([hidden])~.titlebar-layout [data-layout-open]{display:none}
  ${TOP}>.titlebar-layout{gap:0;margin-left:auto}
  ${TOP}>.titlebar-layout .mw-btn{width:44px;height:44px;min-width:44px}
  ${TOP}>.titlebar-end{margin-left:0;gap:0}
  ${TOP}>.titlebar-end>.workspace-chrome{margin-left:0}
  ${sideOpen(TABS)},${sideOpen(TOP)} .dock-pin:not(.is-fixed){display:none}
  ${TOP}>.side-ear{order:1;position:relative;left:auto;bottom:auto;flex:0 1 auto;min-width:0;max-width:none;margin-right:auto}
  ${TOP}>.side-ear>.side-ear-name{flex:0 1 auto}
  /* !important over the left the list's script writes under the side's name (side-panel.ts): here it runs the window's width. */
  ${TOP}>.side-views{left:8px!important;right:8px;max-width:none}
  ${TOP}>.side-views>.tab-item{height:44px}
}
/* Under 340px the row gives up its side margins and its hairline and the current tab is its 98px, no wider: the 44px targets,
   the tab and 全部标签 are the whole 320 (07-1 S3). */
@media (max-width:340px){
  ${TOP}{padding:0}
  ${TOP}>.dock-pins::after{content:none}
  ${TABS} .tab-item[data-ear]:not([data-pinned]){flex:none;width:98px}
  ${TABS}>.tab-view-chip.is-exclusive>svg{display:none}
}
/* A page with a directory gets its drawer's button before the project, as the foot had it. That is one 44px target more, so
   there the current tab gives up its 98px and narrows to its glyph and the first of its name: 全部标签 stays in the row. */
@media (max-width:600px){
  html body .immersive-workspace:not(.is-plugin-directory-empty) .workbench-header[data-dock][data-dock][data-dock]>.tab-strip .tab-item[data-ear]:not([data-pinned]){flex:0 1 auto;width:auto;min-width:52px}
  ${SHELL} .immersive-workspace:not(.is-plugin-directory-empty) .workbench-header .titlebar-end .immersive-show-directory,
  /* The design system hides the strip's directory buttons with !important (craft-finish-assistant.ts): only !important shows one again. */
  ${SHELL} .is-directory-drawer-open .workbench-header .titlebar-end .navigator-directory-toggle{display:inline-grid!important;place-items:center;order:-1;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border:0;background:transparent;box-shadow:none;color:var(--ink-soft)}
  ${SHELL} .immersive-workspace.is-directory-drawer-open .workbench-header .titlebar-end .immersive-show-directory{display:none!important}
}
@media (pointer:coarse) and (min-width:761px){
  ${TOP}{--dock-btn:44px}
  ${TOP} .dock-pin{width:44px;height:44px}
  ${TOP} .dock-pin[data-ear]{height:44px;padding-bottom:0}
  ${TOP} .plugin-picker-trigger{width:44px;height:44px}
  ${TOP}>.side-views>.tab-item{height:44px}
  ${TABS}>.tab-view-chip .tab-view-chip-close{width:44px;height:44px;margin:-8px 0}
}
`;
/** The sheet as the page gets it: the notes above are for whoever reads this file. */
export const TOP_STRIP_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\/\s*/g, "");
