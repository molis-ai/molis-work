/**
 * The top strip as 方案 C「纸上的页签」 draws it (specs/screen-polish §3, §10; mock docs/design/screen-polish, screens 12–14).
 *
 * The strip holds tabs and nothing else. The current tab is an ear grown on its sheet: paper-coloured, joined to the sheet below
 * with two concave corners, and, while its column has the focus, a 2px accent line on top. Every other tab is words on the desk.
 * The first place, 「项目 › 项目主页」 with ⌂ in it (§4「底栏第十三版」第 1 条; mock helm.html, screen 34), is the one fixed piece,
 * before a hairline; it is the project home's tab, so the strip draws no second one, and its list changes the project. Any
 * plugin is reached from ＋ or ⌘K, and its own page is a tab; the start page hangs under ＋ (POLISH-04). A cover (settings, the market) is a tab like the others, after them, with its whole name and its close
 * (POLISH-06). Over the side sheet stands the name of the view it shows; it opens the list of the side's views. The right end
 * holds two controls from 960px (the side's switch and the layout button; POLISH-05, POLISH-71) and keeps the project button
 * narrower. A phone has one row (POLISH-07): the first place (its ⌂ alone while a tab is current), the current tab (the side
 * view's name while the side shows), 全部标签, ＋, the side's switch, the project.
 *
 * These rules follow the work line's in the page (page-assets.ts), so they are the last word on the strip. Standard CSS nesting
 * (`&`) keeps the exact selector specificity without repeating the 60-byte strip prefix on every rule.
 */
/** The shell outside a pane and the component board's real-bar specimen, as the design system's own rules name it. */
const SHELL = "html :is(body.immersive-workbench:not([data-pane-embedded]),.mw-catalog-bar-stage)";
/** The strip. Its mark is written three times so that these rules weigh what the strip's earlier rules weigh (0,4,2). An
 * embedded pane's page needs no `:not([data-pane-embedded])` here: it does not draw the title bar at all (tab-workspace.ts). */
const TOP = "html body .workbench-header[data-dock][data-dock][data-dock]";
const HOVER = "var(--dur-hover) var(--ease-quint)";
/** A pane's own strip, where the work area is split: each sheet carries its tabs. */
const PANE = "html body.immersive-workbench:not([data-pane-embedded]) .tab-workspace[data-split] .tab-workspace-panes>.tab-pane";
const SIDE_OPEN_TOP = "html:has(>body[data-side-open=true]) body .workbench-header[data-dock][data-dock][data-dock]";
/** Shared declarations for an ear (top strip and split pane) and its focused accent line. */
const EAR_BASE = "align-self:flex-end;box-sizing:border-box;height:var(--ear-rise);padding-bottom:var(--ear-foot);border-radius:10px 10px 0 0;background-color:var(--paper);box-shadow:none;color:var(--ink);font-weight:500;transform:none;filter:drop-shadow(0 -1px 1.5px color-mix(in srgb,var(--shadow-color) 9%,transparent))";
const EAR_CORNERS = `&::before,&::after{content:"";display:block;position:absolute;bottom:0;width:10px;height:10px;pointer-events:none}&::before{right:100%;background:radial-gradient(circle at 0 0,transparent 9.5px,var(--paper) 10px)}&::after{left:100%;background:radial-gradient(circle at 100% 0,transparent 9.5px,var(--paper) 10px)}`;
const FOCUS_LINE = "background-image:linear-gradient(var(--accent),var(--accent));background-size:calc(100% - 22px) 2px;background-position:50% 0;background-repeat:no-repeat";

