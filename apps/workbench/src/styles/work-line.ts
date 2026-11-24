import { TASK_FLOAT_STYLES } from "./task-float.js";
/**
 * The work line's parts (specs/screen-polish §4「底栏第十三版」, specs/work-line §16), drawn on the component board first
 * (`/__ui/catalog/navigation?sheet=work-line`) so the product and board share one sheet.
 *
 * What is here: the foot (the account bar, the input with the three counts and the expand key, the card stack), where the
 * Assistant's conversation stands against it (the conversation column on the input, the information column over the stack),
 * the lists and the event's information in that column, a task's card in the float that takes the column's place, the page
 * the platform draws for an event with no page of its own, and the marks around a reply. The dialog's own sheet, head and
 * messages are the design system's (craft-finish-bar.ts, craft-finish-assistant.ts); so are the composer's "send to" (its
 * receiver tag) and the strip of what goes with the next message (`.assistant-context-strip`), which the hand adds to.
 *
 * Every class starts with `work-`, so the rules are written bare and cannot meet a plugin's or the shell's own names; the
 * rules that have to win over an existing `body.immersive-workbench` rule (the dialog's place) carry that prefix. Where a
 * measured part sits (the information column's width, the float) is set by browser/work-line-layout.ts through the attributes
 * and properties named here. Written without spaces after `:` and `;`, since the host only strips comments and indentation.
 */
const W = "body.immersive-workbench";
/** The shell outside a pane and the component board's real-bar specimen, as the design system's own rules name it. */
const SHELL = "html :is(body.immersive-workbench:not([data-pane-embedded]),.mw-catalog-bar-stage)";
const HOVER = "var(--dur-hover) var(--ease-quint)";
const MOVE = "var(--dur-move) var(--ease-quint)";
const ELLIPSIS = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
const PRESSABLE = ".work-event";
const BUTTON_GROUNDS = ":is(.work-reply-placed,.work-reply-waiting,.work-reply-actions,.work-task-row,.work-task-facts,.work-card-actions)";
const ANIMATED = ":is(.work-event[data-fresh],.work-task-panel,.work-reply-placed,.work-reply-waiting[data-waiting=\"open\"],.work-count[data-arrived],.work-expand>svg)";
/** Four class weights beat craft-finish-bar's resting composer rules in half the bytes of repeating SHELL. */
const REST_COMPOSER = ".work-line-slot.work-line-slot.work-line-slot.work-line-slot .assistant-composer";

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
.work-line-row{position:relative;display:grid;grid-template-columns:minmax(0,1fr) min(var(--foot-input),100%) minmax(0,1fr);grid-template-rows:var(--foot-rest,auto);align-items:end;column-gap:12px;min-width:0;min-height:98px;padding:12px 0;box-sizing:border-box}
.work-line-slot{grid-column:2;grid-row:1;position:relative;min-width:0;anchor-scope:--work-text}
/* The input at rest is two rows filling its 74px block (13th version): the words across the top, wrapping before the three
   counts in its top right; ＋, who it goes to, the scene controls, the microphone and send below. Writing grows it upwards in the
   composer's own rows. The doubled class outranks the bar's one-row rest (craft-finish-bar.ts) without touching it. */
