import { escapeHtml, icon, renderButton, renderComposer, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import type { WebLocale } from "./i18n.js";
import {
  renderEventCard, renderLineEvent, renderLineHead, renderLineUnreadable, renderReplyCarried, renderReplyMini, renderReplyPeek, renderReplyPlaced,
  renderReplyReturned, renderReplyWho, renderTabUnread, renderTaskCard, renderTaskMark, renderTaskPanel, renderTaskRow, renderWorkLine,
  type LineEventView, type LineOwnerView, type TaskRowView,
} from "./work-line-parts.js";

/**
 * The component board's 事项线 section (32-3, scheme E of docs/design/work-line-32): the parts the work line adds, each in its
 * states, then the line and the Assistant's dialog composed from them, as they are and when something is wrong. The frame is
 * the 工作台导航 frame with `?sheet=work-line` (navigation-specimens.ts): a workbench page with the workbench sheet, so every
 * part is drawn by the rules the product loads (styles/work-line.ts) through the functions the product will call
 * (work-line-parts.ts). The dialog, its tabs and messages, the composer with its "send to" tag are the product's own markup.
 * The data is a sample; nothing is read from a Home.
 */

type Specimen = (id: string, n: string, caption: string, note: string, body: string) => string;

const say = (key: string, values?: Record<string, string | number>) => uiText.text(`workbench.work-line-specimens.${key}`, values);
const nav = (key: string) => uiText.text(`workbench.navigation-specimens.${key}`);

const OWNER = {
  goals: { name: "Goals", glyph: "target", hue: "blue" }, pages: { name: "Pages", glyph: "note", hue: "cyan" },
  coding: { name: "Coding", glyph: "code", hue: "purple" }, feed: { name: "Feed", glyph: "rss", hue: "brown" },
  jelly: { name: "Jelly", glyph: "calendar", hue: "mint" }, todo: { name: "Todo", glyph: "list", hue: "green" },
} as const satisfies Record<string, LineOwnerView>;

/** The sample line: what happened, what is being worked on or waits, what comes next. */
function events() {
  const fix: LineEventView = { id: "fix", title: nav("fix-first-screen-layout"), owner: OWNER.coding, state: "running", note: say("running-tests"), tasks: { count: 1, lead: "running" } };
  const quote: LineEventView = { id: "quote", title: say("reply-vendor-quote"), owner: OWNER.todo, state: "wait", note: say("pick-vendor"), tasks: { count: 1, lead: "answer" } };
  return {
    plan: { id: "plan", title: nav("revamp-plan"), owner: OWNER.pages, state: "done" } satisfies LineEventView,
    weekly: { id: "weekly", title: nav("design-weekly-11-03"), owner: OWNER.feed, state: "stale", note: say("no-longer-there") } satisfies LineEventView,
    goal: { id: "goal", title: nav("homepage-revamp-new-first-screen"), owner: OWNER.goals, state: "running", tasks: { count: 2, lead: "running" } } satisfies LineEventView,
    fix, quote,
    talk: { id: "talk", title: say("draft-review-talk"), owner: OWNER.pages, state: "failed", note: say("model-unreachable"), tasks: { count: 1, lead: "failed" } } satisfies LineEventView,
    review: { id: "review", title: say("friday-review"), owner: OWNER.jelly, note: say("fri-15") } satisfies LineEventView,
    brand: { id: "brand", title: nav("roll-out-brand-guide"), owner: OWNER.goals } satisfies LineEventView,
  };
}

function tasks() {
  const e = events();
  return {
    fix: { id: "t-fix", title: e.fix.title, ring: "running", step: say("coding-step-3-of-4-running-tests"), serves: e.fix.title, control: "stop" } satisfies TaskRowView,
    notes: { id: "t-notes", title: say("tidy-interview-notes"), ring: "queued", step: say("assistant-queued-one-ahead"), serves: null, control: "stop" } satisfies TaskRowView,
    quote: { id: "t-quote", title: say("compare-three-quotes"), ring: "answer", step: say("waiting-pick-vendor"), serves: e.quote.title } satisfies TaskRowView,
    talk: { id: "t-talk", title: e.talk.title, ring: "failed", step: say("failed-model-unreachable"), serves: e.review.title, control: "retry" } satisfies TaskRowView,
    plan: { id: "t-plan", title: say("revamp-plan-second-draft"), ring: "done", step: say("linxia-handed-back-5m"), serves: e.plan.title, done: true } satisfies TaskRowView,
  };
}

const row = (body: string, end = false) => `<div class="mw-navs__row${end ? " mw-navs__row--end" : ""} mw-wls__row">${body}</div>`;
const state = (key: string) => `<p class="mw-navs__state">${escapeHtml(say(key))}</p>`;

/** The product's composer with its "send to" tag: the part of the bar the line stands around. */
function composer(to: { readonly name: string; readonly character?: boolean }): string {
  return `<div class="assistant-composer">${renderComposer({ kind: "ai", labels: assistantComposerLabels(uiText.text, true), placeholder: uiText.text("workbench.assistant-dock.ask-assistant-do-something"),
    receiver: { label: to.name, icon: to.character ? "user" : "sparkles", open: true } })}</div>`;
}

const assistant = () => ({ name: uiText.text("workbench.assistant-dock.assistant") });
const linxia = () => ({ name: say("linxia"), character: true });

function line(kind: "ok" | "wait" | "empty" | "unreadable", above = ""): string {
  const e = events(), waiting = kind === "wait";
  const head = renderLineHead({ name: nav("website-revamp"), waiting: waiting ? 1 : 0 });
  const slot = `${above ? `<div class="mw-wls__above">${above}</div>` : ""}${composer(assistant())}`;
  if (kind === "empty") return renderWorkLine({ head, past: [], active: [], next: [], slot });
  return renderWorkLine({
    head, past: [e.plan, ...(kind === "unreadable" ? [] : [e.weekly])], active: waiting ? [e.fix, e.quote] : [e.goal, e.fix], next: [e.review, e.brand],
    unreadable: kind === "unreadable" ? ["Feed"] : [], slot,
  });
}

/** One round in the dialog's thread, in the product's markup: what the person said, then the reply with what stands above and under it. */
function round(user: string, reply: string): string {
  return `<section class="assistant-round">${user ? `<div class="assistant-msg assistant-msg--user">${escapeHtml(user)}</div>` : ""}<div class="assistant-msg assistant-msg--assistant"><div class="reply-body">${reply}</div></div></section>`;
}

const p = (key: string) => `<p>${escapeHtml(say(key))}</p>`;

function replies(): string {
  const e = events();
  const placed = round(say("user-ask"), p("assistant-ack")
    + renderReplyPlaced({ task: "t-fix", where: say("event-named", { name: e.fix.title }), kind: "event" })
    + renderReplyPlaced({ task: "t-notes", where: say("not-on-line"), kind: "none" }));
  const returned = round("", renderReplyReturned(e.fix.title) + p("returned-reply") + renderReplyCarried(1, 3));
  const waiting = round("", renderReplyReturned(say("compare-three-quotes")) + p("needs-you-reply")
    + `<div class="reply-actions">${renderButton({ variant: "primary", size: "sm", label: say("go-decide"), attrs: { "data-event-open": "quote" } })}</div>`);
  return placed + returned + waiting;
}

function eventCard(): string {
  const t = tasks();
  return renderEventCard({
    id: "quote", facts: say("registered-by-waiting", { plugin: OWNER.todo.name }),
    body: `<div class="event-card-quote">${escapeHtml(say("quote-three-vendors"))}</div>`
      + `<div class="event-card-section"><h4>${escapeHtml(say("tasks-behind"))}</h4>${renderTaskRow({ ...t.quote, serves: undefined })}</div>`
      + `<div class="event-card-actions">${renderButton({ variant: "primary", size: "sm", label: say("pick-first") })}${renderButton({ variant: "secondary", size: "sm", label: say("pick-second") })}${renderButton({ variant: "secondary", size: "sm", label: say("ask-me-later") })}</div>`,
  });
}

function taskCard(): string {
  const e = events();
  return renderTaskCard({
    id: "t-fix", title: e.fix.title, owner: OWNER.coding, state: say("in-progress-step-3"), who: say("coding-in-sandbox"), serves: say("event-named", { name: e.fix.title }), returnsTo: say("assistant-main-conversation"),
    steps: [{ name: say("read-code-reproduce"), at: "done" }, { name: say("change-styles"), at: "done" }, { name: say("run-tests"), at: "current" }, { name: say("hand-back-result"), at: "todo" }],
    actions: renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.stop") }) + renderButton({ variant: "secondary", size: "sm", label: say("add-note") }) + renderButton({ variant: "ghost", size: "sm", icon: "external", label: say("open-in-plugin", { plugin: OWNER.coding.name }) }),
  });
}

/** A tab of the dialog in the product's markup (scripts/client/assistant-tabs.ts): a main conversation with someone, or an event. */
function dialogTab(o: { readonly title: string; readonly who?: { readonly name: string; readonly character?: boolean }; readonly owner?: LineOwnerView; readonly current?: boolean; readonly unread?: boolean }): string {
  const lead = o.who ? renderReplyWho(o.who) : o.owner ? `<span class="work-event-mark" style="--event-hue:var(--hue-${o.owner.hue})" aria-hidden="true">${icon(o.owner.glyph)}</span>` : "";
  const close = o.who ? "" : `<button type="button" class="assistant-tab-close" tabindex="-1" aria-label="${escapeHtml(nav("close-tab"))}">×</button>`;
  return `<div class="assistant-tab"${o.current ? ' data-current="true"' : ""}><button type="button" class="assistant-tab-main" role="tab" aria-selected="${Boolean(o.current)}" tabindex="${o.current ? 0 : -1}">${lead}<span class="assistant-tab-title">${escapeHtml(o.title)}</span>${o.unread ? renderTabUnread() : ""}</button>${close}</div>`;
}

/** The dialog as the first slice leaves it: a tab per counterpart, events as tabs, the task mark at the top right, the panel floating beside it. */
function dialog(kind: "main" | "event" | "offline"): string {
  const e = events(), t = tasks(), offline = kind === "offline", onEvent = kind === "event";
  const tabs = dialogTab({ title: assistant().name, who: assistant(), current: !onEvent }) + dialogTab({ title: say("linxia"), who: linxia(), unread: true })
    + dialogTab({ title: e.quote.title, owner: e.quote.owner, current: onEvent }) + (onEvent ? "" : dialogTab({ title: e.fix.title, owner: e.fix.owner }));
  const mark = renderTaskMark(offline ? { count: 3, offline: true, expanded: true } : { count: 3, lead: "answer", needsYou: true, expanded: !onEvent });
  const minimise = `<button type="button" class="dock-window-action" aria-label="${uiText("workbench.assistant-dock.minimize")}" title="${uiText("workbench.assistant-dock.minimize")}">${icon("chevron-down")}</button>`;
  const thread = onEvent ? eventCard() + round(say("user-on-event"), p("assistant-on-event")) : replies();
  const panel = onEvent ? "" : renderTaskPanel({ live: [t.quote, t.talk, t.fix, t.notes], returned: [t.plan], counts: { working: 2, needsYou: 1, failed: 1 }, ...(offline ? { offlineSince: "14:32" } : {}) });
  return `<div class="mw-wls__dialog"><section class="assistant-panel" data-side="closed" aria-label="${uiText("workbench.assistant-dock.assistant")}"><header class="assistant-tabbar"><div class="assistant-tabs" data-work-line data-overflow-fade role="tablist" aria-label="${uiText("workbench.assistant-dock.open-work")}">${tabs}</div>`
    + `<span class="assistant-tabbar-actions">${mark}${minimise}</span></header><div class="assistant-body"><div class="assistant-main"><div class="assistant-thread" role="log">${thread}</div></div></div></section>${panel ? `<div class="mw-wls__float">${panel}</div>` : ""}</div>`;
}

/** The frame's body when the navigation frame is asked for `sheet=work-line`. `specimen` is that frame's own scaffolding. */
export function renderWorkLineSpecimens(specimen: Specimen): string {
  const e = events(), t = tasks();
  const capsule = specimen("wl-event", "1", say("event-on-line"), say("event-on-line-note"),
    row(renderLineEvent(e.review) + renderLineEvent(e.fix) + renderLineEvent(e.goal) + renderLineEvent(e.quote) + renderLineEvent(e.talk))
    + row(renderLineEvent(e.plan) + renderLineEvent(e.weekly) + renderLineEvent({ ...e.fix, current: true }) + renderLineUnreadable("Feed")));
  const head = specimen("wl-head", "2", say("line-head"), say("line-head-note"), row(renderLineHead({ name: nav("website-revamp"), waiting: 0 }) + renderLineHead({ name: nav("homepage-revamp-new-first-screen"), waiting: 0, ring: "running" }) + renderLineHead({ name: nav("homepage-revamp-new-first-screen"), waiting: 2, ring: "answer" })));
  const mark = specimen("wl-task-mark", "3", say("task-mark"), say("task-mark-note"),
    row(renderTaskMark({ count: 0 }) + renderTaskMark({ count: 2, lead: "running" }) + renderTaskMark({ count: 3, lead: "answer", needsYou: true }) + renderTaskMark({ count: 2, lead: "failed", failed: true })
      + renderTaskMark({ count: 2, offline: true }) + renderTaskMark({ count: 2, lead: "running", expanded: true })));
  const panel = specimen("wl-task-panel", "4", say("task-panel"), say("task-panel-note"),
    `<div class="mw-wls__panels">${renderTaskPanel({ live: [t.quote, t.talk, t.fix, t.notes], returned: [t.plan], counts: { working: 2, needsYou: 1, failed: 1 } })}${taskCard()}`
    + `${renderTaskPanel({ live: [], returned: [] })}${renderTaskPanel({ live: [t.fix, t.notes], returned: [], counts: { working: 2, needsYou: 0, failed: 0 }, offlineSince: "14:32" })}</div>`);
  const reply = specimen("wl-reply", "5", say("under-reply"), say("under-reply-note"), `<div class="mw-wls__thread assistant-thread">${replies()}</div>`);
  const card = specimen("wl-event-card", "6", say("event-card"), say("event-card-note"), `<div class="mw-wls__thread assistant-thread">${eventCard()}</div>`);
  const peek = specimen("wl-peek", "7", say("dialog-closed"), say("dialog-closed-note"),
    `<div class="mw-wls__slot">${renderReplyPeek({ who: assistant(), returned: e.fix.title, body: p("peek-reply"), mark: renderTaskMark({ count: 2, lead: "running" }) })}</div>`
    + `<div class="mw-wls__slot">${renderReplyPeek({ who: linxia(), body: p("peek-reply-character"), mark: renderTaskMark({ count: 3, lead: "answer", needsYou: true }) })}</div>`
    + `<div class="mw-wls__slot">${renderReplyMini(renderTaskMark({ count: 2, lead: "running" }))}</div>`);
  const whole = specimen("wl-line", "", say("whole-line"), say("whole-line-note"),
    `${state("ok")}${line("ok", renderReplyMini(renderTaskMark({ count: 3, lead: "running" })))}${state("something-needs-you")}${line("wait", renderReplyPeek({ who: assistant(), returned: say("compare-three-quotes"), body: p("needs-you-reply"), mark: renderTaskMark({ count: 3, lead: "answer", needsYou: true }) }))}`
    + `${state("nothing-on-line-yet")}${line("empty")}${state("source-unreadable")}${line("unreadable")}`);
  const dialogs = specimen("wl-dialog", "", say("dialog-composed"), say("dialog-composed-note"),
    `${state("main-conversation-panel-open")}${dialog("main")}${state("event-tab")}${dialog("event")}${state("disconnected")}${dialog("offline")}`);
  return capsule + head + mark + panel + reply + card + peek + whole + dialogs;
}

export const workLineSpecimenTitle = () => say("work-line");

/** The section's entry in the board's index. */
export const renderWorkLineIndexLink = () => `<a href="#work-line" title="${escapeHtml(say("work-line"))}">${escapeHtml(say("work-line"))}</a>`;

/**
 * Only the board's scaffolding for these specimens: rows that scroll instead of wrapping, the boxes that stand for the slot
 * above the composer and for the dialog's place (the product's dialog is fixed above the bar; here it stands in the flow).
 */
export const WORK_LINE_FRAME_STYLES = `.mw-wls__row{flex-wrap:nowrap;overflow-x:auto;padding:2px;scrollbar-width:none}
.mw-wls__panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,340px));align-items:start;gap:16px;padding:4px}
.mw-wls__thread{display:flex;flex-direction:column;gap:12px;max-width:560px;padding:4px!important;font-size:14px}
.mw-wls__slot{display:flex;flex-direction:column;max-width:540px;padding:4px}
.mw-wls__above{position:absolute;left:0;right:0;bottom:calc(100% + 8px);display:flex;flex-direction:column}
.mw-navs .work-line{min-height:64px;padding:8px 0}
.mw-navs .work-line:has(.mw-wls__above){margin-top:112px}
.mw-navs .work-line:has(.reply-mini){margin-top:48px}
.mw-wls__dialog{position:relative;display:flex;align-items:flex-end;gap:12px;min-width:0;padding:4px}
html body.mw-navs-page .mw-wls__dialog .assistant-panel[data-side]{position:relative;inset:auto;flex:0 1 560px;min-width:0;width:auto;height:440px;animation:none}
.mw-wls__float{position:relative;z-index:60;flex:none;display:flex}
@media (max-width:980px){.mw-wls__dialog{display:block}.mw-wls__float{position:absolute;right:8px;bottom:8px;left:8px;justify-content:flex-end}html body.mw-navs-page .mw-wls__dialog .assistant-panel[data-side]{height:520px}}
@media (max-width:760px){.mw-navs .work-line:has(.mw-wls__above),.mw-navs .work-line:has(.reply-mini){margin-top:0}.mw-wls__above{position:static}}`;

/** The board's section: the frame above, in the board's language, at a fixed height that scrolls inside. */
export function renderWorkLineSection(lang: WebLocale): string {
  return `<section class="mw-catalog__section" id="work-line" data-primitive="work-line"><h2>${escapeHtml(say("work-line"))}</h2>`
    + `<p class="mw-nav-section__note">${escapeHtml(say("section-note"))}</p>`
    + `<iframe class="mw-nav-frame" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}&amp;sheet=work-line" title="${escapeHtml(say("work-line-specimen"))}" loading="lazy"></iframe></section>`;
}