const SHEET = `
@media (min-width:761px){html body.immersive-workbench:not(.arrival-page){--desktop-titlebar-height:44px}}
@keyframes top-strip-shown{to{visibility:visible}}

${TOP}{
  position:relative;gap:2px;padding:0 var(--sheet-inset,14px) 0 8px;--dock-btn:28px;--ear-rest:28px;--ear-rise:36px;--ear-foot:calc((var(--desktop-titlebar-height,44px) - var(--ear-rest))/2);
  /* 项目首页's glyph is drawn by the page's script after the first paint: hold unseen until drawn so the strip does not jump (VUX-31). */
  &:not([data-dock-drawn])>:not(.workspace-history){visibility:hidden;animation:top-strip-shown 0s forwards;animation-delay:3s}

  /* The first place, 「项目 › 项目主页」 (§4「底栏第十三版」第 1 条), then a hairline. */
  &>.dock-pins{order:1;align-self:stretch;flex:0 1 auto;min-width:0;display:flex;align-items:center;height:auto;margin:0;padding:0 0 0 10px;gap:2px;border-radius:0;background:none;box-shadow:none}
  &>.dock-pins::before,&>.plugin-picker::after{content:none}
  &>.dock-pins::after{content:"";flex:none;width:1px;height:16px;margin:0 0 0 8px;background:var(--line-strong)}
  & .top-corner{display:contents}
  & .top-corner-cell{flex:0 1 auto;min-width:0;display:inline-flex;align-items:center;gap:6px;max-width:min(360px,36vw);height:var(--ear-rest);padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--ink-soft);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
  & .top-corner-cell:not([data-ear]):is(:hover,[aria-expanded="true"]){background:var(--nav-hover);color:var(--ink)}
  & .top-corner-cell>svg{flex:none;width:12px;height:12px;color:var(--faint)}
  & .top-corner-cell>svg:first-child{width:16px;height:16px;color:currentColor}
  & .top-corner-project-name{flex:0 1 auto;min-width:0;max-width:180px;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}
  & .top-corner-page-name{flex:none;color:var(--ink);font-weight:500}
  /* How many wait for the person (POLISH-15): amber, only while something waits; the Assistant's bell reads the same number. */
  & .top-corner-count{flex:none;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:var(--amber-soft);color:var(--amber);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
  & .top-corner-count[hidden]{display:none}
  & .top-corner-list{position:absolute;top:calc(100% - 2px);left:8px;z-index:60;display:grid;grid-template-columns:200px 280px;max-width:calc(100vw - 16px);max-height:min(520px,calc(100dvh - 80px));border:1px solid var(--line);border-radius:14px;background:var(--popover);box-shadow:var(--lift-3);overflow:hidden;animation:craft-fade-in var(--dur-hover) var(--ease-quint) both}
  & .top-corner-list[hidden]{display:none}
  & .top-corner-projects{display:flex;flex-direction:column;min-height:0;padding:8px;border-right:1px solid var(--line);background:var(--desk)}
  & .top-corner-right{min-height:0;padding:8px;overflow:auto}
  & .top-corner-head{display:flex;align-items:baseline;gap:8px;margin:2px 8px 6px;color:var(--muted);font-size:11px}
  & .top-corner-head>strong{color:var(--ink);font-size:12px;font-weight:500}
  & .top-corner-rows{display:grid;gap:2px;min-height:0;overflow:auto}
  & :is(.top-corner-project,.top-corner-page){display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--ink);font:inherit;font-size:13px;text-align:left;text-decoration:none;cursor:pointer}
  & :is(.top-corner-project,.top-corner-page):hover{background:var(--nav-hover)}
  & :is(.top-corner-project[aria-pressed="true"],.top-corner-page[aria-current]){background:var(--nav-active)}
  & :is(.top-corner-project,.top-corner-page)>svg{flex:none;width:14px;height:14px;color:var(--ink-soft)}
  & :is(.top-corner-project,.top-corner-page)>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  & .top-corner-project>small{color:var(--muted);font-size:11px}
  & .top-corner-foot{display:flex;flex-direction:column;margin-top:auto;padding-top:6px;border-top:1px solid var(--line)}
  & .top-corner-manage{display:flex;align-items:center;gap:8px;min-height:32px;box-sizing:border-box;padding:6px 8px;border-radius:8px;color:var(--muted);font-size:12px;text-decoration:none}
  & .top-corner-manage>svg{flex:none;width:14px;height:14px}
  & .top-corner-manage:hover{background:var(--nav-hover);color:var(--ink)}

  /* The tabs take what they need and ＋ follows them (POLISH-03). */
  &>.tab-strip{
    order:1;align-self:stretch;flex:0 1000 var(--tabs-hug,0px);min-width:clamp(2px,var(--tabs-hug,2px),140px);height:auto;margin-right:0;padding:0;gap:2px;
    &:not(:has(.tab-item,.tab-view-chip,.tab-strip-button:not([hidden]),[data-tab-reorder-slot])),&>.tab-strip-spacer{display:none}
    &>.tab-scroll{align-self:stretch;align-items:center;box-sizing:border-box;height:auto;gap:2px;padding:0 6px 0 10px}
    & .tab-item{height:var(--ear-rest);border-radius:8px;background-color:transparent;box-shadow:none;color:var(--ink-soft);font-size:12px}
    & .tab-item:not([data-ear]):hover{background-color:var(--nav-hover);color:var(--ink)}
    & .tab-item .tab-item-icon{color:currentColor}
    /* One plugin's tabs stand together with no ground of their own; a hairline parts them from the tabs before. */
    & .tab-group{align-self:stretch;align-items:center;height:auto;min-height:0}
    & .tab-group>.tab-group-pages{align-self:stretch;align-items:center;height:auto;min-height:0;gap:2px}
    & .tab-plugin-group{padding:0;border-radius:0;background:none;box-shadow:none}
    & .tab-plugin-group .tab-group-sep{display:none}
    & .tab-scroll>:is(.tab-item,.tab-group)~.tab-plugin-group{position:relative;padding-left:11px}
    & .tab-scroll>:is(.tab-item,.tab-group)~.tab-plugin-group::before{content:"";position:absolute;left:5px;top:50%;width:1px;height:14px;translate:0 -50%;background:var(--line-strong)}
    & .tab-plugin-group:has([data-ear])::before,& .tab-plugin-group:has([data-ear])+.tab-plugin-group::before{opacity:0}
    & .tab-group[data-pinned-group]{padding:0;background:none;box-shadow:none}
    /* A cover's tab: after the others, never narrowed, with its whole name and its close (POLISH-06). */
    &>.tab-view-chip.is-exclusive{flex:none;display:inline-flex;align-items:center;gap:6px;height:var(--ear-rest);margin:0 10px 0 0;padding:0 6px 0 10px;border-radius:8px;background:var(--paper);box-shadow:var(--lift-1);color:var(--ink);font-size:12px;font-weight:500;cursor:default}
    &>.tab-view-chip.is-exclusive>span{white-space:nowrap}
    &>.tab-view-chip.is-exclusive>svg{width:14px;height:14px;color:var(--accent)}
    &>.tab-view-chip .tab-view-chip-close{flex:none;display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--ink-soft);cursor:pointer}
    &>.tab-view-chip .tab-view-chip-close:hover{background:var(--nav-active);color:var(--ink)}
    &>.tab-view-chip .tab-view-chip-close svg{width:12px;height:12px}
    /* The titlebar's tab strip has no ＋ of its own: ＋ is the start page's, right after it. */
    & .tab-add-button{display:none}
  }

  /* An ear: paper, joined to the sheet by a concave corner on each side. Follows .top-corner-cell and .tab-item so equal specificity wins. */
  & :is(.tab-item,.top-corner-cell,.side-ear)[data-ear]{${EAR_BASE};${EAR_CORNERS}}
  & :is(.tab-item,.top-corner-cell)[data-ear]{position:relative}
  /* Without the focus the ear stays its sheet's paper. */
  &>.tab-strip[data-unfocused] .tab-item[data-ear]{background:var(--paper)}
  &>:not([data-unfocused]) [data-ear],&>.side-ear:not([data-unfocused]){${FOCUS_LINE}}
  &>:not([data-unfocused]) [data-ear] .tab-item-icon,&>.dock-pins:not([data-unfocused]) [data-ear]>svg:first-child,&>.side-ear:not([data-unfocused]) .side-ear-glyph svg{color:var(--accent)}

  /* ＋ opens the start page: a plain glyph after the last tab (POLISH-04). */
  &>.plugin-picker{order:2;position:static;flex:none;max-width:none;margin-left:0;padding:0}
  & .plugin-picker-trigger{justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--ink-soft)}
  & .plugin-picker-trigger:hover{background:var(--nav-hover);color:var(--ink)}
  & .plugin-picker-trigger[aria-expanded="true"]{background:var(--nav-active);color:var(--ink)}
  & .plugin-picker-trigger>svg{width:14px;height:14px}
  & .plugin-picker-current{display:none}
  & .plugin-picker-popover{
    left:var(--start-left,8px);right:auto;width:min(560px,calc(100vw - 16px));
    &:not([hidden]){animation:craft-fade-in var(--dur-hover) var(--ease-quint) both}
    & .plugin-rail-items{grid-template-columns:minmax(0,1fr)}
    & .plugin-rail-items .plugin-rail-item[data-rail-zone]{grid-template-columns:16px minmax(0,max-content) minmax(0,1fr) auto;grid-template-rows:auto}
    & .plugin-rail-items .plugin-rail-item[data-rail-zone]>:is(.plugin-rail-where,kbd){grid-column:4}
    & .plugin-rail-item :is(.plugin-rail-hint,.plugin-rail-confirm){grid-column:3;grid-row:1}
    & .plugin-rail-item .plugin-rail-hint{opacity:0;transition:opacity ${HOVER}}
    & :is(.plugin-rail-tile:not(.is-confirming):is(:hover,:focus-within),.plugin-rail-items>.plugin-rail-item:is(:hover,:focus-visible)) .plugin-rail-hint{opacity:1}
    @media (hover:none),(pointer:coarse){& :is(.plugin-rail-tile:not(.is-confirming),.plugin-rail-items>.plugin-rail-item) .plugin-rail-hint{opacity:1}}
  }
  &>.desktop-titlebar-drag{order:3;flex:1 1 0;width:auto;min-width:0}

  /* The side sheet's own tab: the view it shows, by name, 18px in from the sheet's left edge. */
  &>.side-ear{order:4;position:absolute;bottom:0;left:calc(100% - var(--sheet-inset,14px) - var(--side-panel-width,35vw) + 18px);display:inline-flex;align-items:center;gap:6px;max-width:min(210px,var(--side-panel-width,35vw) - 150px);padding-inline:10px 8px;border:0;font:inherit;font-size:12px;cursor:pointer}
  &>.side-ear[hidden]{display:none}
  &>.side-ear>.side-ear-glyph{display:inline-grid;flex:none}
  &>.side-ear svg{flex:none;width:14px;height:14px;color:var(--ink-soft)}
  &>.side-ear>svg:last-child{width:12px;height:12px}
  &>.side-ear>.side-ear-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* The side's views, as the list that opens from that name. */
  &>.side-views{
    order:4;position:absolute;top:calc(100% - 2px);z-index:30;display:flex;flex-direction:column;align-items:stretch;gap:1px;min-width:200px;max-width:min(320px,100vw - 16px);max-height:min(420px,100dvh - var(--dock-h,76px) - 52px);margin:0;padding:4px;overflow:hidden auto;border-radius:12px;background:var(--paper);box-shadow:var(--lift-3);animation:craft-fade-in var(--dur-hover) var(--ease-quint) both;
    &[hidden]{display:none}
    &>.tab-item{flex:none;width:auto;max-width:none;height:32px;padding:0;border-radius:8px;background:transparent;box-shadow:none;color:var(--ink-soft)}
    &>.tab-item:has(>[role=tab]:is([hidden],[data-side-closed])){display:none}
    &>.tab-item>.tab-item-trigger{flex:1 1 auto;display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:100%;padding:0 10px;font-size:13px}
    &>.tab-item .tab-item-name{display:block;position:static;width:auto;max-width:none;opacity:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;clip-path:none}
    &>.tab-item:is(:hover,:has(:focus-visible)){background:var(--nav-hover);color:var(--ink)}
    &>.tab-item[aria-current],&>.tab-item:has([aria-selected="true"]){background:var(--nav-active);color:var(--ink);font-weight:500}
  }
  &>.side-undo-chip{order:4}

  /* The right end: the side's switch, the layout button, the project (<960px). */
  &>.titlebar-layout{order:6;flex:none;display:flex;align-items:center;gap:2px;padding:0}
  &>.titlebar-layout::before{content:none}
  & [data-side-toggle][aria-pressed="true"]{background:var(--nav-active);color:var(--ink)}
  &>.titlebar-end{order:8;flex:none;display:flex;align-items:center;gap:8px;margin-left:6px}
}
@media (pointer:fine){${TOP} .plugin-picker-popover .plugin-rail-items .plugin-rail-item[data-rail-zone]{min-height:36px}}
@media (min-width:761px){
  ${SIDE_OPEN_TOP}>.desktop-titlebar-drag{flex-basis:calc(var(--side-panel-width,35vw) - 76px);flex-shrink:0}
}
@media (min-width:761px) and (max-width:959px){
  ${SIDE_OPEN_TOP}>.desktop-titlebar-drag{flex-basis:calc(var(--side-panel-width,35vw) - 114px)}
}
@media (min-width:960px){${TOP}>.titlebar-end{display:none}}

/* Split, each sheet carries its own tabs (POLISH-38): the pane's strip stands on the desk and its body is the sheet. */
${PANE}{
  &, &.is-focused{background:transparent;box-shadow:none;overflow:visible}
  &>.tab-pane-body{border-radius:14px;box-shadow:var(--sheet-shadow)}
  &>.tab-strip{
    --ear-rest:24px;--ear-rise:28px;--ear-foot:4px;height:32px;padding:0 64px 0 0;gap:2px;border-bottom:0;background:transparent;align-items:stretch;overflow:visible;
    &>.tab-scroll{align-self:stretch;align-items:center;box-sizing:border-box;height:auto;gap:2px;padding:0 10px 0 18px}
    & .tab-group,& .tab-group>.tab-group-pages{align-self:stretch;align-items:center;height:auto;min-height:0;padding:0;gap:2px;border-radius:0;background:none;box-shadow:none}
    & .tab-plugin-group .tab-group-sep{display:none}
    & .tab-item{height:var(--ear-rest);border-radius:7px;background-color:transparent;box-shadow:none;color:var(--ink-soft);font-size:12px}
    & .tab-item:not([data-ear]):hover{background-color:var(--nav-hover);color:var(--ink)}
    & .tab-item .tab-item-icon{color:currentColor}
    & .tab-item[data-ear]{position:relative;${EAR_BASE};border-radius:9px 9px 0 0;${EAR_CORNERS}}
    &:not([data-unfocused]) [data-ear]{${FOCUS_LINE}}
    &:not([data-unfocused]) [data-ear] .tab-item-icon{color:var(--accent)}
  }
}
@media (max-width:760px),(pointer:coarse){
  ${PANE}>.tab-strip{--ear-rest:36px;--ear-rise:40px;height:44px}
}

/* A phone: one row (POLISH-07). */
@media (max-width:760px){
  html body.immersive-workbench:not(.arrival-page):not([data-pane-embedded]){--tab-strip-h:0px}
  html body.immersive-workbench:not(.arrival-page):not([data-pane-embedded]) .tab-workspace{--tab-strip-h:44px}
  ${TOP}{
    --dock-btn:44px;--ear-rise:44px;--ear-foot:0px;padding:0 4px;gap:0;flex-wrap:nowrap;
    &>.workspace-history{order:0;gap:0;padding:0}
    & [data-workspace-history="forward"]{display:none}
    &>.dock-pins{position:static;flex:none;padding:0;overflow:visible}
    &>.dock-pins::after{margin:0 4px}
    & .top-corner-cell{height:44px;padding:0 8px}
    & .top-corner-project-name{max-width:96px}
    & .top-corner-list{right:8px;grid-template-columns:minmax(0,2fr) minmax(0,3fr)}
    & :is(.top-corner-project,.top-corner-page){height:44px}
    & .top-corner-manage{display:flex;align-items:center;min-height:44px;padding-block:0}
    /* The current piece is a 36px chip drawn inside a 44px target. */
    & :is(.tab-item,.top-corner-cell,.side-ear)[data-ear]{position:relative;isolation:isolate;height:44px;padding-bottom:0;border-radius:0;background-color:transparent;filter:none}
    &>:not([data-unfocused]) [data-ear],&>.side-ear:not([data-unfocused]){background-image:none}
    & :is(.tab-item,.top-corner-cell,.side-ear)[data-ear]::before{content:"";inset:4px 0;z-index:-1;width:auto;height:auto;border-radius:8px;background:var(--control-fill)}
    & :is(.tab-item,.top-corner-cell,.side-ear)[data-ear]::after{content:none}
    &>.tab-strip{
      flex:1 1 0;min-width:0;min-height:44px;margin-right:0;overflow:auto hidden;
      &>.tab-scroll{flex:0 1 auto;min-width:0;width:auto!important;padding:0;overflow:visible;mask-image:none}
      & .tab-group:not(:has([data-ear])){display:none}
      & .tab-group,& .tab-group>.tab-group-pages{flex:0 1 auto;min-width:0}
      & .tab-item{height:36px}
      & .tab-item:not([data-ear]),&:has(>.tab-view-chip.is-exclusive) .tab-scroll,&:has(>.tab-view-chip.is-exclusive) .tab-all-button,& .tab-plugin-group::before{display:none}
      & .tab-plugin-group{padding-left:0!important}
      & .tab-item[data-ear]:not([data-pinned]){flex:0 1 auto;min-width:98px;max-width:100%}
      &>.tab-view-chip.is-exclusive{flex:0 1 auto;min-width:52px;height:36px;margin:0;padding:0 0 0 8px;gap:4px;background-color:var(--control-fill);box-shadow:none}
      &>.tab-view-chip.is-exclusive>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
      &>.tab-view-chip .tab-view-chip-close{width:44px;height:44px;margin-block:-4px}
      &>.tab-all-button{flex:none;min-width:44px;min-height:44px}
    }
    & .plugin-picker-trigger{width:44px;height:44px}
    &>.desktop-titlebar-drag,&>[data-titlebar-tabs]:not([hidden])~.titlebar-layout [data-layout-open]{display:none}
    &>.titlebar-layout{gap:0;margin-left:auto}
    &>.titlebar-layout .mw-btn{width:44px;height:44px;min-width:44px}
    &>.titlebar-end{margin-left:0;gap:0}
    &>.titlebar-end>.workspace-chrome{margin-left:0}
    &>.side-ear{order:1;position:relative;left:auto;bottom:auto;flex:0 1 auto;min-width:0;max-width:none;margin-right:auto}
    &>.side-ear>.side-ear-name{flex:0 1 auto}
    &>.side-views{left:8px!important;right:8px;max-width:none}
    &>.side-views>.tab-item{height:44px}
  }
  ${SIDE_OPEN_TOP}>.tab-strip{display:none}
}
/* At 540px and under the first place names the page alone, and its list is two parts, the projects above (§4 第 6 条). */
@media (max-width:540px){
  ${TOP}{
    &>.workspace-history{display:none}
    & .top-corner-project-name,& .top-corner-cell>svg:nth-of-type(2){display:none}
    & .top-corner-list{grid-template-columns:minmax(0,1fr)}
    & .top-corner-projects{border-right:0;border-bottom:1px solid var(--line)}
    /* While another page shows, the current tab names it: the place is its ⌂ alone (plus any amber waiting count), at least a 44px target. */
    & .top-corner-cell:not([aria-current]){justify-content:center;min-width:44px;padding:0 6px;gap:4px}
    & .top-corner-cell:not([aria-current])>:not(svg:first-child,.top-corner-count){display:none}
  }
}
/* Under 340px the row gives up its side margins and its hairline and the current tab is its 98px (07-1 S3). */
@media (max-width:340px){
  ${TOP}{
    padding:0;
    &>.dock-pins::after{content:none}
    &>.tab-strip .tab-item[data-ear]:not([data-pinned]){flex:none;width:98px}
    &>.tab-strip>.tab-view-chip.is-exclusive>svg{display:none}
  }
}
/* A page with a directory gets its drawer's button before the project, as the foot had it. */
@media (max-width:600px){
  html body .immersive-workspace:not(.is-plugin-directory-empty) .workbench-header[data-dock][data-dock][data-dock]>.tab-strip .tab-item[data-ear]:not([data-pinned]){flex:0 1 auto;width:auto;min-width:52px}
  ${SHELL} .immersive-workspace:not(.is-plugin-directory-empty) .workbench-header .titlebar-end .immersive-show-directory,
  ${SHELL} .is-directory-drawer-open .workbench-header .titlebar-end .navigator-directory-toggle{display:inline-grid!important;place-items:center;order:-1;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border:0;background:transparent;box-shadow:none;color:var(--ink-soft)}
  ${SHELL} .immersive-workspace.is-directory-drawer-open .workbench-header .titlebar-end .immersive-show-directory{display:none!important}
}
@media (pointer:coarse) and (min-width:761px){
  ${TOP}{
    --dock-btn:44px;
    & .top-corner-cell{height:44px}
    & .top-corner-cell[data-ear]{height:44px;padding-bottom:0}
    & :is(.top-corner-project,.top-corner-page){height:44px}
    & .top-corner-manage{display:flex;align-items:center;min-height:44px;padding-block:0}
    & .plugin-picker-trigger{width:44px;height:44px}
    &>.side-views>.tab-item{height:44px}
    &>.tab-strip>.tab-view-chip .tab-view-chip-close{width:44px;height:44px;margin:-8px 0}
  }
}
`;
/** The sheet as the page gets it: comments and source indentation stay in source. */
export const TOP_STRIP_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\/\s*/g, "").replace(/\n\s*/g, "");
