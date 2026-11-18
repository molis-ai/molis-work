import { TASK_FLOAT_STYLES } from "./task-float.js";
/**
 * The work line's parts as the first slice settled them (docs/design/work-line-32, scheme E, user 2026-11-14; specs/work-line
 * §4, §10, §12), drawn on the component board first (`/__ui/catalog/navigation?sheet=work-line`) so the slices that move the
 * product onto them use these rules as they are (the way styles/workbench-navigation.ts went first for 07-1).
 *
 * What is new: the line itself (two wings, the head, an event capsule in its states) and what the Assistant's dialog
 * gains: the background-task mark at its top right, the task panel that floats beside it, the placement row and the
 * "handed back by a task" mark around a reply, the event card that heads an event's tab, and the one reply (or just the mark)
 * left above the composer when the dialog is closed. The dialog, its tab bar and its messages stay the product's own
 * (design-system craft-finish-assistant.ts); so do the composer's "send to" (its receiver tag) and the strip of what goes
 * with the next message (`.assistant-context-strip`), which the hand adds to.
 *
 * Every class starts with `work-`, so the rules are written bare and cannot meet a plugin's or the shell's own names; the
 * rules that have to win over an existing `body.immersive-workbench` rule (the dialog's tabs) carry that prefix. Where a part
 * sits (a wing at its end, the task panel beside the dialog) is set by browser/work-line-layout.ts through the attributes and
 * properties named here. Written without spaces after `:` and `;`, since the host only strips comments and indentation.
 */
const W = "body.immersive-workbench";
/** The shell outside a pane and the component board's real-bar specimen, as the design system's own rules name it. */
const SHELL = "html :is(body.immersive-workbench:not([data-pane-embedded]),.mw-catalog-bar-stage)";
const TOP = `${SHELL} .workbench-header[data-dock]`;
const HOVER = "var(--dur-hover) var(--ease-quint)";
const MOVE = "var(--dur-move) var(--ease-quint)";
const ELLIPSIS = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
const PRESSABLE = ":is(.work-line-head,.work-line-earlier,.work-event,.work-task-mark)";
/** An event whose note is a detail (a step, a due time): dropped where the line is short. One that needs attention keeps its note. */
const QUIET = ".work-event:not([data-attn],[aria-current])";
const BUTTON_GROUNDS = ":is(.work-reply-placed,.work-reply-waiting,.work-reply-actions,.work-task-row,.work-task-banner,.work-task-facts,.work-card-actions)";
const ANIMATED = ":is(.work-event[data-fresh],.work-task-panel,.work-reply-placed,.work-reply-waiting[data-waiting=\"open\"],.work-reply-peek,.work-reply-mini)";

