/**
 * The work line's parts as the first slice settled them (docs/design/work-line-32, scheme E, user 2026-11-14; specs/work-line
 * §4, §10, §12), drawn on the component board first (`/__ui/catalog/navigation?sheet=work-line`) so the slices that move the
 * product onto them use these rules as they are (the way styles/workbench-navigation.ts went first for 07-1).
 *
 * What is new: the line itself (two wings, the head, an event capsule in its states) and what the Assistant's dialog
 * gains: the background-task mark at its top right, the task
 * panel that floats beside it, the placement row and the "returned from a task" mark under a reply, the event card that heads
 * an event's tab, and the one reply (or just the mark) left above the composer when the dialog is closed. The dialog, its tab
 * bar and its messages stay the product's own (design-system craft-finish-assistant.ts); so do the composer's "send to" (its
 * receiver tag) and the strip of what goes with the next message (`.assistant-context-strip`), which the hand adds to.
 *
 * All class names are new, so the rules are written bare; the one rule that has to win over an existing
 * `body.immersive-workbench` rule (a dialog tab as wide as its name) carries that prefix. Written without spaces after `:` and
 * `;`, since the host only strips comments and indentation from a served sheet.
 */
const W = "body.immersive-workbench";
const HOVER = "var(--dur-hover) var(--ease-quint)";
const MOVE = "var(--dur-move) var(--ease-quint)";

