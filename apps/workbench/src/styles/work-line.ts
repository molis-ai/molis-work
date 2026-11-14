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
const BUTTON_GROUNDS = ":is(.work-reply-placed,.work-reply-actions,.work-task-row,.work-task-banner,.work-task-facts,.work-card-actions)";
const ANIMATED = ":is(.work-event[data-fresh],.work-task-panel,.work-reply-placed,.work-reply-peek,.work-reply-mini)";

export const WORK_LINE_STYLES = `
/* The shell around the line (WLN-16). The bottom is the line and nothing else; the plugins chosen to stay, the start page's ＋,
   the person's own plugins and the project stand in the top strip, which is 44px tall for them. */
@media (min-width:761px){html body.immersive-workbench:not(.arrival-page){--desktop-titlebar-height:44px}}
${SHELL} .workbench-bar[data-work-bar]{display:block}
${TOP}{position:relative;gap:6px;padding:0 var(--sheet-inset,14px) 0 8px;--dock-btn:30px}
${TOP}>.dock-pins{order:1;flex:0 1 auto;height:36px;margin:0 2px;padding:3px;gap:2px;border-radius:11px;background:color-mix(in srgb,var(--ink) 4%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ink) 6%,transparent)}
${TOP}>.dock-pins::before,${TOP} .dock-pin[aria-current]::after,${TOP}>.plugin-picker::after{content:none}
${TOP} .dock-pin{border-radius:8px}
${TOP} .dock-pin:hover{transform:none}
${TOP} .dock-pin svg{width:17px;height:17px}
.dock-pin-name{display:none}
${TOP} .dock-pin[aria-current]{display:inline-flex;align-items:center;gap:6px;width:auto;max-width:160px;padding:0 10px 0 8px;font:inherit;font-size:12px;font-weight:500}
${TOP} .dock-pin[aria-current]>.dock-pin-name{display:block;${ELLIPSIS}}
${TOP} .dock-pin.is-fixed{margin-right:0}
${TOP} .dock-pin.is-fixed::before{content:none}
/* The tabs take what they need and ＋ follows them; the strip's own ＋ (a list of plugins to open) is the start page now. */
${TOP}>[data-titlebar-tabs]{flex:0 1 auto;min-width:120px}
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
/* A phone: the strip's first row is the way back, the pinned plugins (44px targets, no tray), the right side's glyphs, the layout button and the project; the tabs and ＋ are its second row. */
@media (max-width:760px){
  ${TOP}{--dock-btn:44px;padding:0 8px}
  ${TOP}>.dock-pins{height:44px;margin:0;padding:0;gap:0;background:none;box-shadow:none}
  ${TOP}>.titlebar-end{order:1;margin-left:auto}
  ${TOP} .plugin-picker-trigger{width:44px;height:44px}
}
/* The line: what happened on the left, the composer in the middle, what comes next on the right. Its height is constant.
   The left wing holds what is in progress and what waits for the person, so it keeps 420px before the right one grows: the
   composer is centred from 1444px up and sits a little right of centre below that. */
.work-line{min-width:0;container:work-line/inline-size}
.work-line-row{position:relative;display:grid;grid-template-columns:minmax(min(420px,40%),1fr) minmax(320px,540px) minmax(200px,1fr);grid-template-rows:minmax(0,1fr);align-items:center;gap:12px;min-width:0}
.work-line-row::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line-strong);pointer-events:none}
.work-line-track{display:contents}
.work-line-now{display:none}
.work-line-wing{position:relative;display:flex;align-items:center;gap:8px;height:44px;min-width:0}
.work-line-wing[data-wing="past"]{grid-column:1;grid-row:1;container:work-wing/inline-size}
.work-line-wing[data-wing="next"]{grid-column:3;grid-row:1}
.work-line-slot{grid-column:2;grid-row:1;position:relative;align-self:end;min-width:0}
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
.work-line-count{flex:none;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--amber-soft);color:var(--amber);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
/* The way to the events the left wing cannot hold: how many lie out of sight, one step back per press. */
.work-line-earlier{gap:1px;height:28px;padding:0 7px 0 3px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper);color:var(--ink-soft);font-size:11px;font-variant-numeric:tabular-nums}
.work-line-earlier[data-attn]{border-color:var(--amber)}
.work-line-earlier-attn{display:inline-flex;align-items:center;gap:1px;margin-left:5px;color:var(--amber);font-weight:600}
.work-line-earlier-attn>svg{width:12px;height:12px}
:is(.work-line-earlier,.work-line-earlier-attn)[hidden]{display:none}
.work-line-latest{position:absolute;right:0;padding:0 6px}
/* An event: one thing on the line, registered by a plugin or the Assistant. Its state is a word as well as a look; the tasks behind it show as a ring and a count. */
.work-event{gap:7px;height:32px;max-width:300px;padding:0 10px 0 6px;border:0;border-radius:16px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink);font-size:12px;font-weight:500}
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
/* Where the task panel floats: beside its dialog with their top edges level, or over the dialog's right side under the tab bar
   where there is no room beside it (work-line-layout.ts measures and says which). It never moves the work surface. */
.work-task-float{position:fixed;z-index:60;top:var(--dialog-top,auto);left:calc(var(--dialog-right,0px) + 12px);display:flex;max-width:calc(100% - 20px)}
.work-task-float[data-place="over"]{top:calc(var(--dialog-top,0px) + 52px);left:auto;right:var(--dialog-inset,18px)}
.work-task-float[data-place="over"] .work-task-panel{max-height:min(56vh,480px,var(--dialog-room,480px))}
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
.assistant-send-to{max-height:min(60vh,440px);overflow:auto}
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
.work-place-menu{position:static;display:flex;flex-direction:column;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-row,8px);box-shadow:none}
/* With the dialog closed: the latest reply above the composer, or only the mark once the person has clicked the work surface. */
.work-reply-peek{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-2);line-height:1.65;animation:craft-rise ${MOVE}}
.work-reply-peek-head{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:11px;white-space:nowrap}
.work-reply-peek-fill{flex:1 1 auto}
.work-reply-peek p{margin:0}
.work-reply-mini{align-self:flex-end;display:inline-flex;align-items:center;gap:2px;padding:4px;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-2);animation:craft-rise-from-bar var(--dur-hover) var(--ease-quint)}
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
  .work-line-row{grid-template-columns:minmax(0,3fr) auto minmax(0,1fr);grid-template-rows:44px auto;row-gap:6px}
  .work-line-row::before{top:22px}
  .work-line-now{grid-column:2;grid-row:1;position:relative;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;background:var(--action);color:var(--action-ink);font-size:11px;font-weight:600}
  .work-line-slot{grid-column:1/-1;grid-row:2;align-self:auto;justify-self:center;width:min(100%,640px)}
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
  .work-line-head{height:44px;min-width:0}
  .work-line-head-name,.work-event-note{display:none}
  .work-event,.work-line-wing[data-wing="past"] .work-event{height:44px;max-width:min(240px,var(--cap-max,240px));border-radius:22px}
  .work-line-wing[data-wing="past"] .work-line-run>:last-child{max-width:min(240px,var(--near-max,240px))}
}
@media (max-width:760px){
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab:not([data-current]){display:flex}
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab{min-width:72px;max-width:132px}
  ${W} .assistant-tabs[data-work-tabs] .assistant-tab[data-current]{max-width:220px}
  .work-task-mark{height:36px;min-width:36px;justify-content:center}
  .work-task-mark::after{content:"";position:absolute;inset:-4px}
  :is(.work-task-panel-head,.work-card-head,.work-reply-peek-head,.work-reply-mini) .mw-btn.mw-btn--icon-only{width:44px;height:44px;min-width:44px}
  ${BUTTON_GROUNDS} .mw-btn{min-width:44px;min-height:44px}
  .work-task-float,.work-task-float[data-place="over"]{top:auto;right:10px;bottom:calc(var(--line-clear,0px) + 10px);left:10px;max-width:none}
  .work-task-panel{flex:1 1 auto;width:auto;max-height:62vh}
  .work-task-row-main{min-height:48px}
  .work-task-row>.mw-btn{display:none}
}
`;