const SHEET = `
/* The shell around the line (WLN-16). The bottom is the line and nothing else; the plugins chosen to stay, the start page's ＋,
   the person's own plugins and the project stand in the top strip, which is 44px tall for them. */
@media (min-width:761px){html body.immersive-workbench:not(.arrival-page){--desktop-titlebar-height:44px}}
${SHELL} .workbench-bar[data-work-bar]{display:block}
${TOP}{position:relative;gap:6px;padding:0 var(--sheet-inset,14px) 0 8px;--dock-btn:30px}
${TOP}>.dock-pins{order:1;flex:0 1 auto;height:36px;margin:0 2px;padding:3px;gap:2px;border-radius:calc(var(--r-control,8px) + 3px);background:color-mix(in srgb,var(--ink) 4%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 6%,transparent)}
${TOP}>.dock-pins::before,${TOP} .dock-pin[aria-current]::after,${TOP}>.plugin-picker::after{content:none}
${TOP} .dock-pin{border-radius:var(--r-control,8px)}
${TOP} .dock-pin:hover{transform:none}
${TOP} .dock-pin svg{width:16px;height:16px}
.dock-pin-name{display:none}
${TOP} .dock-pin[aria-current]{display:inline-flex;align-items:center;gap:6px;width:auto;max-width:160px;padding:0 10px 0 8px;font:inherit;font-size:12px;font-weight:500}
${TOP} .dock-pin[aria-current]>.dock-pin-name{display:block;${ELLIPSIS}}
${TOP} .dock-pin.is-fixed{flex:none;margin-right:0}
${TOP} .dock-pin.is-fixed::before{content:none}
/* The kept plugins are this browser's choice, so the page's script draws them, and names the current one, after the first paint:
   until it has, what they would push along is held unseen, so the strip is not laid out a second way while it loads (VUX-31).
   Should the script never get there, the strip shows anyway. */
${TOP}:not([data-dock-drawn])>:not(.workspace-history){visibility:hidden;animation:work-strip-shown 0s forwards;animation-delay:3s}
@keyframes work-strip-shown{to{visibility:visible}}
/* The tabs take what they need and ＋ follows them; the strip's own ＋ (a list of plugins to open) is the start page now.
   What they need is written by the script that shares their widths (--tabs-hug: every tab at its own width; --tabs-floor:
   every tab at its narrowest), so the strip's box never hangs on the widths that script then gives the tabs. Where the strip
   runs short the tabs narrow first, down to that floor while it leaves the rest of the strip 500px (the right side's glyphs slide in what is left); then the kept plugins
   fold; then the tabs slide. Until the script has measured, the strip starts at its floor (0px, held at 120px), where an empty
   or one-tab strip ends up, so the first paint does not lay the bar out a second way (VUX-31). */
${TOP}>[data-titlebar-tabs]{flex:0 1000 var(--tabs-hug,0px);min-width:clamp(120px,var(--tabs-floor,120px),100% - 500px)}
/* The right side's glyphs line up over the side panel while there is room; where the strip runs short they slide in their own box (down to one glyph) before anything is pushed off the window. */
${TOP}>.side-strip{flex:0 1 auto;min-width:var(--dock-btn,32px);overflow-x:auto;justify-content:safe flex-end}
@media (min-width:761px){body[data-side-open=true] ${TOP}>.side-strip{flex-basis:calc(var(--side-panel-width,35vw) + var(--sheet-inset,14px) - 8px);min-width:var(--dock-btn,32px)}}
${TOP}>.desktop-titlebar-drag{flex:1 1 0;width:auto;min-width:0}
${TOP} .tab-add-button{display:none}
${TOP}>.plugin-picker{order:2;position:static;flex:none;max-width:none;padding:0}
${TOP} .plugin-picker-trigger{justify-content:center;width:28px;height:28px;padding:0;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper)}
${TOP} .plugin-picker-trigger>svg{width:14px;height:14px}
${TOP} .plugin-picker-trigger[aria-expanded="true"]>svg{transform:rotate(45deg)}
${TOP} .plugin-picker-current{display:none}
${TOP} .plugin-picker-popover:not([hidden]){animation:craft-fade-in var(--dur-hover) var(--ease-quint) both}
${TOP}>.bar-own{order:5;height:36px;gap:2px}
${TOP}>.titlebar-end{order:8;flex:none;display:flex;align-items:center;gap:8px;margin-left:2px}
/* A phone: two rows and never more, in the order a wide window reads them. The first is the way back, the kept plugins (glyphs
   alone, no tray: they take what the row has left and fold into +N, down to 项目首页 alone on the narrowest), the right side's glyphs (all of them from 601px; two at 600px and under, the rest
   slide), the layout button and the project. The second is the tab strip as a phone draws it (the switch, the current tab,
   全部标签; 52px, VUX-31), ＋ and the person's own plugins, which fold into their own +N. The break between the rows is the strip's own. */
@media (max-width:760px){
  ${TOP}{--dock-btn:44px;padding:0 4px;gap:0}
  ${TOP}::before{content:"";order:4;flex:0 0 100%;height:0}
  ${TOP}>.workspace-history{order:0;gap:0;padding:0}
  ${TOP}>.dock-pins{order:1;flex:1 1 0;min-width:var(--dock-btn);height:44px;margin:0;padding:0;gap:0;overflow:hidden;background:none;box-shadow:none}
  ${TOP} .dock-pin[aria-current]{width:var(--dock-btn);padding:0;justify-content:center}
  ${TOP} .dock-pin[aria-current]>.dock-pin-name{display:none}
  ${TOP}>.side-strip{order:2;flex:0 1 auto;min-width:var(--dock-btn);max-width:max-content;justify-content:flex-start}
  ${TOP}>.titlebar-layout{order:2;padding:0}
  ${TOP}>.titlebar-end{order:3;margin-left:0;gap:0}
  ${TOP}>.titlebar-end>.workspace-chrome{margin-left:0}
  /* The row is as tall from the first paint as the strip draws it (52px, workbench-navigation.ts), before the tabs are in it. */
  ${TOP}>[data-titlebar-tabs]{order:5;flex:1 1 0;min-width:0;min-height:52px}
  ${TOP}>.plugin-picker{order:6}
  ${TOP}>.bar-own{order:7;flex:0 1 auto;min-width:var(--dock-btn);max-width:max(var(--dock-btn),100% - 330px);height:44px;gap:0;overflow:hidden}
  ${TOP}>.bar-own:not(:has([data-dock-pin])){display:none}
  ${TOP}>.desktop-titlebar-drag{display:none}
  ${TOP} .plugin-picker-trigger{width:44px;height:44px}
}
/* 600px and under: the right side shows two whole glyphs (its always-there one and one more; the rest slide). A page with a directory gets its drawer's button before the project, as the foot had it; the kept plugins
   make the room, down to 项目首页 alone, and the start page lists every one of them. Under 360px the row cannot hold all of
   that, so the way forward goes (the way back stays). */
@media (max-width:600px){
  ${TOP}>.side-strip{flex:none;max-width:calc(var(--dock-btn)*2)}
  ${SHELL} .immersive-workspace:not(.is-plugin-directory-empty) .workbench-header .titlebar-end .immersive-show-directory,
  /* The design system hides the strip's directory buttons with !important (craft-finish-assistant.ts): only !important shows one again. */
  ${SHELL} .is-directory-drawer-open .workbench-header .titlebar-end .navigator-directory-toggle{display:inline-grid!important;place-items:center;order:-1;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border:0;background:transparent;box-shadow:none;color:var(--ink-soft)}
  ${SHELL} .immersive-workspace.is-directory-drawer-open .workbench-header .titlebar-end .immersive-show-directory{display:none!important}
}
@media (max-width:359px){${TOP} [data-workspace-history="forward"]{display:none}}
/* The line: what happened on the left, the composer in the middle, what comes next on the right. Its height is constant.
   The left wing holds what is in progress and what waits for the person, so it keeps 420px before the right one grows: the
   composer is centred from 1444px up and sits a little right of centre below that. */
.work-line{min-width:0;container:work-line/inline-size}
.work-line-row{position:relative;display:grid;grid-template-columns:minmax(min(420px,40%),1fr) minmax(320px,540px) minmax(200px,1fr);grid-template-rows:minmax(0,1fr);align-items:center;gap:12px;min-width:0;height:var(--dock-min,62px)}
/* Where the line is one row the composer stands over the work (UIV-19): browser/work-line-layout.ts writes the three columns. */
.work-line .work-line-row[data-slot-placed]{grid-template-columns:var(--slot-columns)}
.work-line-row::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line-strong);pointer-events:none}
.work-line-track{display:contents}
.work-line-now{display:none}
.work-line-wing{position:relative;display:flex;align-items:center;gap:8px;height:44px;min-width:0}
.work-line-wing[data-wing="past"]{grid-column:1;grid-row:1;container:work-wing/inline-size}
.work-line-wing[data-wing="next"]{grid-column:3;grid-row:1}
.work-line-slot{grid-column:2;grid-row:1;position:relative;align-self:end;min-width:0}
/* What a multi-line input lies over gives up its height at its foot (WLN-02; the rise is measured in browser/work-line-layout.ts). */
${SHELL} [data-line-yield]{margin-bottom:var(--line-rise,0px)}
.work-line-run{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 2px;overflow-x:auto;overflow-y:hidden}
/* The line with its wings (it is more than 540px wide itself, whatever the window): the events' stretch of the left wing keeps 200px where the wing has it (the head's name shortens first), snaps to whole capsules, and makes room at its end for the way back to now once paged back. */
@container work-line (min-width:541px){
  .work-line-wing[data-wing="past"] .work-line-run{flex:1 1 0;min-width:min(196px,calc(100% - 224px));scroll-snap-type:x mandatory;scroll-padding-right:2px}
  .work-line-wing[data-wing="past"] .work-line-run[data-back]{padding-right:38px;scroll-padding-right:38px}
  .work-line-wing[data-wing="past"] .work-event{scroll-snap-align:end}
}
.work-line-wing[data-wing="past"] .work-line-run>:first-child{margin-left:auto}
.work-line-lead{flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:8px}
.work-line-label{position:relative;flex:none;padding:0 6px;background:var(--desk);color:var(--faint);font-size:11px;white-space:nowrap}
${PRESSABLE}{position:relative;flex:none;display:inline-flex;align-items:center;font:inherit;white-space:nowrap;cursor:pointer;transition:background-color ${HOVER},box-shadow ${HOVER},border-color ${HOVER}}
${PRESSABLE}:hover{background:var(--surface-soft)}
:is(.work-line-head,.work-line-earlier,.work-event,.work-task-mark,.work-task-row-main):focus-visible{outline:var(--focus-stroke);outline-offset:2px}
${PRESSABLE}>svg{flex:none;width:14px;height:14px}
/* The head: which work item the line belongs to, and how many of its events wait for the person. */
.work-line-head{flex:0 1 auto;min-width:calc(2em + 60px);gap:7px;height:34px;max-width:200px;padding:0 8px 0 9px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper);color:var(--ink);font-size:13px;font-weight:600}
.work-line-head-name{min-width:0;${ELLIPSIS}}
.work-line-count{flex:none;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--amber-soft);color:var(--amber);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
/* The way to the events the left wing cannot hold: how many lie out of sight, one step back per press. */
.work-line-earlier{gap:1px;height:28px;padding:0 7px 0 3px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper);color:var(--ink-soft);font-size:11px;font-variant-numeric:tabular-nums}
.work-line-earlier[data-attn]{border-color:var(--amber)}
.work-line-earlier-attn{display:inline-flex;align-items:center;gap:1px;margin-left:5px;color:var(--amber);font-weight:600}
.work-line-earlier-attn>svg{width:12px;height:12px}
:is(.work-line-earlier,.work-line-earlier-attn)[hidden]{display:none}
.work-line-latest{position:absolute;right:0;padding:0 6px}
/* An event: one thing on the line, registered by a plugin or the Assistant. Its state is a word as well as a look; the tasks behind it show as a ring and a count. */
.work-event{gap:7px;height:32px;max-width:300px;padding:0 10px 0 6px;border:0;border-radius:999px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink);font-size:12px;font-weight:500}
.work-line-wing[data-wing="past"] .work-event{max-width:min(300px,calc(100% - 4px))}
.work-event[data-cut]{opacity:0;pointer-events:none}
.work-event[aria-current]{box-shadow:inset 0 0 0 1.5px var(--ink)}
.work-event[data-fresh]{animation:craft-rise-from-bar var(--dur-move) var(--ease-spring,var(--ease-quint))}
.work-event-mark{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;background:color-mix(in srgb,var(--event-hue,var(--muted)) 16%,transparent);color:var(--event-hue,var(--muted))}
.work-event-mark svg{width:12px;height:12px}
.work-event-name{flex:0 1 auto;min-width:2em;overflow:hidden;text-overflow:ellipsis}
.work-event-state{flex:none;font-size:11px}
.work-event-note{flex:0 4 auto;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:11px;font-weight:400}
.work-event-tasks{flex:none;display:inline-flex;align-items:center;gap:3px;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.work-event[data-state="wait"]{background:var(--amber-soft);box-shadow:inset 0 0 0 1px var(--amber)}
.work-event[data-state="wait"] .work-event-note{color:inherit}
.work-event[data-state="failed"]{box-shadow:inset 0 0 0 1px var(--red)}
.work-event[data-state="failed"] .work-event-state{color:var(--red)}
.work-event[data-state="verify"]{box-shadow:inset 0 0 0 1px var(--amber)}
.work-event[data-state="verify"] .work-event-state{color:var(--amber)}
.work-event[data-state="stopped"] .work-event-state{color:var(--ink-soft)}
.work-event[data-state="done"]{background:var(--desk);color:var(--ink-soft)}
.work-event:is([data-state="gone"],[data-state="denied"],[data-state="unreadable"]){background:var(--desk);box-shadow:none;border:1px dashed var(--line-strong);color:var(--muted)}
.work-line-wing[data-wing="past"] ${QUIET} .work-event-note,.work-event[data-tight] .work-event-note{display:none}
/* The left wing gives what it holds by its own width (a split view or an open side panel narrows it, not only the window): a capsule that cannot hold its name drops its note (the script marks it tight); the head's name shortens; an unreadable source drops its words under 640px and its name under 560px; under 400px (a 1024px window) a line with events keeps only the head's glyph and count. A state word never goes. */
.work-event[data-state="unreadable"] .work-event-name{max-width:6em}
@container work-wing (max-width:640px){.work-event[data-state="unreadable"] .work-event-state{display:none}}
@container work-wing (max-width:560px){.work-event[data-state="unreadable"] .work-event-name{display:none}}
@container work-wing (max-width:400px){.work-line-wing:has(.work-line-run>*) .work-line-head-name{display:none}.work-line-wing:has(.work-line-run>*) .work-line-head{min-width:0}}
/* Who a reply is from: the Assistant's mark, or a Character's initial. */
.work-reply-who{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--rail);color:var(--ink-soft);font-size:11px;font-weight:600}
.work-reply-who[data-who="assistant"]{border-radius:5px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent-strong)}
/* The background-task mark at the dialog's top right: a ring and how many are being worked on. */
.work-task-mark{gap:5px;height:28px;padding:0 8px 0 6px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper);color:var(--ink-soft);font-size:12px}
.work-task-mark-count{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.work-task-mark[aria-expanded="true"]{background:var(--nav-active);color:var(--ink)}
.work-task-mark[data-needs-you]{border-color:var(--amber);background:var(--amber-soft)}
.work-task-mark[data-failed]{border-color:var(--red)}
.work-task-mark[data-offline]{border-style:dashed;color:var(--amber)}
${TASK_FLOAT_STYLES}
/* The task panel: a list, or one task's card with a way back. */
.work-task-panel{display:flex;flex-direction:column;width:340px;max-width:100%;max-height:min(56vh,480px);overflow:hidden;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-3);animation:craft-rise ${MOVE}}
.work-task-panel-head{flex:none;display:flex;align-items:center;gap:8px;min-height:44px;min-width:0;padding:0 8px 0 12px;border-bottom:1px solid var(--line)}
.work-task-panel-head>svg{width:16px;height:16px;flex:none}
.work-task-panel-title{flex:1 1 auto;min-width:0;${ELLIPSIS};font-size:13px;font-weight:600}
.work-task-counts{flex:none;display:inline-flex;align-items:center;gap:8px;color:var(--ink-soft);font-size:12px;white-space:nowrap}
.work-task-counts [data-count]{display:inline-flex;align-items:center;gap:3px;font-weight:600;font-variant-numeric:tabular-nums}
.work-task-counts [data-count="you"]{color:var(--amber)}
.work-task-counts [data-count="failed"]{color:var(--red)}
.work-task-panel-body{display:flex;flex-direction:column;min-height:0;padding:6px;overflow:auto}
.work-task-panel-body[data-card]{gap:12px;padding:12px 14px 14px}
.work-task-group{padding:8px 8px 2px;color:var(--muted);font-size:11px;font-weight:500}
.work-task-empty{padding:14px 12px;color:var(--muted);font-size:12px;line-height:1.6}
.work-task-banner{flex:none;display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--line);color:var(--amber);font-size:12px}
.work-task-banner>svg{width:14px;height:14px;flex:none}
.work-task-banner-text{flex:1 1 auto;min-width:0;${ELLIPSIS}}
.work-task-row{display:flex;align-items:center;gap:4px;padding-right:4px;border-radius:var(--r-row,8px)}
.work-task-row:hover{background:var(--nav-hover)}
.work-task-row-main{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:9px;min-height:44px;padding:6px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.work-task-row-main:focus-visible{outline-offset:-2px}
.work-task-row-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}
.work-task-row-title{${ELLIPSIS};font-weight:500}
.work-task-row-step{${ELLIPSIS};color:var(--muted);font-size:12px}
.work-task-row[data-state="done"] .work-task-row-title{color:var(--muted)}
.work-task-serves{display:flex;align-items:center;gap:4px;min-width:0;color:var(--ink-soft);font-size:11px;white-space:nowrap}
.work-task-serves>svg{flex:none;width:12px;height:12px}
.work-task-serves-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-task-serves[data-serves="none"]{color:var(--muted)}
.work-task-facts{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;gap:5px 10px;margin:0;font-size:12px}
.work-task-facts dt{color:var(--muted);white-space:nowrap}
.work-task-facts dd{display:flex;align-items:center;gap:6px;min-width:0;min-height:24px;margin:0}
.work-task-facts dd>span{min-width:0;${ELLIPSIS}}
.work-task-facts dd>.mw-btn{margin-left:auto}
.work-task-step{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-row,8px);font-size:12px;white-space:nowrap}
.work-task-step-name{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-task-step-who{flex:none;margin-left:auto;color:var(--muted);font-size:11px}
.work-task-step[data-step="current"]{background:var(--accent-soft)}
.work-task-step[data-step="todo"]{color:var(--muted)}
/* A quiet button on a quiet ground still shows where it ends (the workbench draws its secondary buttons without an edge). */
${W} ${BUTTON_GROUNDS} .mw-btn--secondary:not(:disabled){border-color:var(--line-strong)}
/* Around a reply in the dialog: where the work was placed (with a way to change it), which task handed a reply back, and a note when the Assistant carried on by itself. */
.work-reply-body{display:flex;flex-direction:column;gap:6px;min-width:0}
.work-reply-body p{margin:0}
.work-reply-placed{display:flex;align-items:center;gap:8px;min-height:32px;min-width:0;padding:3px 4px 3px 9px;border:1px solid var(--line);border-radius:var(--r-control,8px);color:var(--ink);font-size:12px;white-space:nowrap;animation:craft-rise-from-bar ${MOVE}}
.work-reply-placed>svg{flex:none;width:14px;height:14px;color:var(--ink-soft)}
.assistant-placed{margin:6px 0 2px;min-width:0}
.work-reply-waiting{display:flex;align-items:center;gap:8px;min-height:32px;min-width:0;padding:3px 4px 3px 9px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);color:var(--ink);font-size:12px;white-space:nowrap}
.work-reply-waiting[data-waiting="open"]{animation:craft-rise-from-bar ${MOVE}}
.work-reply-waiting[data-waiting="settled"]{min-height:24px;padding:2px 9px;border-color:var(--line);color:var(--ink-soft)}
.work-reply-waiting-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.work-reply-waiting[data-waiting="settled"] .work-reply-waiting-text{font-weight:400}
.assistant-waiting{margin:6px 0 2px;min-width:0}
.assistant-send-to{max-height:min(60vh,440px);overflow:auto}
.work-card-name{flex:0 1 auto;display:flex;align-items:center;gap:6px;min-width:0}
.work-card-name>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.work-card-body:empty{display:none}
.side-parked{display:flex;flex-direction:column;gap:12px;height:100%;padding:12px;overflow:auto}
.side-parked:not([data-empty="true"])>.side-parked-empty{display:none}
.work-reply-placed-where{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.work-reply-returned{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:20px;max-width:100%;min-width:0;padding:0 7px;border-radius:var(--r-tag,6px);background:var(--accent-soft);color:var(--accent-strong);font-size:11px;font-weight:500;white-space:nowrap}
.work-reply-peek-head .work-reply-returned{align-self:center}
.work-reply-returned[data-state="failed"]{background:color-mix(in srgb,var(--red) 12%,transparent);color:var(--red)}
.work-reply-returned>svg,.work-reply-carried>svg{flex:none;width:12px;height:12px}
.work-reply-returned-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-reply-carried{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:11px}
.work-reply-actions{align-self:flex-start;display:flex;align-items:center;gap:6px}
.work-tab-unread{flex:none;width:6px;height:6px;margin-left:-2px;border-radius:50%;background:var(--accent)}
/* The event card that heads an event's tab in the dialog; a task's card uses its sections and actions too. */
.work-card{display:flex;flex-direction:column;gap:10px;margin:0 0 4px;padding:12px;border:1px solid var(--line-strong);border-radius:var(--r-card,12px);background:var(--paper)}
.work-card-head{display:flex;align-items:center;gap:8px;min-width:0;margin:-4px -4px -6px 0}
.work-card-facts{flex:1 1 auto;min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-card-source{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap}
.work-card-source>svg{flex:none;width:14px;height:14px}
.work-card-source>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-card-quote{padding:8px 10px;border-radius:var(--r-row,8px);background:var(--surface-soft);color:var(--ink-soft);line-height:1.6}
.work-card-section{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--line);border-radius:var(--r-row,8px)}
.work-card-section>h4{margin:0 0 2px;padding:0 2px;color:var(--muted);font-size:11px;font-weight:500}
.work-card-actions{display:flex;align-items:center;gap:6px;min-width:0}
.work-card-result{display:flex;flex-direction:column;gap:8px}
.work-card-preview{max-height:9.9em;overflow:hidden;white-space:pre-line;overflow-wrap:anywhere}
.work-card-process>summary{padding:0 2px;color:var(--muted);font-size:11px;font-weight:500;cursor:pointer}
.work-card-process[open]>summary{margin-bottom:2px}
.work-card-decisions{display:flex;flex-direction:column;gap:8px}
.work-accept{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-row,8px)}
.work-accept>.work-reqs-sum{flex:1}
/* A task's card is narrow: the three readings take a row of their own and the way in stands under them, so none is cut. */
[data-task-acceptance]>.work-accept{flex-wrap:wrap}
[data-task-acceptance]>.work-accept>.work-reqs-sum{flex:1 0 100%}
.work-reqs{position:fixed;z-index:30;inset:var(--acceptance-top,var(--desktop-titlebar-height,32px)) auto var(--acceptance-bottom,var(--dock-h,48px)) var(--sheet-inset,14px);width:var(--acceptance-w,320px);display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--line);border-radius:var(--r-card,12px);background:var(--paper);box-shadow:var(--lift-2);overflow:hidden}
html body.immersive-workbench[data-acceptance-open=true] [data-plugin-stage]{margin-left:calc(var(--acceptance-w,320px) + var(--side-gap,8px))}
.work-reqs-head{display:flex;align-items:center;gap:8px;min-width:0;white-space:nowrap}
.work-reqs-head>strong{font-size:15px}
.work-reqs-head>span,.work-req-meta>span:last-child{min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-reqs-fill{flex:1}
.work-reqs-sum{display:flex;gap:12px;margin:0;min-width:0;overflow-x:auto;white-space:nowrap;color:var(--ink-soft);font-size:12px}
.work-reqs-sum>[data-tone=open]{color:var(--amber-ink,var(--ink))}
.work-reqs>*,.work-reqs-list>*{flex:none}
.work-reqs>.work-reqs-list{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;overflow-y:auto}
.work-req{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;border:1px solid var(--line);border-radius:var(--r-row,8px)}
.work-req[data-lead]{border-color:var(--line-strong);box-shadow:var(--lift-1)}
.work-req-head,.work-req-meta,.work-req-why{display:flex;align-items:center;gap:6px;min-width:0;margin:0}
.work-req-head>strong,.work-req-why>span{min-width:0;${ELLIPSIS}}
.work-req-head>strong{flex:1;font-size:13px}
.work-req-note,.work-reqs-round{margin:0;color:var(--ink-soft);font-size:12px}
.work-req-note{${ELLIPSIS}}
.work-req-why{padding:4px 8px;border-radius:var(--r-tag,6px);background:var(--amber-soft);color:var(--ink);font-size:12px}
.work-req-evidence{display:flex;gap:6px;overflow-x:auto}
.work-req-chip{flex:none;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--line-strong);border-radius:var(--r-tag,6px);background:var(--soft);font-size:12px;white-space:nowrap}
.work-req-history{color:var(--muted);font-size:12px}
.work-req-history>summary{display:inline-flex;align-items:center;gap:5px;min-height:24px;cursor:pointer;list-style:none;white-space:nowrap}
.work-req-history>summary::-webkit-details-marker{display:none}
.work-req-history>ol{margin:4px 0 0;padding:6px 8px;list-style:none;border:1px solid var(--line);border-radius:var(--r-control,8px)}
.work-req-history li{${ELLIPSIS};line-height:1.6}
@media (max-width:600px){
  .work-reqs{left:8px;right:8px;width:auto}
  html body.immersive-workbench[data-acceptance-open=true] [data-plugin-stage]{margin-left:0}
  .work-req-history>summary{min-height:44px}
  .work-reqs .mw-btn{min-width:44px;min-height:44px}
  .work-accept{flex-wrap:wrap}
  .work-accept>.work-reqs-sum{flex:1 0 100%}
}
.work-decision{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;border:1px solid var(--amber);border-radius:var(--r-row,8px);background:var(--amber-soft)}
.work-task-panel-body>.work-decision{margin:0 0 10px}
.work-decision-ask{display:flex;align-items:center;gap:6px;min-width:0}
.work-decision-ask>strong{min-width:0;${ELLIPSIS};font-size:13px;color:var(--ink)}
.work-decision-why{margin:0;${ELLIPSIS};color:var(--ink-soft);font-size:12px}
.work-decision-changes{display:flex;flex-direction:column;gap:2px;margin:0;padding:6px 8px;border:1px solid var(--line);border-radius:var(--r-control,6px);background:var(--paper);font-size:12px}
.work-decision-changes>div{display:flex;gap:8px;min-width:0}
.work-decision-changes dt{flex:0 0 auto;max-width:40%;${ELLIPSIS};color:var(--muted)}
.work-decision-changes dd{flex:1 1 auto;min-width:0;margin:0;${ELLIPSIS};color:var(--ink)}
.work-decision-note{width:100%;min-height:44px;padding:6px 8px;border:1px solid var(--line-strong);border-radius:var(--r-control,6px);background:var(--paper);color:var(--ink);font:inherit;font-size:13px;resize:vertical}
.work-decision-note[aria-invalid="true"]{border-color:var(--red)}
.work-place-menu{position:static;display:flex;flex-direction:column;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-row,8px);box-shadow:none}
/* With the dialog closed: the latest reply above the composer, or only the mark once the person has clicked the work surface. */
.work-reply-peek{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-2);line-height:1.65;animation:craft-rise ${MOVE}}
.work-reply-peek-head{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:11px;white-space:nowrap}
.work-reply-peek-fill{flex:1 1 auto}
.work-reply-peek p{margin:0}
[data-assistant-island]>.work-reply-peek{position:absolute;z-index:49;right:0;bottom:calc(100% + 8px + var(--next-row,0px) + var(--context-row,0px));left:0}
.work-reply-peek-body{max-height:4.95em;overflow:hidden;overflow-wrap:anywhere}
/* Folded, the dialog's row is the line's own right end (user decision 2026-11-15): on the line, over nothing of the work, and the next wing stops before it. */
.work-reply-mini{display:inline-flex;align-items:center;gap:4px;animation:craft-rise-from-bar var(--dur-hover) var(--ease-quint)}
.work-line-row>.work-reply-mini{position:absolute;z-index:3;top:50%;right:0;height:44px;margin-top:-22px}
.work-line[data-mini] .work-line-wing[data-wing="next"]{padding-inline-end:var(--mini-room,72px)}
/* A dialog tab is as wide as its name (96 to 184), and the strip scrolls: an event's tab has to say which event it is. */
${W} .assistant-tabs[data-work-tabs] .assistant-tab{flex:0 0 auto;width:auto;min-width:96px;max-width:184px}
@media (prefers-reduced-motion:reduce){${ANIMATED}{animation:none}}
html[data-craft-still] ${ANIMATED}{animation:none}
@container work-line (max-width:1120px){
  .work-line-row{grid-template-columns:minmax(0,2fr) minmax(300px,400px) minmax(0,1fr)}
  ${QUIET} .work-event-note{display:none}
  .work-line-label{display:none}
}
/* Under 960px of its own width the line stands above the composer, in two rows: the same two wings with now between them, then the composer. Three columns would leave the event next to now too little room for its name. */
@container work-line (max-width:959px){
  .work-line-row{grid-template-columns:minmax(0,3fr) auto minmax(0,1fr);grid-template-rows:44px auto;row-gap:6px;height:auto}
  .work-line-row::before{top:22px}
  .work-line-now{grid-column:2;grid-row:1;position:relative;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:var(--action);color:var(--action-ink);font-size:11px;font-weight:600}
  .work-line-slot{grid-column:1/-1;grid-row:2;align-self:auto;justify-self:center;width:min(100%,640px)}
  .work-line-row>.work-reply-mini{top:0;margin-top:0}
}
/* A phone (the line is 540px or less): one track above the composer that slides sideways and rests on whole capsules, the head and any unreadable source fixed at its start. */
@container work-line (max-width:540px){
  .work-line-row{display:flex;flex-direction:column;align-items:stretch;gap:6px}
  .work-line-row::before{top:24px}
  .work-line-track{display:flex;align-items:center;gap:8px;height:48px;min-width:0;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:var(--lead-width,0px)}
  .work-line-track::after{content:"";flex:none;width:var(--track-tail,0px)}
  .work-line-run>.work-event{scroll-snap-align:start}
  .work-line-wing{flex:none;height:48px}
  .work-line-wing[data-wing="past"]{display:contents}
  .work-line-lead{flex:none;position:sticky;z-index:2;left:0;height:48px;padding-right:4px;background:var(--desk);box-shadow:6px 0 6px -2px var(--desk)}
  .work-event[data-cut]{opacity:1;pointer-events:auto}
  .work-event[data-state="unreadable"] :is(.work-event-name,.work-event-state){display:none}
  .work-line-slot{align-self:stretch}
  .work-line-run{flex:none;overflow:visible}
  .work-line-earlier{display:none}
  .work-line-now{flex:none}
  .work-line-row .work-line-wing .work-line-head{height:44px;min-width:44px;justify-content:center}
  .work-line-head-name,.work-event-note{display:none}
  .work-event,.work-line-wing[data-wing="past"] .work-event{height:44px;max-width:min(240px,var(--cap-max,240px))}
  .work-line-wing[data-wing="past"] .work-line-run>:last-child{max-width:min(240px,var(--near-max,240px))}
  /* The closed dialog's row is above the input here too: it is the end of the track, over nothing of the work, and the events stop before it. */
  .work-line-row>.work-reply-mini{height:48px;padding:0 0 0 4px;background:var(--desk);box-shadow:-6px 0 6px -2px var(--desk);animation:none}
  .work-line[data-mini] .work-line-track{margin-inline-end:96px}
  .work-line[data-mini] .work-line-wing[data-wing="next"]{padding-inline-end:0}
}
@media (max-width:760px){
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab:not([data-current]){display:flex}
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab{min-width:72px;max-width:132px}
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab[data-current]{max-width:220px}
  .work-task-panel{flex:1 1 auto;width:auto;max-height:62vh}
  .work-task-row>.mw-btn{display:none}
}
/* Pressed by a finger: a phone's width, or any window whose pointer is coarse (a phone held sideways, a tablet). Everything on
   the strip and the line is a 44px target there, whatever the width. */
@media (max-width:760px),(pointer:coarse){
  .work-task-mark{height:44px;min-width:44px;justify-content:center}
  /* The side path's own switch row (「每步先问我」) is a target like any row of the island. */
  label.assistant-item{min-height:44px}
  :is(.work-task-panel-head,.work-card-head,.work-reply-peek-head,.work-reply-mini) .mw-btn.mw-btn--icon-only{width:44px;height:44px;min-width:44px}
  ${BUTTON_GROUNDS} .mw-btn{min-width:44px;min-height:44px}
  .work-task-row-main{min-height:48px}
  .work-card-process>summary{min-height:44px;align-content:center}
  /* Where the right side's glyphs slide, its always-there entry (a Home tool with a chord) leads the row and stays at its edge. */
  ${TOP}>.side-strip>.tab-item:has(>[data-side-keys]){order:-1;position:sticky;inset-inline-start:0;z-index:1;background:var(--nav-bg)}
}
/* A dialog tab with 44px marks in it keeps room for its title. */
@media (pointer:coarse) and (min-width:761px){${W} .assistant-tabs[data-work-tabs] .assistant-tab{min-width:128px}}
@media (pointer:coarse){
  ${TOP}{--dock-btn:44px}
  ${TOP}>.dock-pins{height:44px;padding:0;gap:0}
  ${TOP} .plugin-picker-trigger{width:44px;height:44px}
  .work-line-row .work-line-wing .work-line-head,.work-event,.work-line-earlier{height:44px;min-width:44px}
  /* Its glyphs are 44px each: where the strip runs short they slide in their own box before anything is pushed off the window. */
  ${TOP}>.side-strip{flex-shrink:1;padding-block:2px;margin-block:-2px;overflow-x:auto;justify-content:safe flex-end}
}
`;
/** The sheet as the page gets it: the notes above are for whoever reads this file. */
export const WORK_LINE_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\/\s*/g, "");
