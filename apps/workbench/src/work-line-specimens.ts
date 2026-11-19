import { escapeHtml, icon, renderButton, renderComposer, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import type { WebLocale } from "./i18n.js";
import {
  renderEventCard, renderLineEvent, renderLineHead, renderListEarlier, renderStackCard, renderStackEmpty, renderLineUnreadable, renderOwnerMark, renderReplyCarried, renderReplyMini, renderReplyPeek, renderReplyPlaced,
  renderReplyReturned, renderReplyWaiting, renderReplyWho, renderTabUnread, renderTaskCard, renderTaskFloat, renderTaskMark, renderTaskPanel, renderTaskRow, renderTaskSteps, renderWorkLine,
  type LineEventState, type LineEventView, type LineOwnerView, type TaskRowView,
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

/** The sample line: what happened, what is being worked on or waits, what comes next. One set of events and tasks for every specimen, so the counts agree. */
function events() {
  const event = (id: string, title: string, owner: LineOwnerView, kind: string, state: LineEventState, more: Partial<LineEventView> = {}): LineEventView =>
    ({ id, title, owner, kind: say(`kind-${kind}`), state, stateLabel: say(`state-${state || "not-started"}`), ...more });
  return {
    plan: event("plan", nav("revamp-plan"), OWNER.pages, "document", "done"),
    weekly: event("weekly", nav("design-weekly-11-03"), OWNER.feed, "digest", "gone"),
    exported: event("export", say("export-revamp-plan"), OWNER.pages, "document", "stopped"),
    merge: event("merge", say("merge-first-screen-branch"), OWNER.coding, "change", "verify"),
    upgrade: event("upgrade", say("upgrade-dependencies"), OWNER.coding, "change", "queued", { tasks: { count: 1, lead: "queued" } }),
    hidden: event("hidden", "", OWNER.goals, "goal", "denied"),
    goal: event("goal", nav("homepage-revamp-new-first-screen"), OWNER.goals, "goal", "running", { tasks: { count: 2, lead: "running" } }),
    fix: event("fix", nav("fix-first-screen-layout"), OWNER.coding, "change", "running", { note: say("running-tests"), tasks: { count: 1, lead: "running" } }),
    quote: event("quote", say("reply-vendor-quote"), OWNER.todo, "todo", "wait", { note: say("which-vendor"), tasks: { count: 1, lead: "answer" } }),
    talk: event("talk", say("draft-review-talk"), OWNER.pages, "document", "failed", { note: say("model-unreachable"), tasks: { count: 1, lead: "failed" } }),
    review: event("review", say("friday-review"), OWNER.jelly, "meeting", "", { note: say("fri-15") }),
    brand: event("brand", nav("roll-out-brand-guide"), OWNER.goals, "goal", ""),
  };
}

function tasks() {
  const e = events();
  return {
    fix: { id: "t-fix", title: e.fix.title, ring: "running", step: say("step-running-tests"), serves: e.fix.title, control: "stop" } satisfies TaskRowView,
    notes: { id: "t-notes", title: say("tidy-interview-notes"), ring: "queued", step: say("step-queued-one-ahead"), serves: null, control: "stop" } satisfies TaskRowView,
    quote: { id: "t-quote", title: say("compare-three-quotes"), ring: "answer", step: say("step-waiting-pick-vendor"), serves: e.quote.title } satisfies TaskRowView,
    talk: { id: "t-talk", title: say("write-talk-outline"), ring: "failed", step: say("step-failed-model-unreachable"), serves: e.talk.title, control: "retry" } satisfies TaskRowView,
    plan: { id: "t-plan", title: say("revamp-plan-second-draft"), ring: "done", step: say("step-handed-back-5m"), serves: e.plan.title, done: true } satisfies TaskRowView,
  };
}

/** The four tasks that have not ended, in the list's order, and what the mark and the head's counts say about them. */
const LIVE = { working: 2, needsYou: 1, failed: 1 } as const;

const row = (body: string, end = false) => `<div class="mw-navs__row${end ? " mw-navs__row--end" : ""} mw-wls__row">${body}</div>`;
const state = (key: string) => `<p class="mw-navs__state">${escapeHtml(say(key))}</p>`;

/** The product's composer with its "send to" tag: the part of the bar the line stands around. */
function composer(to: { readonly name: string; readonly character?: boolean }): string {
  return `<div class="assistant-composer">${renderComposer({ kind: "ai", labels: assistantComposerLabels(uiText.text, true), placeholder: uiText.text("workbench.assistant-dock.ask-assistant-do-something"),
    receiver: { label: to.name, icon: to.character ? "user" : "sparkles", open: true } })}</div>`;
}

const assistant = () => ({ name: uiText.text("workbench.assistant-dock.assistant") });
const linxia = () => ({ name: say("linxia"), character: true });

/** The foot as the page draws it before its script runs (specs/screen-polish §4「底栏第十三版」): with something waiting, the stack's front card. */
function line(kind: "ok" | "wait" | "empty" | "unreadable", above = "", mini = ""): string {
  const slot = `${above ? `<div class="mw-wls__above">${above}</div>` : ""}${composer(assistant())}`;
  const foot = renderWorkLine({ slot, mini });
  const e = events();
  // A source that cannot be read (WLN-37): 办完 open above the stack, the source in its fixed strip above the rows, 更早 N at the end.
  if (kind === "unreadable") return foot
    .replace('data-work-list="done" data-zero aria-expanded="false"', 'data-work-list="done" aria-expanded="true"')
    .replace(' data-work-lists hidden>', ' data-work-lists>')
    .replace("data-work-lists-title></strong>", `data-work-lists-title>${escapeHtml(uiText.text("workbench.work-line.list-done"))}</strong>`)
    .replace("data-work-lists-sources></div>", `data-work-lists-sources>${renderLineUnreadable("Feed")}</div>`)
    .replace("data-work-lists-body></div>", `data-work-lists-body><div class="work-list" data-work-list-rows="done">${[e.plan, e.weekly, e.exported].map(event => `<div class="work-list-item">${renderLineEvent(event)}</div>`).join("")}${renderListEarlier(5)}</div></div>`);
  if (kind !== "wait") return foot;
  return foot.replace(renderStackEmpty(), renderStackCard({ id: e.talk.id, title: e.talk.title, owner: e.talk.owner, more: 2, ask: e.talk.note || e.talk.stateLabel }));
}

/** One round in the dialog's thread, in the product's markup: what the person said, then the reply with what stands above and under it. */
function round(user: string, reply: string): string {
  return `<section class="assistant-round">${user ? `<div class="assistant-msg assistant-msg--user">${escapeHtml(user)}</div>` : ""}<div class="assistant-msg assistant-msg--assistant"><div class="work-reply-body">${reply}</div></div></section>`;
}

const p = (key: string) => `<p>${escapeHtml(say(key))}</p>`;
const button = (variant: "primary" | "secondary", key: string, attrs: Record<string, string> = {}) => renderButton({ variant, size: "sm", label: say(key), attrs });

/** The rounds of a main conversation: work placed in each of the five ways, a task handing back, one that needs the person, one that failed. */
function replies(all = true): string {
  const e = events();
  const placed = round(say("user-ask"), p("assistant-ack")
    + renderReplyPlaced({ task: "t-fix", where: { kind: "new-event", name: e.fix.title } }) + renderReplyPlaced({ task: "t-notes", where: { kind: "none" } }));
  const more = round(say("user-ask-more"), p("assistant-ack-more")
    + renderReplyPlaced({ task: "t-quote", where: { kind: "supplement", name: e.quote.title } }) + renderReplyPlaced({ task: "t-links", where: { kind: "for-event", name: e.review.title } })
    + renderReplyPlaced({ task: "t-list", where: { kind: "other-item", name: nav("roll-out-brand-guide") } }));
  const returned = round("", renderReplyReturned(e.fix.title) + p("returned-reply") + renderReplyCarried(1, 3));
  // A task that waits on the person: the platform's own row, no reply of the Assistant's (WLN-06); folded once it no longer waits.
  const waitingRow = (settled: boolean) => `<div class="assistant-waiting">${renderReplyWaiting({ key: "t-quote", task: say("compare-three-quotes"), event: e.quote.title, settled })}</div>`;
  const waiting = waitingRow(false);
  const failed = round("", renderReplyReturned(say("write-talk-outline"), true) + p("failed-reply")
    + `<div class="work-reply-actions">${button("secondary", "retry-this-step", { "data-task-control": "retry", "data-task": "t-talk" })}${button("secondary", "view-task", { "data-task-open": "t-talk" })}</div>`);
  return all ? placed + more + returned + waiting + failed + waitingRow(true) : placed + returned + waiting;
}

function eventCard(): string {
  const t = tasks();
  return renderEventCard({
    id: "quote", facts: say("registered-by-waiting", { plugin: OWNER.todo.name }),
    body: `<div class="work-card-quote">${escapeHtml(say("quote-three-vendors"))}</div>`
      + `<div class="work-card-section"><h4>${escapeHtml(say("tasks-behind"))}</h4>${renderTaskRow({ id: t.quote.id, title: t.quote.title, ring: t.quote.ring, step: t.quote.step })}</div>`
      + `<div class="work-card-actions">${button("primary", "pick-first")}${button("secondary", "pick-second")}${button("secondary", "ask-me-later")}</div>`,
  });
}

/** The card of work that was asked for and is being done: the person's own words, the tasks behind it, and the breakdown with who does each step. */
function liveCard(): string {
  const t = tasks();
  return renderEventCard({
    id: "fix", facts: say("registered-by-in-progress", { plugin: uiText.text("workbench.assistant-dock.assistant") }),
    body: `<div class="work-card-quote">${escapeHtml(say("user-ask-fix"))}</div>`
      + `<div class="work-card-section"><h4>${escapeHtml(say("in-progress"))}</h4>${renderTaskRow({ id: t.fix.id, title: t.fix.title, ring: t.fix.ring, step: t.fix.step })}</div>`
      + `<div class="work-card-section"><h4>${escapeHtml(say("breakdown"))}</h4>${renderTaskSteps([{ name: say("read-code-reproduce"), at: "done", who: OWNER.coding.name }, { name: say("change-styles"), at: "done", who: OWNER.coding.name },
        { name: say("run-tests"), at: "current", who: OWNER.coding.name }, { name: say("update-plan-screenshots"), at: "todo", who: assistant().name }])}</div>`
      + `<div class="work-card-actions">${button("secondary", "pause")}${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.stop") })}</div>`,
  });
}

/** The card of a result handed back for acceptance: a preview, where it came from, each requirement with the version it was checked against, and what can be done with it. */
function acceptanceCard(): string {
  return renderEventCard({
    id: "plan", facts: say("registered-by-to-accept", { plugin: OWNER.pages.name }),
    body: `<div class="work-card-quote">${escapeHtml(say("plan-preview"))}</div>`
      + `<div class="work-card-source">${icon("note")}<span>${escapeHtml(say("plan-source"))}</span></div>`
      + `<div class="work-card-section"><h4>${escapeHtml(say("requirements-n-of-n"))}</h4>${renderTaskSteps([{ name: say("requirement-three-tiers"), at: "done", who: say("checked-third-version") }, { name: say("requirement-comparison-table"), at: "done", who: say("checked-third-version") },
        { name: say("requirement-faq"), at: "current", ring: "answer", who: say("needs-your-look") }])}</div>`
      + `<div class="work-card-actions">${button("primary", "accept")}${button("secondary", "revise")}${button("secondary", "review-item-by-item")}`
      + `${renderButton({ variant: "ghost", size: "sm", icon: "external", iconOnly: true, label: say("open-as-tab") })}${renderButton({ variant: "ghost", size: "sm", icon: "bookmark", iconOnly: true, label: say("put-on-shelf") })}</div>`,
  });
}

/** What goes with the next message, in the product's own strip above the composer (scripts/client/assistant-context-strip.ts): the hand adds to it, nothing new is drawn. */
function handStrip(): string {
  const chip = (key: string) => `<span class="assistant-strip-chip" title="${uiText("workbench.assistant-context-strip.added")}"><span class="assistant-strip-label">${escapeHtml(say(key))}</span>`
    + `<button type="button" class="assistant-strip-act" aria-label="${escapeHtml(uiText.text("workbench.assistant-context-strip.leave-out-title", { title: say(key) }))}">×</button></span>`;
  return `<div class="assistant-context-strip" role="group" aria-label="${uiText("workbench.assistant-context-strip.going-send")}"><div class="assistant-strip-row">${chip("hand-shelf-item")}${chip("hand-idea")}${chip("hand-file")}</div></div>`;
}

function taskCard(): string {
  const e = events();
  return renderTaskCard({
    id: "t-fix", title: e.fix.title, owner: OWNER.coding, ring: "running", state: say("in-progress-step-3"), who: say("coding-in-sandbox"),
    serves: uiText.text("workbench.work-line.placed-new-event", { name: e.fix.title }), returnsTo: say("assistant-main-conversation"),
    steps: [{ name: say("read-code-reproduce"), at: "done" }, { name: say("change-styles"), at: "done" }, { name: say("run-tests"), at: "current" }, { name: say("hand-back-result"), at: "todo" }],
    actions: renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.stop") }) + button("secondary", "add-note") + renderButton({ variant: "ghost", size: "sm", icon: "external", label: say("open-in-plugin", { plugin: OWNER.coding.name }) }),
  });
}

const panel = (id?: string, offline = false) => {
  const t = tasks();
  return renderTaskPanel({ ...(id ? { id } : {}), live: [t.quote, t.talk, t.fix, t.notes], returned: [t.plan], counts: LIVE, ...(offline ? { offlineSince: "14:32" } : {}) });
};

/** A tab of the dialog in the product's markup (scripts/client/assistant-tabs.ts): a main conversation with someone, or an event. */
function dialogTab(o: { readonly title: string; readonly who?: { readonly name: string; readonly character?: boolean }; readonly owner?: LineOwnerView; readonly current?: boolean; readonly unread?: boolean }): string {
  const lead = o.who ? renderReplyWho(o.who) : o.owner ? renderOwnerMark(o.owner) : "";
  const close = o.who ? "" : `<button type="button" class="assistant-tab-close" tabindex="-1" aria-label="${escapeHtml(nav("close-tab"))}">×</button>`;
  return `<div class="assistant-tab"${o.current ? ' data-current="true"' : ""}><button type="button" class="assistant-tab-main" role="tab" aria-selected="${Boolean(o.current)}" tabindex="${o.current ? 0 : -1}" title="${escapeHtml(o.title)}">${lead}<span class="assistant-tab-title">${escapeHtml(o.title)}</span>${o.unread ? renderTabUnread() : ""}</button>${close}</div>`;
}

/**
 * The dialog as the first slice leaves it: a tab per counterpart, events as tabs, the task mark at the top right, and the
 * task panel placed by the product's own rule (beside the dialog, or over its right side in a stage too narrow for both).
 */
function dialog(kind: "main" | "narrow" | "event" | "offline"): string {
  const e = events(), offline = kind === "offline", onEvent = kind === "event", id = `wl-dialog-${kind}`, panelId = `wl-panel-${kind}`;
  const tabs = dialogTab({ title: assistant().name, who: assistant(), current: !onEvent }) + dialogTab({ title: say("linxia"), who: linxia(), unread: true })
    + dialogTab({ title: e.quote.title, owner: e.quote.owner, current: onEvent }) + (onEvent ? "" : dialogTab({ title: e.fix.title, owner: e.fix.owner }));
  const mark = renderTaskMark(offline ? { count: 4, offline: true, expanded: true, panel: panelId } : { count: 4, lead: "answer", needsYou: true, expanded: !onEvent, ...(onEvent ? {} : { panel: panelId }) });
  const minimise = `<button type="button" class="dock-window-action" aria-label="${uiText("workbench.assistant-dock.minimize")}" title="${uiText("workbench.assistant-dock.minimize")}">${icon("chevron-down")}</button>`;
  const thread = onEvent ? eventCard() + round(say("user-on-event"), p("assistant-on-event")) : replies(false);
  return `<div class="mw-wls__stage" data-work-float-frame${kind === "narrow" ? " data-narrow" : ""}><section class="assistant-panel" id="${id}" data-side="closed" aria-label="${uiText("workbench.assistant-dock.assistant")}"><header class="assistant-tabbar"><div class="assistant-tabs" data-work-tabs data-overflow-fade role="tablist" aria-label="${uiText("workbench.assistant-dock.open-work")}">${tabs}</div>`
    + `<span class="assistant-tabbar-actions">${mark}${minimise}</span></header><div class="assistant-body"><div class="assistant-main"><div class="assistant-thread" role="log">${thread}</div></div></div></section>${onEvent ? "" : renderTaskFloat(id, panel(panelId, offline))}</div>`;
}

/** The frame's body when the navigation frame is asked for `sheet=work-line`. `specimen` is that frame's own scaffolding. */
export function renderWorkLineSpecimens(specimen: Specimen): string {
  const e = events(), t = tasks();
  const capsule = specimen("wl-event", "1", say("event-on-line"), say("event-on-line-note"),
    row(renderLineEvent(e.review) + renderLineEvent(e.upgrade) + renderLineEvent(e.fix) + renderLineEvent(e.goal) + renderLineEvent({ ...e.fix, id: "fix-current", current: true }) + renderLineEvent({ ...e.brand, id: "brand-fresh", fresh: true }))
    + row(renderLineEvent(e.quote) + renderLineEvent(e.talk) + renderLineEvent(e.exported) + renderLineEvent(e.merge))
    + row(renderLineEvent(e.plan) + renderLineEvent(e.weekly) + renderLineEvent(e.hidden) + renderLineUnreadable("Feed")));
  const head = specimen("wl-head", "2", say("line-head"), say("line-head-note"), row(renderLineHead({ menu: "", name: nav("website-revamp"), waiting: 0 }) + renderLineHead({ menu: "", name: nav("homepage-revamp-new-first-screen"), waiting: 0, ring: "running" }) + renderLineHead({ menu: "", name: nav("homepage-revamp-new-first-screen"), waiting: 2, ring: "answer" })));
  const mark = specimen("wl-task-mark", "3", say("task-mark"), say("task-mark-note"),
    row(renderTaskMark({ count: 0 }) + renderTaskMark({ count: 2, lead: "running" }) + renderTaskMark({ count: 3, lead: "answer", needsYou: true }) + renderTaskMark({ count: 2, lead: "failed", failed: true })
      + renderTaskMark({ count: 2, offline: true }) + renderTaskMark({ count: 2, lead: "running", expanded: true })));
  const panels = specimen("wl-task-panel", "4", say("task-panel"), say("task-panel-note"),
    `<div class="mw-wls__panels">${panel()}${taskCard()}${renderTaskPanel({ live: [], returned: [] })}${renderTaskPanel({ live: [t.fix, t.notes], returned: [], offlineSince: "14:32" })}</div>`);
  const reply = specimen("wl-reply", "5", say("under-reply"), say("under-reply-note"), `<div class="mw-wls__thread assistant-thread">${replies()}</div>`);
  const card = specimen("wl-event-card", "6", say("event-card"), say("event-card-note"),
    `${state("card-live")}<div class="mw-wls__thread assistant-thread">${liveCard()}</div>${state("card-decision")}<div class="mw-wls__thread assistant-thread">${eventCard()}</div>${state("card-acceptance")}<div class="mw-wls__thread assistant-thread">${acceptanceCard()}</div>`);
  const hand = specimen("wl-hand", "8", say("hand"), say("hand-note"), `<div class="mw-wls__slot"><div class="mw-wls__hand">${handStrip()}${composer(assistant())}</div></div>`);
  const peek = specimen("wl-peek", "7", say("dialog-closed"), say("dialog-closed-note"),
    `<div class="mw-wls__slot">${renderReplyPeek({ who: assistant(), returned: e.fix.title, body: p("peek-reply"), mark: renderTaskMark({ count: 2, lead: "running" }) })}</div>`
    + `<div class="mw-wls__slot">${renderReplyPeek({ who: linxia(), body: p("peek-reply-character"), mark: renderTaskMark({ count: 3, lead: "answer", needsYou: true }) })}</div>`
    + `<div class="mw-wls__slot">${renderReplyMini(renderTaskMark({ count: 2, lead: "running" }))}</div>`);
  const whole = specimen("wl-line", "", say("whole-line"), say("whole-line-note"),
    `${state("ok")}${line("ok", "", renderReplyMini(renderTaskMark({ count: 2, lead: "running" })))}${state("something-needs-you")}${line("wait", renderReplyPeek({ who: assistant(), returned: say("compare-three-quotes"), body: p("needs-you-reply"), mark: renderTaskMark({ count: 4, lead: "answer", needsYou: true }) }))}`
    + `${state("nothing-on-line-yet")}${line("empty")}${state("source-unreadable")}${line("unreadable")}`);
  const dialogs = specimen("wl-dialog", "", say("dialog-composed"), say("dialog-composed-note"),
    `${state("main-conversation-panel-open")}${dialog("main")}${state("panel-over-dialog")}${dialog("narrow")}${state("event-tab")}${dialog("event")}${state("disconnected")}${dialog("offline")}`);
  return capsule + head + mark + panels + reply + card + peek + hand + whole + dialogs;
}

export const workLineSpecimenTitle = () => say("work-line");

/** The section's entry in the board's index. */
export const renderWorkLineIndexLink = () => `<a href="#work-line" title="${escapeHtml(say("work-line"))}">${escapeHtml(say("work-line"))}</a>`;

/**
 * Only the board's scaffolding for these specimens: rows that scroll instead of wrapping, the box that stands for the slot
 * above the composer, and the stage a dialog stands in. The product's dialog is fixed above the bar; here it stands in a
 * stage that frames it (`data-work-float-frame`), and the task panel is placed in that stage by the product's own rule.
 */
export const WORK_LINE_FRAME_STYLES = `.mw-wls__row{flex-wrap:nowrap;overflow-x:auto;padding:4px 2px}
.mw-wls__panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,340px));align-items:start;gap:16px;padding:4px}
.mw-wls__thread{display:flex;flex-direction:column;gap:12px;max-width:560px;padding:4px!important;font-size:14px}
.mw-wls__slot{display:flex;flex-direction:column;max-width:540px;padding:4px}
.mw-wls__hand{position:relative;margin-top:44px}
@media (max-width:760px){.mw-wls__hand{margin-top:56px}}
.mw-wls__above{position:absolute;left:0;right:0;bottom:calc(100% + 8px);display:flex;flex-direction:column}
.mw-navs .work-line{min-height:64px;padding:8px 0}
.mw-navs .work-line-row:has(.mw-wls__above){margin-top:112px}
.mw-wls__stage{position:relative;display:flex;align-items:flex-start;height:500px;min-width:0;padding:8px 4px;overflow:hidden;transform:translate(0)}
.mw-wls__stage[data-narrow]{max-width:700px}
html body.mw-navs-page .mw-wls__stage .assistant-panel[data-side]{position:relative;inset:auto;flex:0 1 560px;min-width:0;width:auto;height:480px;animation:none}
@container work-line (max-width:959px){.mw-navs .work-line-row:has(.mw-wls__above){margin-top:0}.mw-wls__above{position:static}}
@media (max-width:760px){.mw-wls__stage{height:560px}html body.mw-navs-page .mw-wls__stage .assistant-panel[data-side]{flex-basis:100%;height:540px}}`;

/** The board's section: the frame above, in the board's language, at a fixed height that scrolls inside. */
export function renderWorkLineSection(lang: WebLocale): string {
  return `<section class="mw-catalog__section" id="work-line" data-primitive="work-line"><h2>${escapeHtml(say("work-line"))}</h2>`
    + `<p class="mw-nav-section__note">${escapeHtml(say("section-note"))}</p>`
    + `<iframe class="mw-nav-frame" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}&amp;sheet=work-line" title="${escapeHtml(say("work-line-specimen"))}" loading="lazy"></iframe></section>`;
}
