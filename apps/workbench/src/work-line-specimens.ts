import { escapeHtml, icon, renderButton, renderComposer, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "./assistant-composer-labels.js";
import type { WebLocale } from "./i18n.js";
import {
  renderCardOwn, renderEventCard, renderEventPage, renderInfoLists, renderInfoTabs, renderLineEvent, renderLineUnreadable, renderListEarlier, renderListGroup, renderOwnerMark, renderPlaceCard, renderReplyCarried, renderReplyPlaced,
  renderReplyReturned, renderReplyWaiting, renderStackCard, renderStackEmpty, renderStackLook, renderStackMain, renderTaskCard, renderTaskDecision, renderTaskRow, renderTaskSteps, renderWorkLine,
  type LineEventState, type LineEventView, type LineOwnerView, type TaskRowView,
} from "./work-line-parts.js";

/**
 * The component board's 事项线 section (specs/work-line §16, specs/screen-polish §4「底栏第十三版」): the parts of the foot and of
 * the Assistant's conversation, each in its states, then the foot and the conversation composed from them, as they are and
 * when something is wrong. The frame is the 工作台导航 frame with `?sheet=work-line` (navigation-specimens.ts): a workbench page
 * with the workbench sheet, so every part is drawn by the rules the product loads (styles/work-line.ts, the design system's
 * craft-finish-bar.ts) through the functions the product calls (work-line-parts.ts). The conversation's head and messages and
 * the composer with its "send to" tag are the product's own markup. The data is a sample; nothing is read from a Home.
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
    fix: { id: "t-fix", title: e.fix.title, ring: "running", step: say("step-running-tests"), control: "stop" } satisfies TaskRowView,
    notes: { id: "t-notes", title: say("tidy-interview-notes"), ring: "queued", step: say("step-queued-one-ahead"), control: "stop" } satisfies TaskRowView,
    quote: { id: "t-quote", title: say("compare-three-quotes"), ring: "answer", step: say("step-waiting-pick-vendor") } satisfies TaskRowView,
    talk: { id: "t-talk", title: say("write-talk-outline"), ring: "failed", step: say("step-failed-model-unreachable"), control: "retry" } satisfies TaskRowView,
    plan: { id: "t-plan", title: say("revamp-plan-second-draft"), ring: "done", step: say("step-handed-back-5m"), done: true } satisfies TaskRowView,
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

/** The foot as the page draws it before its script runs (specs/screen-polish §4「底栏第十三版」), with the counts and the stack a read would give it. */
function line(kind: "ok" | "wait" | "main" | "empty"): string {
  const e = events(), counted = (html: string, n: readonly [number, number, number]) => WORK_LIST_IDS.reduce((out, id, at) => out.replace(new RegExp(`(data-work-list="${id}")( data-zero)?([^>]*aria-label="[^"0-9]*)0([^>]*>.*?<span data-n>)0`), `$1$3${n[at]}$4${n[at]}`), html);
  const foot = renderWorkLine({ slot: composer(assistant()) });
  if (kind === "empty") return foot;
  const filled = counted(foot, [3, 2, 4]);
  if (kind === "wait") return filled.replace(renderStackEmpty(), renderStackCard({ id: e.talk.id, title: e.talk.title, owner: e.talk.owner, more: 2, ask: e.talk.note || e.talk.stateLabel }));
  // The Assistant's main conversation waits for a confirmation: its card in the stack and the amber dot on the expand key.
  if (kind === "main") return filled.replace(renderStackEmpty(), renderStackMain({ ask: say("main-ask"), more: 1 })).replace("data-work-expand-dot hidden", "data-work-expand-dot data-waits");
  return filled;
}
const WORK_LIST_IDS = ["done", "now", "next"] as const;

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

/** A decision a task asks for, as 该你做的 shows it. */
const decision = () => renderTaskDecision({ id: "d-quote", task: "t-quote", ask: say("which-vendor"), from: say("compare-three-quotes"), why: say("quote-three-vendors"), changes: [], answers: ["approve", "revise", "reject"], lead: true, revising: false, busy: false });
/** The card with 该你做的 standing first: the part is served hidden and shown by the page once something asks. */
const asking = (card: string, asks: string) => card.replace("data-card-ask hidden>", "data-card-ask>").replace("data-card-decisions hidden></div>", `data-card-decisions>${asks}</div>`);

/** What is known about an event that waits for a decision: 该你做的, then 这件事现在怎样 with the task behind it. */
function eventCard(): string {
  const t = tasks();
  return asking(renderEventCard({
    id: "quote", facts: say("registered-by-waiting", { plugin: OWNER.todo.name }),
    body: `<div class="work-card-section"><h4>${escapeHtml(say("in-progress"))}</h4>${renderTaskRow({ id: t.quote.id, title: t.quote.title, ring: t.quote.ring, step: t.quote.step })}</div>`,
  }), decision());
}

/** Work that was asked for and is being done: the person's own words, then the task behind it with a sub-agent's step under it. */
function liveCard(): string {
  const t = tasks();
  return renderEventCard({
    id: "fix", facts: say("registered-by-in-progress", { plugin: uiText.text("workbench.assistant-dock.assistant") }),
    body: `<div class="work-card-quote">${escapeHtml(say("user-ask-fix"))}</div>`
      + `<div class="work-card-section"><h4>${escapeHtml(say("in-progress"))}</h4>${renderTaskRow(t.fix)}${renderTaskRow({ id: "s-shots", title: say("update-plan-screenshots"), ring: "running", step: assistant().name, level: 2, sub: "s-shots" })}</div>`,
  });
}

/** A result handed back for acceptance: a preview, where it came from, each requirement with the version it was checked against, and what can be done with it. */
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

/** The page the platform draws for an event whose owner has no page: the owner's words and what is asked on the left, the three facts and the tasks on the right. */
function eventPage(): string {
  const e = events(), t = tasks();
  return asking(renderEventPage({ id: "quote", place: nav("website-revamp") }), decision())
    .replace("data-card-name></h2>", `data-card-name>${renderOwnerMark(e.quote.owner)}<strong>${escapeHtml(e.quote.title)}</strong></h2>`)
    .replace("data-card-own hidden></div>", `data-card-own>${renderCardOwn({ words: say("quote-three-vendors"), facts: [[say("fact-due"), say("fact-due-friday")]] })}</div>`)
    .replace("data-fact-owner></dd>", `data-fact-owner>${escapeHtml(OWNER.todo.name)}</dd>`).replace("data-fact-state></dd>", `data-fact-state data-wing="next">${escapeHtml(say("state-wait"))}</dd>`)
    .replace("<div data-card-tasks hidden></div>", `<div class="work-card-section" data-card-tasks><h4>${escapeHtml(say("in-progress"))}</h4>${renderTaskRow({ id: t.quote.id, title: t.quote.title, ring: t.quote.ring, step: t.quote.step })}</div>`);
}

/** The rows of one list, as the page draws them: an event, the tasks done for it under it, a sub-agent's step one level further in. */
function listRows(id: (typeof WORK_LIST_IDS)[number], checking = false): string {
  const e = events(), t = tasks(), item = (event: LineEventView, under = "", suggested = false) => `<div class="work-list-item"${suggested ? " data-suggested" : ""}>${renderLineEvent(event)}${under}</div>`;
  const check = (row: TaskRowView): TaskRowView => checking ? { ...row, checking: true } : row;
  if (id === "done") return [e.plan, e.weekly, e.exported].map(event => item(event)).join("") + renderListEarlier(5);
  if (id === "next") return item(e.review) + item(e.upgrade) + item(e.brand, "", true);
  return item({ ...e.fix, current: true }, renderTaskRow(check({ ...t.fix, level: 1 })) + renderTaskRow(check({ id: "s-shots", title: say("update-plan-screenshots"), ring: "running", step: assistant().name, level: 2, sub: "s-shots" })))
    + item(e.goal, renderTaskRow(check({ ...t.talk, level: 1 })))
    + renderListGroup(uiText.text("workbench.work-line.no-event")) + renderTaskRow(check(t.notes));
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

/**
 * The conversation in the product's markup (assistant-dock.ts): the conversation column — one line that names what is talked
 * about and its three keys, then what was said — and the information column: its tabs, then what is known about the thing in
 * front or one of the three lists. `takes`: a page takes the words itself, so the column says so instead of repeating them.
 */
function dialog(kind: "main" | "list" | "event" | "takes" | "offline"): string {
  const e = events(), onEvent = kind === "event", list = kind === "list" || kind === "offline" ? "now" : "";
  const key = (glyph: Parameters<typeof icon>[0], label: string) => `<button class="dock-window-action" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon(glyph)}</button>`;
  const dock = (name: string) => uiText.text(`workbench.assistant-dock.${name}`);
  const head = `<header class="assistant-head"><span class="assistant-head-mark" aria-hidden="true">${onEvent ? renderOwnerMark(e.quote.owner) : icon("sparkles")}</span><h2 class="assistant-head-title">${escapeHtml(onEvent ? e.quote.title : assistant().name)}</h2>`
    + `<span class="assistant-head-note">${escapeHtml(onEvent ? OWNER.todo.name : uiText.text("workbench.assistant-head.main-in", { place: nav("website-revamp") }))}</span>`
    + `<span class="assistant-head-actions">${key("maximize", dock("maximize"))}${key("more", dock("more"))}${key("chevron-down", dock("minimize"))}</span></header>`;
  const takes = `<p class="assistant-page-takes"><span>${escapeHtml(dock("page-takes-words"))}</span>${renderButton({ variant: "secondary", size: "sm", label: dock("ask-assistant-instead") })}</p>`;
  const thread = `<div class="assistant-thread" role="log">${onEvent ? round(say("user-on-event"), p("assistant-on-event")) : replies(false)}</div>`;
  const tabs = renderInfoTabs().replace(/aria-selected="(true|false)" tabindex="-?\d" aria-controls="([a-z-]+)"/g, (_all, _was, controls: string) => `aria-selected="false" tabindex="-1" aria-controls="${controls}"`)
    .replace(`data-info-tab="${list || "info"}" aria-selected="false" tabindex="-1"`, `data-info-tab="${list || "info"}" aria-selected="true" tabindex="0"`)
    .replace(/(data-info-tab="done"[^>]*>.*?<em data-n>)0/, "$13").replace(/(data-info-tab="now"[^>]*>.*?<em data-n>)0/, "$12").replace(/(data-info-tab="next"[^>]*>.*?<em data-n>)0/, "$13");
  const lists = list ? renderInfoLists().replace(" hidden>", ">").replace("data-work-lists-title></strong>", `data-work-lists-title>${escapeHtml(uiText.text(`workbench.work-line.list-${list}`))}</strong>`)
    .replace("data-work-lists-sources></div>", `data-work-lists-sources>${kind === "offline" ? renderLineUnreadable("Feed") : ""}</div>`)
    .replace("data-work-lists-body></div>", `data-work-lists-body><div class="work-list" data-work-list-rows="${list}">${listRows(list, kind === "offline")}</div></div>`) : "";
  // With no event in front (the main conversation) 信息 says how the place stands; with one, what is known about it.
  const place = `<div class="work-card work-place-card">${renderPlaceCard({ waiting: 2, counts: { done: 3, now: 2, next: 3 }, tasks: renderTaskRow(tasks().notes) })}</div>`;
  const info = `<div class="info-pane">${kind === "main" ? place : `<div class="assistant-event-card">${onEvent ? eventCard() : liveCard()}</div>`}</div>`;
  return `<div class="mw-wls__stage"><section class="assistant-panel" data-layout="split" data-side="open" aria-label="${uiText("workbench.assistant-dock.assistant")}"><div class="assistant-body">`
    + `<div class="assistant-main"${kind === "takes" ? " data-page-takes" : ""}>${head}${kind === "takes" ? takes : ""}${thread}</div>`
    + `<aside class="assistant-side" data-info="${list || "info"}" aria-label="${escapeHtml(dock("information"))}">${tabs}${info}${lists}</aside></div></section></div>`;
}

/** The frame's body when the navigation frame is asked for `sheet=work-line`. `specimen` is that frame's own scaffolding. */
export function renderWorkLineSpecimens(specimen: Specimen): string {
  const e = events();
  const capsule = specimen("wl-event", "1", say("event-on-line"), say("event-on-line-note"),
    row(renderLineEvent(e.review) + renderLineEvent(e.upgrade) + renderLineEvent(e.fix) + renderLineEvent(e.goal) + renderLineEvent({ ...e.fix, id: "fix-current", current: true }) + renderLineEvent({ ...e.brand, id: "brand-fresh", fresh: true }))
    + row(renderLineEvent(e.quote) + renderLineEvent(e.talk) + renderLineEvent(e.exported) + renderLineEvent(e.merge))
    + row(renderLineEvent(e.plan) + renderLineEvent(e.weekly) + renderLineEvent(e.hidden) + renderLineUnreadable("Feed")));
  const stack = specimen("wl-stack", "2", say("stack"), say("stack-note"),
    `<div class="mw-wls__panels"><div class="work-stack">${renderStackCard({ id: e.quote.id, title: e.quote.title, owner: e.quote.owner, more: 0, ask: say("which-vendor"), decision: { id: "d-quote", task: "t-quote", answers: ["approve", "reject"], busy: false } })}</div>`
    + `<div class="work-stack">${renderStackCard({ id: e.talk.id, title: e.talk.title, owner: e.talk.owner, more: 2, ask: e.talk.note || e.talk.stateLabel })}</div>`
    + `<div class="work-stack">${renderStackMain({ ask: say("main-ask"), more: 0 })}</div><div class="work-stack">${renderStackLook({ n: 3, more: 0 })}</div><div class="work-stack">${renderStackEmpty()}</div></div>`);
  const lists = specimen("wl-lists", "3", say("info-lists"), say("info-lists-note"),
    `<div class="mw-wls__panels">${WORK_LIST_IDS.map(id => `<div class="mw-wls__column"><section class="work-lists"><header class="work-lists-head"><strong>${escapeHtml(uiText.text(`workbench.work-line.list-${id}`))}</strong></header><div class="work-lists-body"><div class="work-list">${listRows(id)}</div></div></section></div>`).join("")}</div>`);
  const task = specimen("wl-task-panel", "4", say("task-panel"), say("task-panel-note"), `<div class="mw-wls__panels">${taskCard()}</div>`);
  const reply = specimen("wl-reply", "5", say("under-reply"), say("under-reply-note"), `<div class="mw-wls__thread assistant-thread">${replies()}</div>`);
  const card = specimen("wl-event-card", "6", say("event-card"), say("event-card-note"),
    `<div class="mw-wls__panels"><div class="mw-wls__column">${state("card-live")}${liveCard()}</div><div class="mw-wls__column">${state("card-decision")}${eventCard()}</div><div class="mw-wls__column">${state("card-acceptance")}${acceptanceCard()}</div></div>`);
  const page = specimen("wl-event-page", "7", say("event-page"), say("event-page-note"), `<div class="mw-wls__page"><div class="work-event-page-slot">${eventPage()}</div></div>`);
  const hand = specimen("wl-hand", "8", say("hand"), say("hand-note"), `<div class="mw-wls__slot"><div class="mw-wls__hand">${handStrip()}${composer(assistant())}</div></div>`);
  const whole = specimen("wl-line", "", say("whole-line"), say("whole-line-note"),
    `${state("ok")}${line("ok")}${state("something-needs-you")}${line("wait")}${state("main-waits")}${line("main")}${state("nothing-on-line-yet")}${line("empty")}`);
  const dialogs = specimen("wl-dialog", "", say("dialog-composed"), say("dialog-composed-note"),
    `${state("conversation-main")}${dialog("main")}${state("conversation-list")}${dialog("list")}${state("conversation-event")}${dialog("event")}${state("conversation-page-takes")}${dialog("takes")}${state("disconnected")}${dialog("offline")}`);
  return capsule + stack + lists + task + reply + card + page + hand + whole + dialogs;
}

export const workLineSpecimenTitle = () => say("work-line");

/** The section's entry in the board's index. */
export const renderWorkLineIndexLink = () => `<a href="#work-line" title="${escapeHtml(say("work-line"))}">${escapeHtml(say("work-line"))}</a>`;

/**
 * Only the board's scaffolding for these specimens: rows that scroll instead of wrapping, a column as wide as the information
 * column, the box that stands for the slot above the composer, and the stage a conversation stands in. The product's
 * conversation is placed against the foot; here it stands in a stage as one sheet, at the size it has over a 640px input.
 */
export const WORK_LINE_FRAME_STYLES = `.mw-wls__row{flex-wrap:nowrap;overflow-x:auto;padding:4px 2px}
.mw-wls__panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,400px));align-items:start;gap:16px;padding:4px}
.mw-wls__column{display:flex;flex-direction:column;gap:8px;min-width:0}
.mw-wls__column>.work-lists{flex:none;max-height:360px}
.mw-wls__panels>.work-task-panel{width:auto}
.mw-wls__thread{display:flex;flex-direction:column;gap:12px;max-width:560px;padding:4px!important;font-size:14px}
.mw-wls__slot{display:flex;flex-direction:column;max-width:540px;padding:4px}
.mw-wls__hand{position:relative;margin-top:44px}
@media (max-width:760px){.mw-wls__hand{margin-top:56px}}
.mw-wls__page{height:420px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.mw-navs .work-line{min-height:64px;padding:8px 0}
.mw-wls__stage{position:relative;display:flex;align-items:flex-start;height:500px;min-width:0;padding:8px 4px;overflow:hidden}
html body.mw-navs-page .mw-wls__stage .assistant-panel[data-side]{position:relative;inset:auto;flex:0 1 1052px;min-width:0;width:auto;height:480px;max-height:none;animation:none}
html body.mw-navs-page .mw-wls__stage .assistant-body{grid-template-columns:minmax(0,1fr) min(412px,44%)}
@media (max-width:760px){.mw-wls__stage{height:560px}html body.mw-navs-page .mw-wls__stage .assistant-panel[data-side]{flex-basis:100%;height:540px}html body.mw-navs-page .mw-wls__stage .assistant-body{grid-template-columns:minmax(0,1fr) 232px}}`;

/** The board's section: the frame above, in the board's language, at a fixed height that scrolls inside. */
export function renderWorkLineSection(lang: WebLocale): string {
  return `<section class="mw-catalog__section" id="work-line" data-primitive="work-line"><h2>${escapeHtml(say("work-line"))}</h2>`
    + `<p class="mw-nav-section__note">${escapeHtml(say("section-note"))}</p>`
    + `<iframe class="mw-nav-frame" data-nav-frame src="/__ui/catalog/navigation?lang=${lang}&amp;sheet=work-line" title="${escapeHtml(say("work-line-specimen"))}" loading="lazy"></iframe></section>`;
}