${SHELL} .work-line-slot{--bar-row:74px;--bar-gap:0px}
/* Outrank craft-finish-bar's <=560px and craft-finish-pages's <=600px :has(> .mw-composer[data-rest]) padding-block rules (0,6,2): .work-line-row owns the 12px vertical padding. */
${SHELL} .work-line-slot.work-line-slot.work-line-slot>.bar-center>.assistant-composer{padding-block:0}
${SHELL} .work-line-slot .mw-composer__box{border-radius:20px}
${REST_COMPOSER}{
  &>.mw-composer[data-rest]{
    &>.mw-composer__box{grid-template-columns:auto var(--bar-receiver-track,auto) minmax(0,1fr) auto auto;grid-template-rows:auto auto;align-content:space-between;box-sizing:border-box;min-height:74px;padding:0 4px 4px}
    & .mw-composer__text{grid-area:1/1/2/-1;padding:6px var(--counts-room,176px) 0 8px}
    & .mw-compose__anchor{grid-area:2/1}
    & .mw-composer__to{grid-area:2/2}
    & :is(.mw-composer__more,.mw-composer__controls){grid-area:2/4}
    & .mw-composer__end{grid-area:2/5}
  }
}
@supports (anchor-name:--x){
  ${REST_COMPOSER}{
    &>.mw-composer[data-rest]{
      & .mw-composer__to{anchor-name:--assistant-receiver}
      &~.assistant-attention{position:absolute;position-anchor:--assistant-receiver;top:anchor(center);right:auto;left:calc(anchor(right) + 6px);translate:0 -50%}
    }
    &:has(>.mw-composer[data-rest]~.assistant-attention:not([hidden])){display:block}
    &:has(>.mw-composer[data-rest]~.assistant-attention:not([hidden]))>.mw-composer[data-rest]>.mw-composer__box{grid-template-columns:auto minmax(44px,max-content) minmax(72px,1fr) auto auto}
  }
}
/* The words stop before the counts; anchoring the counts to the text row keeps notices and files uncovered. */
${SHELL} .work-line-slot .mw-composer__text{padding-inline-end:var(--counts-room,176px)}
@supports (anchor-name:--x){${SHELL} .work-line-slot .mw-composer__text{anchor-name:--work-text}}
/* The account bar: who you are (sync is a dot on the avatar), then 通知, 插件 and 设置 as round keys; no ink-blue solid here. */
.bar-account{grid-column:1;grid-row:1;justify-self:end;display:flex;align-items:center;gap:8px;width:100%;max-width:400px;height:74px;min-width:0;box-sizing:border-box;padding:0 14px 0 10px;border-radius:20px;background:color-mix(in srgb,var(--popover) 62%,var(--desk));box-shadow:0 0 0 1px var(--line)}
.bar-account-me{flex:1 1 auto;display:flex;align-items:center;gap:11px;min-width:0;height:54px;padding:0 12px 0 6px;border:0;border-radius:14px;background:none;color:var(--ink);font:inherit;text-align:start;cursor:pointer;transition:background-color ${HOVER}}
.bar-account-me:hover,.bar-account-me[aria-expanded="true"]{background:color-mix(in srgb,var(--ink) 6%,transparent)}
.bar-account-avatar{position:relative;flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--surface-soft);color:var(--ink-soft);box-shadow:inset 0 0 0 1px var(--line)}
.bar-account-avatar>svg{width:18px;height:18px}
.bar-account-sync{position:absolute;right:0;bottom:0;width:10px;height:10px;border-radius:50%;background:var(--muted);box-shadow:0 0 0 2px var(--popover)}
.bar-account-sync:is([hidden],[data-sync-phase="idle"]){display:none}
.bar-account-sync[data-sync-phase="complete"]{background:var(--green)}
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
:is(.bar-account-me,.bar-account-key,.work-count,.work-expand,.work-stack-more,.work-stack-open):focus-visible{outline:var(--focus-stroke);outline-offset:2px}
/* 办完, 在办, 接下来 inside the input's top right while the dialog is closed (POLISH-67, POLISH-74), then a hairline and the key that
   opens the conversation. While it is open the three are the information column's tabs and only the key stays (POLISH-16). */
/* The row is drawn 24px high (§4「底栏第十三版」第 3 条) but its keys are the bar's 28px floor on a fine pointer (DESIGN.md, the desktop
   chrome's exception) and 44px for a finger, so the row stands 6px from the top and centres on the same line. */
.work-counts{position:absolute;z-index:3;top:calc(var(--counts-top,0px) + 6px);right:10px;display:inline-flex;align-items:center;gap:2px;height:28px}
@supports (anchor-name:--x){.work-counts{position-anchor:--work-text;top:calc(anchor(top,0px) + 6px)}}
.work-count{display:inline-flex;align-items:center;gap:3px;height:28px;padding:0 6px;border:0;border-radius:8px;background:none;color:var(--ink-soft);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.work-count>svg{flex:none;width:14px;height:14px}
.work-count[data-zero]{color:var(--faint)}
.work-count:hover,.work-count[aria-expanded="true"]{background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink)}
.work-count[hidden]{display:none}
.work-your-turn{color:var(--amber)}
.work-count[data-arrived]{animation:craft-done ${MOVE}}
.work-expand{position:relative;flex:none;display:inline-grid;place-items:center;width:28px;height:28px;margin-left:7px;padding:0;border:0;border-radius:8px;background:none;color:var(--ink-soft);cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
.work-expand::before{content:"";position:absolute;left:-4px;top:8px;bottom:8px;width:1px;background:var(--line-strong)}
.work-expand>svg{width:14px;height:14px;transition:rotate ${MOVE}}
.work-expand:hover{background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink)}
.work-expand[aria-expanded="true"]>svg{rotate:180deg}
/* A reply came while the conversation was closed: a dot; amber when the Assistant waits for the person's confirmation (POLISH-65). */
.work-expand-dot{position:absolute;top:3px;right:3px;width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 1.5px var(--popover)}
.work-expand-dot[data-waits]{background:var(--amber)}
.work-expand-dot[hidden]{display:none}
@media (min-width:541px){.work-line[data-dialog-open] .work-count[data-work-list]{display:none}}
/* The right column: the card stack; the information column stands right above it and as wide (§4「底栏第十三版」第 4 条). */
.work-side{grid-column:3;grid-row:1;justify-self:start;position:relative;width:100%;max-width:400px;min-width:0}
.work-stack{position:relative;isolation:isolate;height:74px;min-width:0}
.work-stack-empty{display:flex;align-items:center;gap:8px;height:100%;margin:0;padding:0 16px;box-sizing:border-box;border-radius:20px;box-shadow:inset 0 0 0 1px var(--line);color:var(--muted);font-size:12px}
.work-stack-empty>svg{flex:none;width:14px;height:14px;color:var(--green)}
.work-stack-card{position:relative;display:flex;flex-direction:column;justify-content:center;gap:5px;height:100%;padding:0 12px 0 14px;box-sizing:border-box;border-radius:20px;background:var(--popover);box-shadow:0 0 0 1px color-mix(in srgb,var(--amber) 52%,var(--line)),var(--lift-2,0 4px 12px rgb(0 0 0/.08));cursor:pointer;transition:box-shadow ${HOVER},background-color ${HOVER}}
.work-stack-card:hover{box-shadow:0 0 0 1px var(--amber),var(--lift-2,0 4px 12px rgb(0 0 0/.08))}
.work-stack-card[data-behind]::before,.work-stack-card[data-behind="2"]::after{content:"";position:absolute;z-index:-1;top:-5px;left:14px;right:14px;height:12px;border-radius:12px 12px 0 0;background:color-mix(in srgb,var(--popover) 74%,var(--desk));box-shadow:0 0 0 1px var(--line-strong)}
.work-stack-card[data-behind="2"]::after{top:-9px;left:28px;right:28px;z-index:-2;background:color-mix(in srgb,var(--popover) 46%,var(--desk))}
.work-stack-head,.work-stack-body{display:flex;align-items:center;gap:6px;min-width:0}
.work-stack-head>strong{flex:1 1 auto;min-width:0;${ELLIPSIS};color:var(--ink);font-size:13px;font-weight:600}
.work-stack-more{flex:none;display:inline-flex;align-items:center;gap:1px;padding:0 5px;border:0;border-radius:6px;background:none;color:var(--amber);font:inherit;font-size:12px;white-space:nowrap;transition:background-color ${HOVER}}
button.work-stack-more{cursor:pointer}
button.work-stack-more:hover{background:var(--amber-soft)}
.work-stack-more>svg,.work-stack-open>svg{width:12px;height:12px}
.work-stack-dot{flex:none;width:8px;height:8px;margin:0 5px;border-radius:50%;background:var(--amber)}
.work-stack-ask{flex:1 1 auto;min-width:0;margin:0;${ELLIPSIS};color:var(--ink-soft);font-size:12px}
.work-stack-body>.mw-btn{flex:none}
.work-stack-open{flex:none;display:inline-flex;align-items:center;gap:1px;padding:0 2px;border:0;border-radius:6px;background:none;color:var(--muted);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;transition:color ${HOVER}}
.work-stack-card:hover .work-stack-open,.work-stack-open:hover{color:var(--accent)}
/* The state marks (helm.html .dg): one 11px shape per state, the same in a row, a card and the conversation's line — a turning
   ring while it is being done, a hollow ring while it waits its turn, an amber dot when it is yours, a red one when it failed,
   a grey ring for what comes next, a dashed one for a suggestion, a faint tick when it is done. */
