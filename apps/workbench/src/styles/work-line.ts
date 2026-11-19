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
const HOVER = "var(--dur-hover) var(--ease-quint)";
const MOVE = "var(--dur-move) var(--ease-quint)";
const ELLIPSIS = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
const PRESSABLE = ":is(.work-event,.work-task-mark)";
const BUTTON_GROUNDS = ":is(.work-reply-placed,.work-reply-waiting,.work-reply-actions,.work-task-row,.work-task-banner,.work-task-facts,.work-card-actions)";
const ANIMATED = ":is(.work-event[data-fresh],.work-task-panel,.work-reply-placed,.work-reply-waiting[data-waiting=\"open\"],.work-reply-peek,.work-reply-mini)";

const SHEET = `
/* The shell's foot (WLN-16 as specs/work-line §16 rewrote it): the account bar, the input and the card stack; the way to every
   plugin and the projects are in the top strip (styles/top-strip.ts). */
${SHELL} .workbench-bar[data-work-bar]{display:block}
/* The foot (specs/screen-polish §4「底栏第十三版」第 5 条, POLISH-73): the account bar, the input and the card stack, each 74px
   high with a 20px radius, 12px apart and 12px under the sheet; the input keeps the window's centre at a width set by the
   window's tier (UIV-19), whatever stands beside it. Only an input written past its rows grows, upwards; the other two stay. */
${SHELL}:is(body,.mw-catalog-bar-stage){--dock-min:98px;--foot-input:640px}
@media (max-width:1279px){${SHELL}:is(body,.mw-catalog-bar-stage){--foot-input:480px}}
.work-line{min-width:0}
.work-line-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) min(var(--foot-input),100%) minmax(0,1fr);align-items:end;column-gap:12px;min-width:0;min-height:98px;padding:12px 0;box-sizing:border-box}
.work-line-slot{grid-column:2;grid-row:1;position:relative;min-width:0}
/* The input at rest is two rows filling its 74px block (13th version): the words across the top, wrapping before the three
   counts in its top right; ＋, who it goes to, the scene controls, the microphone and send below. Writing grows it upwards in the
   composer's own rows. The doubled class outranks the bar's one-row rest (craft-finish-bar.ts) without touching it. */
${SHELL} .work-line-slot{--bar-row:74px}
${SHELL} .work-line-slot>.bar-center>.assistant-composer{padding-block:0}
${SHELL} .work-line-slot .mw-composer__box{border-radius:20px}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest]>.mw-composer__box{grid-template-columns:auto var(--bar-receiver-track,auto) auto minmax(0,1fr) auto;grid-template-rows:auto auto;align-content:space-between;box-sizing:border-box;min-height:74px;padding:6px 4px 4px}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest] .mw-composer__text{grid-area:1/1/2/-1;padding:0 var(--counts-room,176px) 0 8px}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest] .mw-compose__anchor{grid-area:2/1}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest] .mw-composer__to{grid-area:2/2}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest] :is(.mw-composer__more,.mw-composer__controls){grid-area:2/3}
${SHELL} .work-line-slot.work-line-slot .assistant-composer>.mw-composer[data-rest] .mw-composer__end{grid-area:2/5}
/* The words stop before the counts: the room is the text's column, so the input itself never lies under them. */
${SHELL} .work-line-slot .mw-composer__text{padding-inline-end:var(--counts-room,176px)}
/* The account bar: who you are (sync is a dot on the avatar), then 通知, 插件 and 设置 as round keys; no ink-blue solid here. */
.bar-account{grid-column:1;grid-row:1;justify-self:end;display:flex;align-items:center;gap:8px;width:100%;max-width:400px;height:74px;min-width:0;box-sizing:border-box;padding:0 14px 0 10px;border-radius:20px;background:color-mix(in srgb,var(--popover) 62%,var(--desk));box-shadow:0 0 0 1px var(--line)}
.bar-account-me{flex:1 1 auto;display:flex;align-items:center;gap:11px;min-width:0;height:54px;padding:0 12px 0 6px;border:0;border-radius:14px;background:none;color:var(--ink);font:inherit;text-align:start;cursor:pointer;transition:background-color ${HOVER}}
.bar-account-me:hover,.bar-account-me[aria-expanded="true"]{background:color-mix(in srgb,var(--ink) 6%,transparent)}
.bar-account-avatar{position:relative;flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--surface-soft);color:var(--ink-soft);box-shadow:inset 0 0 0 1px var(--line)}
.bar-account-avatar>svg{width:18px;height:18px}
.bar-account-sync{position:absolute;right:0;bottom:0;width:10px;height:10px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 2px var(--popover)}
.bar-account-sync[hidden]{display:none}
.bar-account-sync:is([data-sync-phase="complete"],[data-sync-phase="idle"]){background:var(--green)}
.bar-account-sync:is([data-sync-phase="syncing"],[data-sync-phase="pending"],[data-sync-phase="waiting"]){background:var(--accent)}
.bar-account-sync:is([data-sync-phase="conflict"],[data-sync-phase="failed"]){background:var(--red)}
.bar-account-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
.bar-account-copy>strong{${ELLIPSIS};font-size:13px;font-weight:600;line-height:19px}
.bar-account-copy>small{${ELLIPSIS};color:var(--muted);font-size:11px;line-height:16px}
.bar-account-key{position:relative;flex:none;display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:50%;background:var(--surface-soft);color:var(--ink-soft);text-decoration:none;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.bar-account-key:hover,.bar-account-key[aria-current]{background:color-mix(in srgb,var(--ink) 12%,transparent);color:var(--ink)}
.bar-account-key>svg{width:17px;height:17px}
.bar-account-key>b{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:var(--amber);color:var(--paper);font-size:11px;line-height:16px;text-align:center}
.bar-account-key>b[hidden]{display:none}
:is(.bar-account-me,.bar-account-key,.work-count,.work-stack-more,.work-stack-open):focus-visible{outline:var(--focus-stroke);outline-offset:2px}
/* 办完, 在办, 接下来 inside the input's top right while the dialog is closed (POLISH-67, POLISH-74), then a hairline and the dialog's own row. */
.work-counts{position:absolute;z-index:3;top:8px;right:10px;display:inline-flex;align-items:center;gap:2px;height:24px}
.work-count{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 6px;border:0;border-radius:7px;background:none;color:var(--ink-soft);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.work-count>svg{flex:none;width:14px;height:14px}
.work-count[data-zero]{color:var(--faint)}
.work-count:hover,.work-count[aria-expanded="true"]{background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink)}
.work-count[hidden]{display:none}
.work-your-turn{color:var(--amber)}
.work-counts>.work-reply-mini{position:relative;height:24px;margin-left:5px;padding-left:5px;animation:none}
.work-counts>.work-reply-mini::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:1px;background:var(--line-strong)}
.work-counts>.work-reply-mini .mw-btn.mw-btn--icon-only{width:24px;height:24px;min-width:24px;min-height:24px}
.work-counts>.work-reply-mini .work-task-mark{height:24px}
.work-counts>.work-event{height:24px;padding:0 8px 0 6px;font-size:11px}
/* The right column: the lists open where the info bar will stand, right above the stack and as wide (§4「底栏第十三版」第 4 条). */
.work-side{grid-column:3;grid-row:1;justify-self:start;position:relative;width:100%;max-width:400px;min-width:0}
.work-stack{position:relative;height:74px;min-width:0}
.work-stack-empty{display:flex;align-items:center;gap:8px;height:100%;margin:0;padding:0 16px;box-sizing:border-box;border-radius:20px;box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:12px}
.work-stack-empty>svg{flex:none;width:14px;height:14px}
.work-stack-card{position:relative;display:flex;flex-direction:column;justify-content:center;gap:5px;height:100%;padding:0 12px 0 14px;box-sizing:border-box;border-radius:20px;background:var(--popover);box-shadow:0 0 0 1px var(--amber),var(--lift-1,0 1px 2px rgb(0 0 0/.06))}
.work-stack-card[data-behind]::before,.work-stack-card[data-behind="2"]::after{content:"";position:absolute;z-index:-1;top:-5px;left:14px;right:14px;height:12px;border-radius:12px 12px 0 0;background:var(--popover);box-shadow:0 0 0 1px var(--line)}
.work-stack-card[data-behind="2"]::after{top:-9px;left:28px;right:28px;z-index:-2}
.work-stack-head,.work-stack-body{display:flex;align-items:center;gap:6px;min-width:0}
.work-stack-head>strong{flex:1 1 auto;min-width:0;${ELLIPSIS};color:var(--ink);font-size:13px;font-weight:600}
.work-stack-more{flex:none;display:inline-flex;align-items:center;gap:1px;padding:0 2px;border:0;border-radius:6px;background:none;color:var(--amber);font:inherit;font-size:12px;white-space:nowrap}
button.work-stack-more{cursor:pointer}
.work-stack-more>svg,.work-stack-open>svg{width:12px;height:12px}
.work-stack-ask{flex:1 1 auto;min-width:0;margin:0;${ELLIPSIS};color:var(--ink-soft);font-size:12px}
.work-stack-body>.mw-btn{flex:none}
.work-stack-open{flex:none;display:inline-flex;align-items:center;gap:1px;padding:0 2px;border:0;border-radius:6px;background:none;color:var(--muted);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.work-stack-open:hover,button.work-stack-more:hover{color:var(--ink)}
.work-lists{position:absolute;z-index:40;left:0;right:0;bottom:calc(100% + 12px);display:flex;flex-direction:column;max-height:min(520px,calc(100vh - 180px));border-radius:16px;background:var(--popover);box-shadow:0 0 0 1px var(--line),var(--lift-2)}
.work-lists[hidden]{display:none}
.work-lists-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 4px 14px;font-size:13px}
.work-lists-sources{display:flex;flex-wrap:wrap;gap:6px;padding:0 8px 6px}
.work-lists-sources:empty{display:none}
.work-lists-body{min-height:0;overflow:auto;padding:0 6px 8px}
.work-lists .work-list[hidden]{display:none}
.work-lists .work-event{display:flex;width:100%;max-width:none;height:34px;border-radius:9px;background:none;box-shadow:none}
.work-lists .work-event:hover{background:var(--surface-soft)}
.work-lists .work-event[aria-current]{background:var(--surface-soft);box-shadow:inset 0 0 0 1.5px var(--ink)}
.work-lists .work-event{justify-content:flex-start;text-align:start}
.work-lists .work-event-name{flex:1 1 auto;text-align:start}
.work-list-item[data-suggested]>.work-event{box-shadow:inset 0 0 0 1px var(--line-strong);border:1px dashed var(--line-strong);box-shadow:none}
.work-list-task{display:flex;align-items:center;gap:6px;min-width:0;margin:0;padding:2px 8px 2px 32px;color:var(--ink-soft);font-size:12px}
.work-list-task>span{flex:0 1 auto;min-width:0;${ELLIPSIS}}
.work-list-task>small{flex:0 4 auto;min-width:0;${ELLIPSIS};color:var(--muted);font-size:11px}
.work-lists-empty{margin:0;padding:10px 8px;color:var(--muted);font-size:12px}
.work-lists-earlier{width:100%;height:32px;margin-top:2px;border:0;border-radius:9px;background:none;color:var(--ink-soft);font:inherit;font-size:12px;text-align:start;padding:0 10px;cursor:pointer}
.work-lists-earlier:hover{background:var(--surface-soft)}
/* 541–959: the input alone, centred; the stack is 该你 N inside it and its card opens above it; the account is the strip's avatar. */
@media (max-width:959px){
  .work-line-row{grid-template-columns:minmax(0,1fr)}
  .work-line-slot{grid-column:1;justify-self:center;width:min(100%,640px)}
  .bar-account{display:none}
  .work-side{position:absolute;z-index:40;grid-column:auto;right:max(0px,calc((100% - 640px)/2));bottom:calc(100% - 4px);width:min(400px,100%);display:none}
  .work-line:is([data-stack-open],[data-list-open]) .work-side{display:block}
  .work-line[data-list-open]:not([data-stack-open]) .work-stack{display:none}
  .work-line[data-list-open]:not([data-stack-open]) .work-lists{position:static}
  .work-your-turn:not([hidden]){display:inline-flex}
}
@media (min-width:960px){.work-your-turn{display:none}}
@media (max-width:760px),(pointer:coarse){
  :is(.work-count,.work-stack-more,.work-stack-open){min-height:44px;min-width:44px;justify-content:center}
  .work-counts{top:4px;height:44px}
  .bar-account-key{width:44px;height:44px}
  .work-lists .work-event,.work-lists-earlier{height:44px}
}
${SHELL} [data-line-yield]{margin-bottom:var(--line-rise,0px)}
${PRESSABLE}{position:relative;flex:none;display:inline-flex;align-items:center;font:inherit;white-space:nowrap;cursor:pointer;transition:background-color ${HOVER},box-shadow ${HOVER},border-color ${HOVER}}
${PRESSABLE}:hover{background:var(--surface-soft)}
:is(.work-event,.work-task-mark,.work-task-row-main):focus-visible{outline:var(--focus-stroke);outline-offset:2px}
${PRESSABLE}>svg{flex:none;width:14px;height:14px}
/* An event: one thing on the line, registered by a plugin or the Assistant. Its state is a word as well as a look; the tasks behind it show as a ring and a count. */
.work-event{gap:7px;height:32px;max-width:300px;padding:0 10px 0 6px;border:0;border-radius:999px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink);font-size:12px;font-weight:500}
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
.work-event[data-tight] .work-event-note{display:none}
/* The left wing gives what it holds by its own width (a split view or an open side panel narrows it, not only the window): a capsule that cannot hold its name drops its note (the script marks it tight); the head's name shortens; an unreadable source drops its words under 640px and its name under 560px; under 400px (a 1024px window) a line with events keeps only the head's glyph and count. A state word never goes. */
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
/* The reply's own blocks, read as running text: three lines have no room for a heading's size or a block's margins. The
   dialog spaces the same blocks under the workbench's body (.assistant-rich), so these are written under it too. */
${SHELL} .work-reply-peek-body :is(p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,figure,table){margin:0}
${SHELL} .work-reply-peek-body :is(h1,h2,h3,h4,h5,h6){font:inherit;font-weight:600;line-height:inherit}
${SHELL} .work-reply-peek-body :is(ul,ol){padding-inline-start:1.4em}
.work-reply-peek-body hr{display:none}
[data-assistant-island]>.work-reply-peek{position:absolute;z-index:49;right:0;bottom:calc(100% + 8px + var(--next-row,0px) + var(--context-row,0px));left:0}
.work-reply-peek-body{max-height:4.95em;overflow:hidden;overflow-wrap:anywhere}
.work-reply-mini{display:inline-flex;align-items:center;gap:4px;animation:craft-rise-from-bar var(--dur-hover) var(--ease-quint)}
/* A dialog tab is as wide as its name (96 to 184), and the strip scrolls: an event's tab has to say which event it is. */
${W} .assistant-tabs[data-work-tabs] .assistant-tab{flex:0 0 auto;width:auto;min-width:96px;max-width:184px}
@media (prefers-reduced-motion:reduce){${ANIMATED}{animation:none}}
html[data-craft-still] ${ANIMATED}{animation:none}
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
}
/* A dialog tab with 44px marks in it keeps room for its title. */
@media (pointer:coarse) and (min-width:761px){${W} .assistant-tabs[data-work-tabs] .assistant-tab{min-width:128px}}
@media (pointer:coarse){
  .work-event{height:44px;min-width:44px}
}
`;
/** The sheet as the page gets it: the notes above are for whoever reads this file. */
export const WORK_LINE_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\/\s*/g, "");