export const WORK_LINE_STYLES = `
@keyframes work-line-pop{from{opacity:0;transform:translateY(6px) scale(.97)}}
@keyframes work-line-rise{from{opacity:0;transform:translateY(10px)}}
@keyframes work-line-turn{0%,100%{box-shadow:inset 0 0 0 1px var(--amber)}50%{box-shadow:inset 0 0 0 1px var(--amber),0 0 0 4px color-mix(in srgb,var(--amber) 18%,transparent)}}
/* The line: what happened on the left, the composer in the middle, what comes next on the right. Its height is constant. */
.work-line{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,540px) minmax(0,1fr);grid-template-rows:minmax(0,1fr);align-items:center;gap:12px;min-width:0}
.work-line::before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:var(--line-strong);pointer-events:none}
.work-line-track{display:contents}
.work-line-now{display:none}
.work-line-wing{position:relative;display:flex;align-items:center;gap:8px;height:44px;min-width:0}
.work-line-wing[data-wing="past"]{grid-column:1;grid-row:1}
.work-line-wing[data-wing="next"]{grid-column:3;grid-row:1}
.work-line-slot{grid-column:2;grid-row:1;position:relative;align-self:end;min-width:0}
.work-line-run{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;height:44px;padding:0 2px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.work-line-wing[data-wing="past"] .work-line-run>:first-child{margin-left:auto}
.work-line-wing[data-wing="past"] .work-line-run{-webkit-mask-image:linear-gradient(90deg,transparent,#000 32px);mask-image:linear-gradient(90deg,transparent,#000 32px)}
.work-line-wing[data-wing="next"] .work-line-run{-webkit-mask-image:linear-gradient(270deg,transparent,#000 32px);mask-image:linear-gradient(270deg,transparent,#000 32px)}
.work-line-label{position:relative;flex:none;padding:0 6px;background:var(--desk);color:var(--faint);font-size:11px;white-space:nowrap}
/* The head: which work item the line belongs to, and how many of its events wait for the person. */
.work-line-head{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;height:34px;max-width:200px;padding:0 8px 0 9px;border:1px solid var(--line-strong);border-radius:var(--r-control,8px);background:var(--paper);color:var(--ink);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background-color ${HOVER}}
.work-line-head:hover{background:var(--surface-soft)}
.work-line-head:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.work-line-head svg{width:14px;height:14px;flex:none}
.work-line-head-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.work-line-count{flex:none;display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--amber-soft);color:var(--amber);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
/* An event: one thing on the line, registered by a plugin or the Assistant. The tasks behind it show as a ring and a count. */
.work-event{position:relative;flex:none;display:inline-flex;align-items:center;gap:7px;height:32px;max-width:260px;padding:0 10px 0 6px;border:0;border-radius:16px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink);font:inherit;font-size:12.5px;font-weight:500;white-space:nowrap;cursor:pointer;transition:box-shadow ${HOVER},background-color ${HOVER}}
.work-event:hover{background:var(--surface-soft)}
.work-event:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.work-event[aria-current="true"]{box-shadow:inset 0 0 0 1.5px var(--ink)}
.work-event[data-fresh]{animation:work-line-pop var(--dur-move) var(--ease-spring,var(--ease-quint))}
.work-event-mark{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:5px;background:color-mix(in srgb,var(--event-hue,var(--muted)) 16%,transparent);color:var(--event-hue,var(--muted))}
.work-event-mark svg{width:12px;height:12px}
.work-event-name{flex:0 1 auto;min-width:3em;overflow:hidden;text-overflow:ellipsis}
.work-event-note{flex:none;max-width:11em;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:11.5px;font-weight:400}
.work-event-tasks{flex:none;display:inline-flex;align-items:center;gap:3px;color:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
.work-event[data-state="wait"]{background:var(--amber-soft);box-shadow:inset 0 0 0 1px var(--amber);animation:work-line-turn 1.8s ease-in-out 3}
.work-event[data-state="failed"]{box-shadow:inset 0 0 0 1px var(--red)}
.work-event:is([data-state="wait"],[data-state="failed"]) .work-event-name{min-width:5em}
.work-event:is([data-state="wait"],[data-state="failed"]) .work-event-note{color:inherit}
.work-event[data-state="done"]{background:var(--desk);color:var(--ink-soft)}
.work-event[data-state="stale"]{background:var(--desk);box-shadow:none;border:1px dashed var(--line-strong);color:var(--muted)}
.work-event[data-state="unreadable"]{background:var(--desk);box-shadow:none;border:1px dashed var(--line-strong);color:var(--muted)}
.work-line-wing[data-wing="past"] .work-event{max-width:190px}
.work-line-wing[data-wing="past"] .work-event:not([data-state="wait"],[data-state="failed"],[aria-current="true"]) .work-event-note{display:none}
/* Who a reply is from: the Assistant's mark, or a Character's initial. */
.reply-who{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--rail);color:var(--ink-soft);font-size:10px;font-weight:600}
.reply-who[data-who="assistant"]{border-radius:5px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent-strong)}
/* The background-task mark at the dialog's top right: a ring and how many are being worked on. */
.task-mark{position:relative;flex:none;display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 8px 0 6px;border:1px solid var(--line-strong);border-radius:8px;background:var(--paper);color:var(--ink-soft);font:inherit;font-size:12px;cursor:pointer;transition:background-color ${HOVER},border-color ${HOVER}}
.task-mark:hover{background:var(--surface-soft)}
.task-mark:focus-visible{outline:var(--focus-stroke);outline-offset:2px}
.task-mark svg{width:14px;height:14px;flex:none}
.task-mark-count{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.task-mark[aria-expanded="true"]{background:var(--nav-active);color:var(--ink)}
.task-mark[data-needs-you]{border-color:var(--amber);background:var(--amber-soft)}
.task-mark[data-failed]{border-color:var(--red)}
.task-mark[data-offline]{border-style:dashed;color:var(--amber)}
/* The task panel: floats beside the dialog, never moves the work surface. A list, or one task's card with a way back. */
.task-panel{display:flex;flex-direction:column;width:340px;max-width:100%;max-height:min(56vh,480px);overflow:hidden;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-3);animation:work-line-rise ${MOVE}}
.task-panel-head{flex:none;display:flex;align-items:center;gap:8px;height:44px;min-width:0;padding:0 8px 0 12px;border-bottom:1px solid var(--line)}
.task-panel-head>svg{width:16px;height:16px;flex:none}
.task-panel-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}
.task-panel-counts{flex:none;display:inline-flex;align-items:center;gap:8px;color:var(--ink-soft);font-size:12px;white-space:nowrap}
.task-panel-counts [data-count]{display:inline-flex;align-items:center;gap:3px}
.task-panel-counts b{font-weight:600;font-variant-numeric:tabular-nums}
.task-panel-counts [data-count="you"]{color:var(--amber)}
.task-panel-counts [data-count="failed"]{color:var(--red)}
.task-panel-body{display:flex;flex-direction:column;min-height:0;padding:6px;overflow:auto}
.task-panel-body[data-card]{gap:12px;padding:12px 14px 14px}
.task-panel-group{padding:8px 8px 2px;color:var(--muted);font-size:11px;font-weight:500}
.task-panel-empty{padding:14px 12px;color:var(--muted);font-size:12px;line-height:1.6}
.task-panel-banner{flex:none;display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid var(--line);background:var(--amber-soft);color:var(--amber);font-size:12px}
.task-panel-banner svg{width:14px;height:14px;flex:none}
.task-panel-banner-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.task-row{display:flex;align-items:center;gap:4px;border-radius:var(--r-row,8px)}
.task-row:hover{background:var(--nav-hover)}
.task-row-main{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:9px;min-height:44px;padding:4px 6px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.task-row-main:focus-visible{outline:var(--focus-stroke);outline-offset:-2px}
.task-row-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.task-row-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.task-row-meta{display:flex;align-items:center;gap:6px;min-width:0}
.task-row-step{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11.5px}
.task-row[data-state="done"] .task-row-title{color:var(--muted)}
.task-serves{flex:0 1 auto;min-width:4em;display:inline-flex;align-items:center;gap:4px;height:18px;max-width:50%;padding:0 6px;border-radius:var(--r-tag,6px);background:var(--control-fill);color:var(--ink-soft);font-size:11px;white-space:nowrap}
.task-serves svg{width:12px;height:12px;flex:none}
.task-serves-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.task-serves[data-serves="none"]{background:transparent;box-shadow:inset 0 0 0 1px var(--line);color:var(--muted)}
.task-facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:5px 10px;margin:0;font-size:12px}
.task-facts dt{color:var(--muted);white-space:nowrap}
.task-facts dd{display:flex;align-items:center;gap:6px;min-width:0;margin:0;white-space:nowrap}
.task-step{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-row,8px);font-size:12.5px;white-space:nowrap}
.task-step-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.task-step[data-step="current"]{background:var(--accent-soft)}
.task-step[data-step="todo"]{color:var(--muted)}
/* Under a reply in the dialog: where the work was placed (with a way to change it), which task a reply came back from, and a note when the Assistant carried on by itself. */
.reply-placed{display:flex;align-items:center;gap:8px;min-height:30px;min-width:0;padding:3px 4px 3px 9px;border-radius:var(--r-control,8px);background:var(--surface-soft);color:var(--ink-soft);font-size:12px;white-space:nowrap;animation:work-line-pop ${MOVE}}
.reply-placed svg{width:14px;height:14px;flex:none}
.reply-placed-where{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;color:var(--ink);font-weight:600}
.reply-returned{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:20px;max-width:100%;min-width:0;padding:0 7px;border-radius:var(--r-tag,6px);background:var(--accent-soft);color:var(--accent-strong);font-size:11px;font-weight:500;white-space:nowrap}
.reply-returned svg{width:12px;height:12px;flex:none}
.reply-returned-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.reply-carried{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:11.5px}
.reply-carried svg{width:12px;height:12px;flex:none}
.reply-body{display:flex;flex-direction:column;gap:6px;min-width:0}
.reply-body p{margin:0}
.reply-actions{align-self:flex-start;display:flex;align-items:center;gap:6px}
.assistant-tab-unread{flex:none;width:6px;height:6px;margin-left:-2px;border-radius:50%;background:var(--accent)}
/* The event card that heads an event's tab in the dialog. */
.event-card{display:flex;flex-direction:column;gap:10px;margin:0 0 4px;padding:12px;border:1px solid var(--line-strong);border-radius:var(--r-card,12px);background:var(--paper)}
.event-card-head{display:flex;align-items:center;gap:8px;min-width:0;margin:-4px -4px -6px 0}
.event-card-facts{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}
.event-card-quote{padding:8px 10px;border-radius:var(--r-row,8px);background:var(--surface-soft);color:var(--ink-soft);line-height:1.6}
.event-card-section{display:flex;flex-direction:column;gap:4px;padding:8px;border:1px solid var(--line);border-radius:var(--r-row,8px)}
.event-card-section>h4{margin:0 0 2px;padding:0 2px;color:var(--muted);font-size:11px;font-weight:500}
.event-card-actions{display:flex;align-items:center;gap:6px;min-width:0}
/* With the dialog closed: the latest reply above the composer, or only the mark once the person has clicked the work surface. */
.reply-peek{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--r-card,12px);background:var(--popover);box-shadow:var(--lift-2);line-height:1.65;animation:work-line-rise ${MOVE}}
.reply-peek-head{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:11.5px;white-space:nowrap}
.reply-peek-fill{flex:1 1 auto}
.reply-peek p{margin:0}
.reply-mini{align-self:flex-end;display:inline-flex;align-items:center;gap:2px;padding:4px;border-radius:12px;background:var(--popover);box-shadow:var(--lift-2);animation:work-line-pop var(--dur-hover) var(--ease-quint)}
/* A dialog tab is as wide as its name (96 to 184), and the strip scrolls: an event's tab has to say which event it is. */
${W} .assistant-tabs[data-work-line] .assistant-tab{flex:0 0 auto;width:auto;min-width:96px;max-width:184px}
@media (prefers-reduced-motion:reduce){.work-event,.task-panel,.reply-placed,.reply-peek,.reply-mini{animation:none}}
@media (max-width:1180px){
  .work-line{grid-template-columns:minmax(0,1fr) minmax(300px,440px) minmax(0,1fr)}
  .work-event{max-width:170px}
  .work-event:not([data-state="wait"],[aria-current="true"]) .work-event-note{display:none}
  .work-line-head-name,.work-line-label{display:none}
}
@media (max-width:760px){
  .work-line{display:flex;flex-direction:column;align-items:stretch;gap:6px}
  .work-line::before{top:24px}
  .work-line-track{display:flex;align-items:center;gap:8px;height:48px;min-width:0;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
  .work-line-wing{flex:none;height:48px}
  .work-line-slot{align-self:stretch}
  .work-line-run{flex:none;overflow:visible;-webkit-mask-image:none!important;mask-image:none!important}
  .work-line-now{position:relative;flex:none;display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;background:var(--action);color:var(--action-ink);font-size:11px;font-weight:600;scroll-snap-align:center}
  .work-line-head-name{display:inline;max-width:6em}
  .work-event,.work-line-head{height:44px}
  .work-event{border-radius:22px}
  .work-event:not([data-state="wait"]) .work-event-note{display:none}
  ${W} .assistant-tabs[data-work-line] .assistant-tab:not([data-current]){display:flex}
  ${W} .assistant-tabs[data-work-line] .assistant-tab{min-width:72px;max-width:150px}
  .task-mark{height:36px}
  .task-mark::after{content:"";position:absolute;inset:-4px}
  .task-panel{width:auto;max-height:62vh}
  .task-row-main{min-height:48px}
  .task-row>.mw-btn{display:none}
}
`;