.work-dg{flex:none;display:inline-block;box-sizing:border-box;width:11px;height:11px;border-radius:50%}
.work-dg[data-g="run"]{border:2px solid color-mix(in srgb,var(--accent) 24%,transparent);border-top-color:var(--accent);transform:rotate(45deg)}
.work-dg[data-g="you"]{width:8px;height:8px;margin:0 1.5px;background:var(--amber)}
.work-dg[data-g="bad"]{width:8px;height:8px;margin:0 1.5px;background:var(--red)}
.work-dg[data-g="next"]{width:9px;height:9px;margin:0 1px;border:1.5px solid var(--faint)}
.work-dg[data-g="wait"]{width:9px;height:9px;margin:0 1px;border:1.5px solid color-mix(in srgb,var(--accent) 58%,transparent)}
.work-dg[data-g="sug"]{width:9px;height:9px;margin:0 1px;border:1.5px dashed var(--faint)}
.work-dg[data-g="done"]{display:inline-grid;place-items:center;border-radius:0;color:var(--faint)}
.work-dg[data-g="done"]>svg{width:12px;height:12px}
/* A list in the information column's place (helm.html .zq; the same list parked in the side panel): one card — how many, the
   rows, a line that says what the list is. A row is an event: its mark, its name, and under it what it says and what it is;
   facts are cut before the name, which keeps six characters (POLISH-09). The tasks done for it stand under it behind a rule,
   a sub-agent's step under its task; the tasks of no event close 在办 as a group. */
.work-lists{flex:0 1 auto;min-height:0;display:flex;flex-direction:column;border-radius:12px;background:var(--popover);box-shadow:0 0 0 1px var(--line);font-size:13px}
.work-lists[hidden]{display:none}
.work-lists-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:7px;height:40px;padding:0 8px 0 12px;box-shadow:inset 0 -1px 0 var(--line)}
.work-lists-head>small{min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-lists-sources{flex:none;display:flex;flex-wrap:wrap;gap:6px;padding:6px 8px 0}
.work-lists-sources:empty{display:none}
.work-lists-body{flex:0 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:6px}
.work-lists-foot{flex:none;margin:0;padding:8px 12px 10px;box-shadow:inset 0 1px 0 var(--line);color:var(--faint);font-size:12px;line-height:1.5}
.work-lists-foot:empty{display:none}
.work-list{display:flex;flex-direction:column;gap:1px}
.work-list[hidden]{display:none}
.work-list-item{display:flex;flex-direction:column;gap:1px;min-width:0}
.work-list .work-event,.work-list .work-event[data-state]{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;max-width:none;height:auto;min-height:42px;padding:3px 8px;border:0;border-radius:10px;background:none;box-shadow:none;color:var(--ink);text-align:start}
.work-list .work-event[data-state]:hover,.work-list .work-event[data-state][aria-current]{background:var(--control-fill,var(--surface-soft))}
.work-list .work-event>svg{width:12px;height:12px;color:var(--faint)}
.work-event-n{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.work-list .work-event-name{flex:none;min-width:0;${ELLIPSIS};color:var(--ink);font-size:13px;font-weight:500;line-height:19px;text-align:start}
.work-list .work-event-note{flex:none;min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px;font-weight:400;line-height:16px;text-align:start}
.work-list .work-event[data-state="done"] .work-event-name{color:var(--ink-soft)}
.work-list .work-event:is([data-state="gone"],[data-state="denied"],[data-state="unreadable"]) .work-event-name{color:var(--muted)}
.work-list-group{margin:6px 0 2px;padding:6px 8px 0;box-shadow:inset 0 1px 0 var(--line);color:var(--faint);font-size:12px}
.work-lists-empty{margin:0;padding:14px 8px;color:var(--muted);font-size:13px}
.work-lists-earlier{width:100%;height:30px;margin-top:2px;padding:0 8px;border:0;border-radius:9px;background:none;color:var(--accent);font:inherit;font-size:13px;text-align:start;cursor:pointer}
.work-lists-earlier:hover{background:var(--control-fill,var(--surface-soft))}
/* Where the conversation stands against the foot (POLISH-16, POLISH-72; 960 and wider): the conversation column sits on the
   input, exactly as wide, their edges one; the information column begins at its right edge and ends at the card stack's, its
   cards on the stack's left edge, its foot 12px above the stack. Two sheets that read as one: the column's is a shade back. */
@media (min-width:960px){
  ${SHELL} .work-line-slot .assistant-panel{left:0;right:calc(-12px - var(--info-w,400px));bottom:calc(100% - 1px);overflow:visible;border-radius:0;background:none;box-shadow:none}
  ${SHELL} .work-line-slot .assistant-body{grid-template-columns:minmax(0,1fr) calc(12px + var(--info-w,400px))}
  ${SHELL} .work-line-slot .assistant-main{z-index:1;overflow:hidden;border-radius:18px 0 0 0;background:var(--popover);box-shadow:0 0 0 1px var(--line),var(--lift-3)}
  ${SHELL} .work-line-slot .assistant-side{margin-bottom:12px;border-radius:0 18px 18px 0;box-shadow:0 0 0 1px var(--line),var(--lift-3)}
}
/* The input's top joins the conversation above it; what goes with the next message and the next steps stand in the conversation's foot, over the input. */
@media (min-width:541px){${SHELL} .work-line-slot .assistant-main{padding-bottom:calc(var(--next-row,0px) + var(--context-row,0px))}}
@media (min-width:541px){${SHELL} .work-line[data-dialog-open] .work-line-slot .mw-composer__box{border-top-left-radius:0;border-top-right-radius:0}}
/* 541–959: the input alone, centred; the stack is 该你 N inside it and its card opens above it; the account is the strip's avatar. */
@media (max-width:959px){
  .work-line-row{grid-template-columns:minmax(0,1fr)}
  .work-line-slot{grid-column:1;justify-self:center;width:min(100%,640px)}
  .bar-account{display:none}
  .work-side{position:absolute;z-index:40;grid-column:auto;right:max(0px,calc((100% - 640px)/2));bottom:calc(100% - 4px);width:min(400px,100%);display:none}
  .work-line[data-stack-open] .work-side{display:block}
  .work-your-turn:not([hidden]){display:inline-flex}
}
@media (min-width:960px){.work-your-turn{display:none}}
/* 541–959: the conversation keeps the input's width and the information column is 232px inside it, at its right. */
@media (min-width:541px) and (max-width:959px){
  ${SHELL} .work-line-slot .assistant-panel{position:absolute;left:0;right:0;bottom:calc(100% - 1px);width:auto;height:auto;border-radius:16px 16px 0 0;box-shadow:0 0 0 1px var(--line),var(--lift-3)}
  ${SHELL} .work-line-slot .assistant-body{grid-template-columns:minmax(0,1fr) 232px}
  ${SHELL} .work-line-slot .assistant-side{padding:8px}
}
/* 540 and under: the conversation fills the work, from under the strip to the input. */
@media (max-width:540px){
  ${SHELL} .work-line-slot .assistant-panel{position:fixed;top:calc(var(--desktop-titlebar-height,0px) + var(--tab-strip-h,0px) + 8px);left:8px;right:8px;bottom:calc(var(--dock-h) + var(--line-rise,0px) + 6px + var(--next-row,0px) + var(--context-row,0px));width:auto;height:auto;min-height:0;max-height:none}
}
@media (max-width:760px),(pointer:coarse){
  :is(.work-count,.work-stack-more,.work-stack-open,button.work-place-n){min-height:44px;min-width:44px;justify-content:center}
  .work-stack,.work-stack-card{height:auto;min-height:74px}
  .work-stack-card{padding:6px 12px 6px 14px}
  .work-counts{top:calc(var(--counts-top,0px) + 4px);height:44px}
  @supports (anchor-name:--x){.work-counts{top:calc(anchor(top,0px) + 4px)}}
  .work-expand{width:44px;height:44px}
  .work-expand::before{top:12px;bottom:12px}
  .bar-account-key{width:44px;height:44px}
  .work-list .work-event,.work-lists-earlier,.work-task-row-main,.work-task-row-key{min-height:44px}
}
/* 540px and under the three keys and the expand key, 44px each, take most of the input's width: they stand in a row of their own
   above the words, which keep the input's whole width (a 320px window left the words 32px beside them). */
@media (max-width:540px){
  ${SHELL} .work-line-slot .mw-composer__text,${REST_COMPOSER}>.mw-composer[data-rest] .mw-composer__text{padding:48px 8px 0}
  .work-counts{left:calc(var(--counts-left,0px) + 10px);justify-content:flex-end;pointer-events:none}
  .work-counts>*{pointer-events:auto}
  .work-counts>[data-work-line-checking]{flex:0 1 auto;min-width:0;max-width:100%;overflow:hidden}
}
${SHELL} [data-line-yield]{margin-bottom:var(--line-rise,0px)}
${PRESSABLE}{position:relative;flex:none;display:inline-flex;align-items:center;font:inherit;white-space:nowrap;cursor:pointer;transition:background-color ${HOVER},box-shadow ${HOVER},border-color ${HOVER}}
${PRESSABLE}:hover{background:var(--surface-soft)}
:is(.work-event,.work-task-row-main):focus-visible{outline:var(--focus-stroke);outline-offset:2px}
${PRESSABLE}>svg{flex:none;width:14px;height:14px}
/* An event: one thing on the line, registered by a plugin or the Assistant. Its state is a word as well as a look; the tasks behind it show as a ring and a count. */
.work-event{gap:7px;height:32px;max-width:300px;padding:0 10px 0 6px;border:0;border-radius:999px;background:var(--paper);box-shadow:inset 0 0 0 1px var(--line-strong);color:var(--ink);font-size:12px;font-weight:500}
.work-event[aria-current]{box-shadow:inset 0 0 0 1.5px var(--ink)}
.work-event[data-fresh]{animation:craft-rise-from-bar ${MOVE}}
.work-event-mark{flex:none;display:inline-grid;place-items:center;width:18px;height:18px;border-radius:6px;background:color-mix(in srgb,var(--event-hue,var(--muted)) 16%,transparent);color:var(--event-hue,var(--muted))}
.work-event-mark svg{width:12px;height:12px}
.work-event-name{flex:0 1 auto;min-width:2em;overflow:hidden;text-overflow:ellipsis}
.work-event-state{flex:none;font-size:11px}
.work-event-note{flex:0 4 auto;min-width:2.5em;overflow:hidden;text-overflow:ellipsis;color:var(--muted);font-size:11px;font-weight:400}
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
${TASK_FLOAT_STYLES}
/* One task's card, in the float that takes the information column's place, with the way back. */
.work-task-panel{display:flex;flex-direction:column;width:340px;max-width:100%;max-height:min(56vh,480px);overflow:hidden;border-radius:12px;background:var(--popover);box-shadow:0 0 0 1px var(--line),var(--shadow-raised,var(--lift-3));color:var(--ink-soft);font-size:13px;animation:craft-rise ${MOVE}}
.work-task-panel-head{flex:none;display:flex;align-items:center;gap:6px;min-height:44px;min-width:0;padding:0 8px 0 6px;border-bottom:1px solid var(--line)}
.work-task-panel-head>svg{width:16px;height:16px;flex:none}
.work-task-panel-head>.work-dg{margin:0 2px}
.work-task-panel-n{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.work-task-panel-title{min-width:0;${ELLIPSIS};color:var(--ink);font-size:13px;font-weight:600}
.work-task-panel-n>small{min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-task-panel-body{display:flex;flex-direction:column;min-height:0;padding:6px;overflow:auto}
.work-task-panel-body[data-card]{gap:10px;padding:10px 12px 12px}
/* A task under its event (helm.html .rp-r.sub): behind a rule, its mark, its name, the step it is on at the right, and stop or
   retry in place. A step of a sub-agent stands one level further in. */
.work-task-row{display:flex;align-items:center;gap:4px;min-width:0;min-height:30px;margin-left:15px;padding:0 4px 0 0;border-radius:0 8px 8px 0;box-shadow:inset 1.5px 0 0 var(--line-strong)}
.work-task-row:hover,.work-task-row[data-on]{background:var(--control-fill,var(--nav-hover))}
.work-task-row[data-level="2"]{margin-left:31px}
.work-task-row-main{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:10px;height:30px;padding:0 4px 0 12px;border:0;border-radius:inherit;background:transparent;color:inherit;font:inherit;font-size:13px;text-align:left;white-space:nowrap;cursor:pointer}
.work-task-row-main:disabled{cursor:default}
.work-task-row-main:focus-visible{outline-offset:-2px}
.work-task-row-title{flex:0 1 auto;min-width:min(6em,100%);${ELLIPSIS};color:var(--ink-soft);font-weight:500}
.work-task-row-step{flex:1 1000 auto;min-width:0;${ELLIPSIS};color:var(--muted);font-size:12px;text-align:end}
.work-task-row[data-state="done"] .work-task-row-title{color:var(--muted)}
.work-task-row-key{flex:none;height:22px;padding:0 6px;border:0;border-radius:6px;background:none;color:var(--accent);font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.work-task-row-key:hover:not(:disabled){background:var(--accent-soft)}
.work-task-row-key:disabled{color:var(--muted);cursor:default}
.work-task-row-key:focus-visible{outline:var(--focus-stroke);outline-offset:-1px}
/* In a card (这件事现在怎样, 从这里交办出去的) the rows have no rule: they are the card's own list (.zs). */
.work-card-tasks{display:flex;flex-direction:column;margin:8px -8px -4px}
.work-card-tasks[hidden]{display:none}
.work-card-tasks>small{padding:0 8px 2px;color:var(--faint);font-size:12px}
.work-card-tasks .work-task-row{margin-left:0;border-radius:9px;box-shadow:none}
.work-card-tasks .work-task-row[data-level="2"]{margin-left:16px}
.work-card-tasks .work-task-row-main{gap:9px;padding:0 4px 0 8px}
.work-card-tasks .work-task-row-title{color:var(--ink)}
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
.work-reply-waiting{display:flex;align-items:center;gap:8px;min-height:36px;min-width:0;padding:4px 6px 4px 12px;border:0;border-radius:12px;background:var(--popover);box-shadow:0 0 0 1px var(--line);color:var(--ink);font-size:12px;white-space:nowrap}
.work-reply-waiting[data-waiting="open"]{animation:craft-rise-from-bar ${MOVE}}
.work-reply-waiting[data-waiting="settled"]{min-height:24px;padding:2px 12px;color:var(--ink-soft)}
.work-reply-waiting-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.work-reply-waiting[data-waiting="settled"] .work-reply-waiting-text{font-weight:400}
.assistant-waiting{margin:6px 0 2px;min-width:0}
.assistant-send-to{max-height:min(60vh,440px);overflow:auto}
.work-card-body:empty{display:none}
.side-parked{display:flex;flex-direction:column;gap:12px;height:100%;padding:12px;overflow:auto}
.side-parked:not([data-empty="true"])>.side-parked-empty{display:none}
.work-reply-placed-where{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.work-reply-returned{align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:20px;max-width:100%;min-width:0;padding:0 7px;border-radius:var(--r-tag,6px);background:var(--accent-soft);color:var(--accent-strong);font-size:11px;font-weight:500;white-space:nowrap}
.work-reply-returned[data-state="failed"]{background:color-mix(in srgb,var(--red) 12%,transparent);color:var(--red)}
.work-reply-returned>svg,.work-reply-carried>svg{flex:none;width:12px;height:12px}
.work-reply-returned-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-reply-carried{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:11px}
.work-reply-actions{align-self:flex-start;display:flex;align-items:center;gap:6px}
/* What is known about an event, in the information column under 信息 or parked in the side panel (helm.html .zc): 该你做的 —
   amber when you are asked to decide or approve, red when it failed — then 这件事现在怎样, each a card of its own; a task's
   card uses their sections and actions too. */
.work-card{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0}
.work-card-part{flex:none;min-width:0;padding:10px 12px 11px;border-radius:12px;background:var(--popover);box-shadow:0 0 0 1px var(--line);color:var(--ink-soft);font-size:13px}
.work-card-part[hidden]{display:none}
.work-card-part>h4,.work-card-part-head>h4{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;margin:0 0 5px;color:var(--muted);font-size:12px;font-weight:600;line-height:16px}
.work-card-part-head{display:flex;align-items:center;gap:6px;min-width:0;margin-bottom:5px}
.work-card-part-head>h4{margin:0}
.work-card-ask{background:var(--amber-soft);box-shadow:none}
.work-card-ask>h4{color:var(--amber)}
.work-card-ask[data-tone="failed"]{background:var(--red-soft);box-shadow:none}
.work-card-ask[data-tone="failed"]>h4{color:var(--red)}
.work-card-ask[data-tone="done"]{background:var(--popover);box-shadow:0 0 0 1px var(--line)}
.work-card-ask[data-tone="done"]>h4{color:var(--muted)}
.work-card-ask>.work-card-result>.work-card-quote{margin-top:0}
.work-card-ask p{margin:0;color:var(--ink);font-size:13px;line-height:1.6}
.work-card-ask .work-card-actions .mw-btn:not(.mw-btn--primary){background:var(--popover)}
.work-card-name{display:flex;align-items:center;gap:8px;min-width:0;color:var(--ink);font-size:13px}
.work-card-name:empty{display:none}
.work-card-name>strong{min-width:0;${ELLIPSIS};font-weight:600}
.work-card-facts{display:flex;align-items:center;gap:10px;min-width:0;margin:3px 0 0;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-card-facts[hidden]{display:none}
.work-card-facts>span{flex:0 1 auto;min-width:0;${ELLIPSIS}}
.work-card-facts>span[data-g="you"]{color:var(--amber);font-weight:600}
.work-card-facts>span[data-g="bad"]{color:var(--red);font-weight:600}
.work-card-head{display:flex;align-items:center;gap:8px;min-width:0;padding:0 0 0 2px}
.work-card-head>.work-card-name{flex:1 1 auto}
.work-card--list{padding:8px;border-radius:12px;background:var(--popover);box-shadow:0 0 0 1px var(--line)}
.side-parked-card>.work-card[data-parked]{padding:0}
.work-card-source{display:flex;align-items:center;gap:6px;min-width:0;color:var(--muted);font-size:12px;white-space:nowrap}
.work-card-source>svg{flex:none;width:14px;height:14px}
.work-card-source>span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.work-card-quote{margin-top:8px;padding:8px 10px;border-radius:var(--r-row,8px);background:var(--surface-soft);color:var(--ink-soft);line-height:1.6}
.work-card-section{display:flex;flex-direction:column;gap:4px;margin-top:8px}
.work-card-section>h4{margin:0 0 2px;color:var(--faint);font-size:12px;font-weight:400}
.work-card-body:not(:empty){margin-top:8px}
/* 信息 with no event in front: how the place stands. The three counts that name a list open it; 该你 is the stack beside it. */
.work-place-card:empty,.assistant-event-card:not([hidden])~.work-place-card{display:none}
.work-place-counts{display:flex;flex-wrap:wrap;gap:2px 2px;margin:0 -6px}
.work-place-n{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 6px;border:0;border-radius:8px;background:none;color:var(--ink-soft);font:inherit;font-size:12px;white-space:nowrap}
button.work-place-n{cursor:pointer;transition:background-color ${HOVER},color ${HOVER}}
button.work-place-n:hover{background:var(--control-fill,var(--surface-soft));color:var(--ink)}
button.work-place-n:focus-visible{outline:var(--focus-stroke);outline-offset:-1px}
.work-place-n>em{color:var(--ink);font-style:normal;font-weight:600;font-variant-numeric:tabular-nums}
.work-place-n[data-zero]>em{color:var(--muted);font-weight:400}
.work-place-n[data-zero]>.work-dg[data-g="you"]{background:none;border:1.5px solid var(--faint);width:9px;height:9px;margin:0 1px}
.work-card-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;margin-top:9px}
.work-card-actions>.mw-btn{height:28px;padding:0 12px;font-size:13px}
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
.work-reqs-sum>[data-tone=open]{color:var(--amber)}
.work-reqs>*,.work-reqs-list>*{flex:none}
.work-reqs>.work-reqs-list{flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;overflow-y:auto}
.work-req{display:flex;flex-direction:column;gap:6px;min-width:0;padding:10px;border:1px solid var(--line);border-radius:var(--r-row,8px)}
.work-req[data-lead]{border-color:var(--line-strong);box-shadow:var(--lift-1)}
.work-req-head,.work-req-meta,.work-req-why{display:flex;align-items:center;gap:6px;min-width:0;margin:0}
.work-req-head,.work-req-why{align-items:flex-start}
.work-req-head>strong,.work-req-why>span{min-width:0;white-space:normal;overflow-wrap:anywhere}
.work-req-head>strong{flex:1;font-size:13px}
.work-req-note,.work-reqs-round{margin:0;color:var(--ink-soft);font-size:12px}
.work-req-note{white-space:normal;overflow-wrap:anywhere}
.work-req-observed{display:block}
.work-req-why{padding:4px 8px;border-radius:var(--r-tag,6px);background:var(--amber-soft);color:var(--ink);font-size:12px}
.work-req-evidence{display:flex;gap:6px;overflow-x:auto}
.work-req-chip{flex:none;display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid var(--line-strong);border-radius:var(--r-tag,6px);background:var(--surface-soft);font-size:12px;white-space:nowrap}
.work-req-history{color:var(--muted);font-size:12px}
.work-req-history>summary{display:inline-flex;align-items:center;gap:5px;min-height:24px;cursor:pointer;list-style:none;white-space:nowrap}
.work-req-history>summary::-webkit-details-marker{display:none}
.work-req-history>ol{margin:4px 0 0;padding:6px 8px;list-style:none;border:1px solid var(--line);border-radius:var(--r-control,8px)}
.work-req-history li{white-space:normal;overflow-wrap:anywhere;line-height:1.6}
@media (max-width:600px){
  .work-reqs{left:8px;right:8px;width:auto}
  html body.immersive-workbench[data-acceptance-open=true] [data-plugin-stage]{margin-left:0}
  .work-req-history>summary{min-height:44px}
  .work-reqs .mw-btn{min-width:44px;min-height:44px}
  .work-accept{flex-wrap:wrap}
  .work-accept>.work-reqs-sum{flex:1 0 100%}
}
.work-decision{display:flex;flex-direction:column;min-width:0}
.work-decision+.work-decision{margin-top:10px;padding-top:10px;box-shadow:inset 0 1px 0 color-mix(in srgb,var(--amber) 28%,transparent)}
.work-task-panel-body>.work-decision{margin:0;padding:10px 12px 11px;border-radius:12px;background:var(--amber-soft)}
.work-decision-ask{margin:0;color:var(--ink);font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.work-decision-changes{display:flex;flex-direction:column;gap:3px;margin:7px 0 0;padding:0;list-style:none;color:var(--ink);font-size:13px}
.work-decision-changes>li{display:flex;align-items:flex-start;gap:7px;min-width:0}
.work-decision-changes>li>svg{flex:none;width:12px;height:12px;margin-top:3px;color:var(--amber)}
.work-decision-changes>li>span{min-width:0;overflow-wrap:anywhere}
.work-decision-changes>li b{font-weight:500}
.work-decision-why{display:block;margin-top:7px;${ELLIPSIS};color:var(--muted);font-size:12px}
.work-decision-note{width:100%;min-height:44px;margin-top:8px;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line-strong);border-radius:var(--r-control,6px);background:var(--paper);color:var(--ink);font:inherit;font-size:13px;resize:vertical}
.work-decision-note[aria-invalid="true"]{border-color:var(--red)}
.work-place-menu{position:static;display:flex;flex-direction:column;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-row,8px);box-shadow:none}
.work-receive-menu{width:max-content;max-width:100%;min-width:180px;margin-top:6px}
/* The page the platform draws for an event whose owner has none (POLISH-68; scheme B, user 2026-11-21): its name, then two
   columns — what the owner gave and what is asked, then who registered it, how it stands, where it is kept and the tasks done
   for it. One column where its pane is narrow, the owner's part first. */
.work-event-page-slot{height:100%;overflow:auto;container-type:inline-size;background:var(--paper)}
.work-event-page-sheet{display:flex;flex-direction:column;gap:20px;max-width:1120px;margin:0 auto;padding:24px 32px 40px;box-sizing:border-box}
.work-event-page-head>h2{display:flex;align-items:center;gap:10px;min-width:0;min-height:28px;margin:0;color:var(--ink);font-size:20px;font-weight:600;line-height:28px}
.work-event-page-head strong{min-width:0;${ELLIPSIS};font-weight:inherit}
.work-event-page-head .work-event-mark{width:24px;height:24px;border-radius:8px}
.work-event-page-head .work-event-mark svg{width:15px;height:15px}
.work-event-page-cols{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(240px,1fr);align-items:start;gap:32px}
.work-event-page-main,.work-event-page-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.work-event-page-owner{display:flex;flex-direction:column;gap:10px;min-width:0;padding:16px;border:1px solid var(--line);border-radius:var(--r-card,12px);background:color-mix(in srgb,var(--popover) 62%,var(--desk));font-size:13px;line-height:1.7}
.work-event-page-owner>[hidden]{display:none}
/* Nothing from the owner beside what it asks: no empty card under the question. */
.work-event-page-owner:not(:has(>:is([data-card-own],[data-card-result],[data-card-nothing]):not([hidden]),>[data-card-body]:not(:empty,[hidden]))){display:none}
.work-card-body[hidden]{display:none}
.work-card-own{display:flex;flex-direction:column;gap:10px;min-width:0}
.work-card-own[hidden]{display:none}
.work-card-own-words{margin:0;color:var(--ink);font-size:13px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}
.work-card-own-facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 12px;margin:0;font-size:12px}
.work-card-own-facts>dt{color:var(--muted);white-space:nowrap}
.work-card-own-facts>dd{min-width:0;margin:0;${ELLIPSIS};color:var(--ink-soft)}
.work-event-page-none{margin:0;color:var(--muted)}
.work-event-page-facts{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 12px;margin:0;font-size:13px}
.work-event-page-facts>dt{color:var(--muted);white-space:nowrap}
.work-event-page-facts>dd{min-width:0;margin:0;${ELLIPSIS};color:var(--ink);font-weight:600}
.work-event-page-facts>dd[data-g="you"]{color:var(--amber)}
.work-event-page-facts>dd[data-g="bad"]{color:var(--red)}
@container (max-width:720px){
  .work-event-page-sheet{padding:16px}
  .work-event-page-cols{grid-template-columns:minmax(0,1fr);gap:20px}
}
@media (prefers-reduced-motion:reduce){${ANIMATED}{animation:none}}
html[data-craft-still] ${ANIMATED}{animation:none}
@media (max-width:760px){
  .work-task-panel{flex:1 1 auto;width:auto;max-height:62vh}
  .work-task-row>.mw-btn{display:none}
}
/* Pressed by a finger: a phone's width, or any window whose pointer is coarse (a phone held sideways, a tablet). Everything on
   the strip and the line is a 44px target there, whatever the width. */
@media (max-width:760px),(pointer:coarse){
  /* The side path's own switch row (「每步先问我」) is a target like any row of the island. */
  label.assistant-item{min-height:44px}
  :is(.work-task-panel-head,.work-card-head,.work-card-part-head,.work-lists-head) .mw-btn.mw-btn--icon-only{width:44px;height:44px;min-width:44px}
  ${BUTTON_GROUNDS} .mw-btn{min-width:44px;min-height:44px}
  .work-card-process>summary{min-height:44px;align-content:center}
}
@media (pointer:coarse){
  .work-event{height:44px;min-width:44px}
}
`;
/** The sheet as the page gets it: the notes above are for whoever reads this file. */
export const WORK_LINE_STYLES = SHEET.replace(/\/\*[\s\S]*?\*\/\s*/g, "").replace(/\n\s*/g, "");
