import { escapeHtml, icon, renderButton, renderMenu, renderMenuItem, renderStateRing, t as uiText, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The markup of the work line's parts (specs/work-line §4, scheme E of docs/design/work-line-32; rules in styles/work-line.ts).
 * Each function draws one part from plain values, so the component board and the product draw the same thing: the board gives
 * sample values (work-line-specimens.ts), the product will give what the line read, the task table and the conversation hold.
 * Nothing here reads a Home, knows a plugin by name or decides a state: the caller says what state a thing is in. Where a
 * drawn part rests or floats is browser/work-line-layout.ts, run after each draw.
 */

/** Who registered an event: the glyph and hue its Manifest declares (no hue: the neutral ink), and its name for a title. */
export interface LineOwnerView { readonly name: string; readonly glyph: PluginIconName; readonly hue: string }

/**
 * The states a capsule is drawn in. "" is an event with nothing behind it; `queued` and `running` have tasks waiting their turn
 * or being worked on; `done` ended. The others ask for attention and show their state as a word, at every width: `wait` needs the
 * person, `failed`, `stopped` (by the person), `verify` (it ended while disconnected, so the result is to be checked), `gone` (its
 * source no longer has it), `denied` (the person may not view it; it has no name here).
 */
export type LineEventState = "" | "queued" | "running" | "wait" | "failed" | "stopped" | "verify" | "done" | "gone" | "denied";

const ATTENTION: ReadonlySet<LineEventState> = new Set(["wait", "failed", "stopped", "verify", "gone", "denied"]);

export interface LineEventView {
  readonly id: string;
  /** Empty for a `denied` event. */
  readonly title: string;
  readonly owner: LineOwnerView;
  /** What sort of thing it is, in the owner's words (a to-do, a change, a meeting): read out with the name (WLN-17), not drawn. */
  readonly kind: string;
  readonly state: LineEventState;
  /** The state in the owner's own words, as the line read gave it this time: read out always, and drawn for a state that asks for attention. */
  readonly stateLabel: string;
  /** One short phrase after the name: the step being worked on, what is waited for, when it is due. */
  readonly note?: string;
  /** The tasks behind it that have not ended: how many, and the ring of the one that matters most. */
  readonly tasks?: { readonly count: number; readonly lead: StateRingState };
  /** Its tab is the dialog's current tab. */
  readonly current?: boolean;
  /** Just arrived on the line: plays the arrival once. */
  readonly fresh?: boolean;
  /** A next step its owner suggests, not something under way: a dashed mark, and 建议 before its note. */
  readonly suggestion?: boolean;
}

const ring = (state: StateRingState) => renderStateRing({ state, size: 14 });
const text = (className: string, value: string) => `<span class="${className}">${escapeHtml(value)}</span>`;

/** The mark of who registered a thing: its glyph on its hue. */
export const renderOwnerMark = (owner: LineOwnerView) => `<span class="work-event-mark"${owner.hue ? ` style="--event-hue:var(--hue-${escapeHtml(owner.hue)})"` : ""} aria-hidden="true">${icon(owner.glyph)}</span>`;

/**
 * One line of plain words from what may be Markdown: a place that holds one line (a card of the stack, a row, a fact) shows
 * the words only: emphasis, code and heading marks, list and quote marks go, a link keeps its words.
 */
export function plainLine(value: string): string {
  return value.replace(/```[^\n]*/gu, " ").replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/gu, "$1").replace(/^[ \t]*(?:#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gmu, "")
    .replace(/\*\*|__|~~|`/gu, "").replace(/(^|[\s（(「“])\*([^*\n]+)\*(?=$|[\s，。；：！？,.;:!?）)」”])/gmu, "$1$2").replace(/\s+/gu, " ").trim();
}

/**
 * The state marks of the foot and the conversation (§4「底栏第十三版」, helm.html): an amber dot is your turn, a red one failed,
 * a turning ring is under way, a hollow accent circle waits its turn, a hollow grey one comes next, a dashed one is a
 * suggestion, a tick is done. Colour never stands alone: the words beside it say the same.
 */
export type StateGlyph = "you" | "bad" | "run" | "wait" | "next" | "sug" | "done";
export const renderStateGlyph = (glyph: StateGlyph) => glyph === "done" ? `<span class="work-dg" data-g="done" aria-hidden="true">${icon("check")}</span>` : `<i class="work-dg" data-g="${glyph}" aria-hidden="true"></i>`;
const RING_RUN: ReadonlySet<StateRingState> = new Set(["doing", "starting", "running", "generating", "saving", "indexing", "syncing", "retrying"]);
const RING_YOU: ReadonlySet<StateRingState> = new Set(["answer", "approval", "reauth", "verify", "conflict", "partial", "interrupted"]);
const RING_BAD: ReadonlySet<StateRingState> = new Set(["failed", "blocked", "unavailable", "quarantined", "disconnected"]);
const RING_DONE: ReadonlySet<StateRingState> = new Set(["done", "saved", "round-ended", "staged"]);
const RING_WAIT: ReadonlySet<StateRingState> = new Set(["queued", "waiting"]);
/** The mark a task's ring reads as. */
export const glyphOfRing = (state: StateRingState): StateGlyph => RING_RUN.has(state) ? "run" : RING_YOU.has(state) ? "you" : RING_BAD.has(state) ? "bad" : RING_DONE.has(state) ? "done" : RING_WAIT.has(state) ? "wait" : "next";
const GLYPH_OF: Readonly<Record<LineEventState, StateGlyph>> = { "": "next", queued: "wait", running: "run", wait: "you", failed: "bad", stopped: "next", verify: "you", done: "done", gone: "next", denied: "next" };

/** The mark an event's state reads as; a suggestion is dashed whatever its owner says of it. */
export const glyphOfEvent = (event: { readonly state: LineEventState; readonly suggestion?: boolean | undefined }): StateGlyph => event.suggestion ? "sug" : GLYPH_OF[event.state];

/**
 * One event in a list: its state mark, then two lines — its name, and under it the step it is on (or what its owner says of
 * it) and what sort of thing it is. Its accessible name is the owner, the kind, the
 * title, the state and the note, so a reader hears more than a sighted person sees, never less.
 */
export function renderLineEvent(event: LineEventView): string {
  const attention = ATTENTION.has(event.state);
  // A state that asks for attention is a word on the row, not only a colour (WLN-17): it leads what the owner says of it.
  const title = plainLine(event.title);
  const stateLabel = event.stateLabel ? plainLine(event.stateLabel) : "";
  const note = event.note ? plainLine(event.note) : "";
  const said = attention && note ? `${stateLabel} · ${note}` : note || stateLabel;
  const under = (event.suggestion ? [uiText.text("workbench.work-line.suggestion"), said] : [said, event.kind || event.owner.name]).filter(Boolean).join(" · ");
  const label = [event.owner.name, event.kind, title, stateLabel, note].filter(Boolean).join(" · ");
  const mark = event.state === "denied" ? icon("lock") : renderStateGlyph(glyphOfEvent(event));
  return `<button type="button" class="work-event" data-work-event="${escapeHtml(event.id)}" data-state="${event.state}"${attention ? " data-attn" : ""}${event.suggestion ? " data-suggestion" : ""}${event.fresh ? " data-fresh" : ""}${event.current ? ' aria-current="true"' : ""} aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">`
    + `${mark}<span class="work-event-n">${text("work-event-name", title)}${under ? text("work-event-note", under) : ""}</span></button>`;
}

/** A source that could not be read stands beside the head as its own dashed item, never scrolled out of sight: the rest of the line is unaffected, and it can be tried again. */
export function renderLineUnreadable(source: string): string {
  const label = uiText.text("workbench.work-line.source-unreadable-retry", { source });
  return `<button type="button" class="work-event" data-work-line-retry data-state="unreadable" data-attn aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("circle-alert")}${text("work-event-name", source)}${text("work-event-state", uiText.text("workbench.work-line.unreadable-retry"))}${icon("refresh")}</button>`;
}

/** What the line shows is the last it knew and is being checked (WLN-29): since when, and a press asks again. */
export function renderLineChecking(since: string): string {
  const label = since ? uiText.text("workbench.work-line.checking-as-of", { time: since }) : uiText.text("workbench.work-line.checking");
  return `<button type="button" class="work-event" data-work-line-checking data-state="verify" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">${icon("refresh")}${text("work-event-name", label)}</button>`;
}

/** The three lists (§4「底栏第十三版」第 4 条): the wing each holds and its glyph. Keys inside the input while the conversation is closed, tabs of the information column while it is open. */
export const WORK_LISTS = [
  { id: "done", glyph: "done" },
  { id: "now", glyph: "run" },
  { id: "next", glyph: "next" },
] as const satisfies readonly { id: WorkLineWing; glyph: StateGlyph }[];
export type WorkLineWing = "done" | "now" | "next";
export type WorkListId = WorkLineWing;
/** 办完 shows this many events, newest first; 更早 N brings the rest. */
export const EARLIER_AFTER = 8;

/**
 * The foot of the window (specs/screen-polish §4「底栏第十三版」; specs/work-line §2): the account bar on the left (`account`,
 * drawn by the shell), the one input in the middle (`slot`) with 办完, 在办 and 接下来 and their counts inside its top right, then
 * a hairline and the key that opens the conversation (a dot on it when a reply came while it was closed, amber when the
 * Assistant waits for the person's confirmation), and the card stack of what waits for the person on the right. The lists those
 * three open are the information column's (`renderInfoLists`, in the conversation). The page draws the counts and the cards from
 * the line read (browser/work-bar.ts), so it is served with empty ones.
 */
export function renderWorkLine(line: { readonly slot: string; readonly account?: string }): string {
  const keys = WORK_LISTS.map(({ id, glyph }) => {
    const name = uiText.text(`workbench.work-line.list-${id}`);
    return `<button type="button" class="work-count" data-work-list="${id}" data-zero aria-expanded="false" aria-controls="work-lists" aria-label="${escapeHtml(uiText.text("workbench.work-line.list-count", { name, n: 0 }))}" title="${escapeHtml(name)}">${renderStateGlyph(glyph)}<span data-n>0</span></button>`;
  }).join("");
  const open = uiText.text("workbench.work-line.open-conversation");
  return `<div class="work-line" data-work-line role="region" aria-label="${uiText("workbench.work-line.foot")}"><div class="work-line-row">${line.account ?? ""}`
    + `<div class="work-line-slot" data-work-line-slot>${line.slot}<div class="work-counts" data-work-counts role="group" aria-label="${uiText("workbench.work-line.lists")}"><button type="button" class="work-count work-your-turn" data-work-stack-toggle aria-expanded="false" hidden>${icon("status-needs-you")}<span data-n>0</span></button>${keys}`
    + `<button type="button" class="work-expand" data-dialog-open aria-expanded="false" aria-controls="assistant-panel" aria-label="${escapeHtml(open)}" title="${escapeHtml(open)}">${icon("chevron-up")}<i class="work-expand-dot" data-work-expand-dot hidden></i></button></div></div>`
    + `<div class="work-side"><div class="work-stack" data-work-stack role="region" aria-label="${uiText("workbench.work-line.stack")}" aria-live="polite">${renderStackEmpty()}</div></div></div></div>`;
}

/**
 * The tabs at the top of the information column (§4「底栏第十三版」第 4 条): 信息, then 办完, 在办 and 接下来 with their counts —
 * the three the input carries while the conversation is closed. One is selected; ← → move between them.
 */
export function renderInfoTabs(): string {
  const tab = (id: "info" | WorkListId, glyph?: StateGlyph) => `<button type="button" role="tab" class="info-tab" id="info-tab-${id}" data-info-tab="${id}" aria-selected="${id === "info"}" tabindex="${id === "info" ? 0 : -1}" aria-controls="${id === "info" ? "info-pane" : "work-lists"}">`
    + `${glyph ? renderStateGlyph(glyph) : ""}<span>${uiText(id === "info" ? "workbench.work-line.info" : `workbench.work-line.list-${id}`)}</span>${id === "info" ? "" : "<em data-n>0</em>"}</button>`;
  return `<div class="info-tabs" data-info-tabs role="tablist" aria-label="${uiText("workbench.work-line.info-column")}">${tab("info")}${WORK_LISTS.map(({ id, glyph }) => tab(id, glyph)).join("")}</div>`;
}

/**
 * The list the selected tab shows, in the information column's place: one card — how many it holds with the pin that parks it
 * in the side panel, the sources that could not be read, the rows, and one quiet line that says what a press does.
 */
export function renderInfoLists(): string {
  const scopeToggle = `<div class="work-lists-scope" data-work-lists-scope role="group" aria-label="${uiText("workbench.work-line.scope-label")}" hidden>`
    + `<button type="button" data-work-scope="item" aria-pressed="true">${uiText("workbench.work-line.scope-item")}</button>`
    + `<button type="button" data-work-scope="project" aria-pressed="false">${uiText("workbench.work-line.scope-project")}</button></div>`;
  return `<section class="work-lists" id="work-lists" data-work-lists role="tabpanel" hidden><header class="work-lists-head"><small id="work-lists-title" data-work-lists-title></small>`
    + `<div class="work-lists-head-right">${scopeToggle}${iconButton("pin", uiText.text("workbench.work-line.park-list"), { "data-work-lists-pin": "" })}</div></header><div class="work-lists-sources" data-work-lists-sources></div><div class="work-lists-body" data-work-lists-body></div>`
    + `<p class="work-lists-foot" data-work-lists-foot></p></section>`;
}

/** A list parked in the side panel: its name, the way back into the conversation and its close; the page keeps its rows as the list's own. */
export function renderParkedList(list: { readonly id: WorkListId; readonly rows: string }): string {
  const name = uiText.text(`workbench.work-line.list-${list.id}`);
  return `<article class="work-card work-card--list" data-parked-list="${list.id}" aria-label="${escapeHtml(name)}"><div class="work-card-head"><span class="work-card-name"><strong>${escapeHtml(name)}</strong></span>`
    + `${iconButton("message", uiText.text("workbench.work-line.back-to-dialog"), { "data-list-unpark": list.id })}${iconButton("x", uiText.text("workbench.work-line.close"), { "data-list-close": list.id })}</div><div class="work-list" data-parked-rows>${list.rows}</div></article>`;
}

/** The head of a group inside a list: 不属于事件 at the end of 在办. */
export const renderListGroup = (label: string) => `<p class="work-list-group">${escapeHtml(label)}</p>`;

/** The end of 办完 when more than `EARLIER_AFTER` are done: the rest, on a press. */
export const renderListEarlier = (n: number) => `<button type="button" class="work-lists-earlier" data-work-lists-earlier>${uiText("workbench.work-line.earlier-n", { n })}</button>`;

/** The stack with nothing in it: the same block, one quiet line. */
export const renderStackEmpty = () => `<p class="work-stack-empty">${icon("check")}<span>${uiText("workbench.work-line.stack-empty")}</span></p>`;

export interface StackCardView {
  readonly id: string; readonly title: string; readonly owner: LineOwnerView;
  /** How many more wait behind this card. */
  readonly more: number;
  /** What is asked: a task's question, or the owner's word on why the event waits. */
  readonly ask: string;
  /** The question a task asks, answered on the card: at most two answers (POLISH-44); anything more opens the event. */
  readonly decision?: { readonly task: string; readonly id: string; readonly busy: boolean; readonly answers: readonly ("approve" | "reject")[] };
}

/**
 * The card in front of the stack (§4「底栏第十三版」第 5 条; prototype helm.html, screen 34): the owner's mark and the event's
 * name, 该你 · 还有 N 件 › (the next card to the front), what is asked with its answers, and 打开 › (the event's own place). An
 * answer is the same decision as on the event's card (WLN-10): the page's one handler for `[data-task-decision]` sends it.
 */
export function renderStackCard(card: StackCardView): string {
  const more = card.more > 0
    ? `<button type="button" class="work-stack-more" data-work-stack-next>${uiText("workbench.work-line.your-turn-more", { n: card.more })}${icon("chevron-right")}</button>`
    : `<span class="work-stack-more">${uiText("workbench.work-line.your-turn")}</span>`;
  const answers = card.decision?.answers.map(role => renderButton({ variant: "secondary", size: "sm", label: uiText.text(`workbench.work-line.decision-${role}`), attrs: { "data-decision-answer": role, ...(card.decision?.busy ? { disabled: "" } : {}) } })).join("") ?? "";
  const said = plainLine(card.ask), ask = `<p class="work-stack-ask" title="${escapeHtml(said)}">${escapeHtml(said)}</p>`;
  return `<article class="work-stack-card" data-work-stack-card="${escapeHtml(card.id)}"${card.more > 0 ? ` data-behind="${Math.min(card.more, 2)}"` : ""} aria-label="${escapeHtml(card.title)}">`
    + `<div class="work-stack-head">${renderOwnerMark(card.owner)}<strong title="${escapeHtml(card.title)}">${escapeHtml(card.title)}</strong>${more}</div>`
    + `<div class="work-stack-body"${card.decision ? ` data-task-decision="${escapeHtml(card.decision.id)}" data-task="${escapeHtml(card.decision.task)}"${card.decision.busy ? ' aria-busy="true"' : ""}` : ""}>${ask}${answers}`
    + `<button type="button" class="work-stack-open" data-work-stack-open="${escapeHtml(card.id)}">${uiText("workbench.work-line.open")}${icon("chevron-right")}</button></div></article>`;
}

/**
 * The stack's card for the Assistant's main conversation while it waits for the person's confirmation (第九节「等你的有哪几种」;
 * user decision 2026-11-21, scheme A): an amber dot, 助理在等你确认, what it asks in one line, and 打开 ›, which opens that
 * conversation. The answer is given there, where the confirmation card is: the stack offers none.
 */
export function renderStackMain(card: { readonly ask: string; readonly more: number }): string {
  return stackNote({ id: "main", title: uiText.text("workbench.work-line.assistant-waits-confirm"), ask: card.ask, more: card.more, open: "data-work-stack-main" });
}

/**
 * The stack's last card of this place: the objects that want a look and are not already a card of the stack (第九节「等你的有哪几种」,
 * the bell's objects; user 2026-11-17 第 19 条). One card for all of them, with how many, and 打开 ›, which opens their list —
 * each object's own short form on a card comes with the owners' declarations (53-2).
 */
export function renderStackLook(card: { readonly n: number; readonly more: number }): string {
  return stackNote({ id: "look", title: uiText.text("workbench.work-line.to-look-at", { n: card.n }), ask: uiText.text("workbench.work-line.to-look-at-note"), more: card.more, open: "data-work-stack-look" });
}

/** Tail card of the stack when other work items also wait on the person (MLN-17): opens the top-left switcher. */
export function renderStackOtherItems(card: { readonly n: number; readonly more: number }): string {
  return stackNote({
    id: "other-items",
    title: uiText.text("workbench.work-line.other-items-waiting", { n: card.n }),
    ask: uiText.text("workbench.work-line.other-items-waiting-note"),
    more: card.more,
    open: "data-work-stack-other",
    openLabel: uiText.text("workbench.work-line.open-switcher"),
  });
}

function stackNote(card: { readonly id: "main" | "look" | "other-items"; readonly title: string; readonly ask: string; readonly more: number; readonly open: string; readonly openLabel?: string }): string {
  const said = plainLine(card.ask);
  const more = card.more > 0
    ? `<button type="button" class="work-stack-more" data-work-stack-next>${uiText("workbench.work-line.your-turn-more", { n: card.more })}${icon("chevron-right")}</button>`
    : `<span class="work-stack-more">${uiText("workbench.work-line.your-turn")}</span>`;
  return `<article class="work-stack-card" data-work-stack-card="${card.id}" data-${card.id}${card.more > 0 ? ` data-behind="${Math.min(card.more, 2)}"` : ""} aria-label="${escapeHtml(card.title)}">`
    + `<div class="work-stack-head"><span class="work-stack-dot" aria-hidden="true"></span><strong title="${escapeHtml(card.title)}">${escapeHtml(card.title)}</strong>${more}</div>`
    + `<div class="work-stack-body"><p class="work-stack-ask" title="${escapeHtml(said)}">${escapeHtml(said)}</p>`
    + `<button type="button" class="work-stack-open" ${card.open}${card.id === "look" ? ' aria-haspopup="true"' : ""}>${escapeHtml(card.openLabel ?? uiText.text("workbench.work-line.open"))}${icon("chevron-right")}</button></div></article>`;
}

export interface TaskRowView {
  readonly id: string;
  readonly title: string;
  readonly ring: StateRingState;
  /** The step it is on or why it waits, then who is doing it. */
  readonly step: string;
  /** 1: a task under its event; 2: a step a task gave a sub-agent, under its task. */
  readonly level?: 1 | 2;
  /** A sub-agent's step: what opens its own conversation (the page's key for it); the row then opens that, not a task's card. */
  readonly sub?: string;
  readonly done?: boolean;
  /** The one control the row offers in place: stop while it runs, retry once it failed, "decide" where it waits on the person. */
  readonly control?: "stop" | "retry" | "decide";
  /** This page is waiting for the offered control's response or its subsequent owner read. */
  readonly busy?: boolean;
  /** The connection is lost: the row says it is being checked and offers nothing to press. */
  readonly checking?: boolean;
  /** Owning work item label shown neutrally in 「在办」 (Decision 48 ⑥, design-language-37). */
  readonly item?: string;
}

/**
 * One task, wherever it is listed (a list of the information column, 在办 of an event's information): its ring, its name, then the
 * step it is on and who does it, on one row that never wraps, and the control it offers in place. A press opens the task's card
 * (a sub-agent's step: its own conversation) in the float that takes the information column's place.
 */
export function renderTaskRow(row: TaskRowView): string {
  const step = row.checking ? uiText.text("workbench.work-line.checking") : row.step && plainLine(row.step);
  const control = row.control && !row.checking ? `<button type="button" class="work-task-row-key"${row.control === "decide" ? " data-lead" : ""} data-task-control="${row.control}" data-task="${escapeHtml(row.id)}"${row.busy ? " disabled" : ""}>${uiText(`workbench.work-line.${row.control === "decide" ? "go-handle" : row.control}`)}</button>` : "";
  const itemTag = row.item ? `<span class="work-task-row-item" title="${escapeHtml(row.item)}">${escapeHtml(row.item)}</span>` : "";
  const label = [row.title, row.item, step].filter(Boolean).join(" · ");
  return `<div class="work-task-row" data-level="${row.level ?? 1}" data-state="${row.done ? "done" : "live"}"><button type="button" class="work-task-row-main" ${row.sub ? `data-subtask-open="${escapeHtml(row.sub)}"` : `data-task-open="${escapeHtml(row.id)}"`}${row.checking ? " disabled" : ""} title="${escapeHtml(label)}">${renderStateGlyph(row.checking ? "wait" : row.done ? "done" : glyphOfRing(row.ring))}`
    + `<b class="work-task-row-title">${escapeHtml(row.title)}</b>${itemTag}${step ? `<small class="work-task-row-step">${escapeHtml(step)}</small>` : ""}</button>${control}</div>`;
}

export interface TaskDecisionView {
  /** The task that asks, and the owner's id of what it asks. */
  readonly task: string; readonly id: string;
  readonly reference?: { readonly id: string; readonly version: string };
  readonly ask: string; readonly why?: string;
  /** Rendered by the Host from the review queue. */
  readonly reviewHtml?: string;
  /** The asking task's name, where the card is not that task's own. */
  readonly from?: string;
  readonly changes: readonly { readonly label: string; readonly value: string }[];
  /** The answers the owner offers; none: the person decides where the task opens. */
  readonly answers: readonly ("approve" | "revise" | "reject")[];
  /** The first decision a card lists carries its one primary button. */
  readonly lead: boolean;
  /** 「改一下」 was pressed: the field for the words stands in place of the answers. */
  readonly revising: boolean;
  readonly busy: boolean;
}

/**
 * What a task that stopped asks the person (specs/work-line §4.4, WLN-10): the question, why, what agreeing would change — one
 * place a line — and the answers. Agreeing is the card's one primary button; a waiting state is said by the ring and the words.
 */
export function renderTaskDecision(view: TaskDecisionView): string {
  const say = (key: string, values?: Record<string, string | number>) => uiText.text(`workbench.work-line.${key}`, values);
  const button = (role: string, variant: "primary" | "secondary", attrs: Record<string, string>) => renderButton({ variant, size: "sm", label: say(`decision-${role}`), attrs: { ...attrs, ...(view.busy ? { disabled: "" } : {}) } });
  const why = [view.from ? say("decision-from", { task: view.from }) : "", view.why ? say("decision-why", { why: view.why }) : ""].filter(Boolean).join(" · ");
  const changes = view.changes.map(line => {
    const words = [line.label, line.value].filter(Boolean).join(" ");
    return `<li title="${escapeHtml(words)}">${icon("edit")}<span><b>${escapeHtml(line.label)}</b> ${escapeHtml(line.value)}</span></li>`;
  }).join("");
  const answers = view.revising
    ? `<textarea class="work-decision-note" data-decision-note rows="2" maxlength="2000" aria-label="${escapeHtml(say("decision-how"))}" placeholder="${escapeHtml(say("decision-how"))}"${view.busy ? " disabled" : ""}></textarea>`
      + `<div class="work-card-actions">${button("send", "primary", { "data-decision-send": "" })}${button("cancel", "secondary", { "data-decision-cancel": "" })}</div>`
    : `<div class="work-card-actions">${view.answers.length
      ? view.answers.map(role => button(role, role === "approve" && view.lead ? "primary" : "secondary", { "data-decision-answer": role })).join("")
      : renderButton({ variant: view.lead ? "primary" : "secondary", size: "sm", label: say("go-handle"), attrs: { "data-decision-go": "" } })}</div>`;
  return `<section class="work-decision" data-task-decision="${escapeHtml(view.id)}" data-task="${escapeHtml(view.task)}"${view.reference ? ` data-review-reference="${escapeHtml(view.reference.id)}" data-review-version="${escapeHtml(view.reference.version)}"` : ""}${view.reviewHtml ? " data-task-held-review" : ""} aria-label="${escapeHtml(view.ask)}"${view.busy ? ' aria-busy="true"' : ""}>`
    + (view.reviewHtml ? "" : `<p class="work-decision-ask" title="${escapeHtml(plainLine(view.ask))}">${escapeHtml(plainLine(view.ask))}</p>`)
    + (changes ? `<ul class="work-decision-changes" aria-label="${escapeHtml(say("decision-changes"))}">${changes}</ul>` : "")
    + (view.reviewHtml ? `<div class="work-decision-changes">${view.reviewHtml}</div>` : "")
    + (why ? `<small class="work-decision-why" title="${escapeHtml(why)}">${escapeHtml(why)}</small>` : "") + answers + `</section>`;
}

const iconButton = (glyph: PluginIconName, label: string, attrs: Record<string, string>) => renderButton({ variant: "ghost", size: "sm", icon: glyph, iconOnly: true, label, attrs });

/** One step of a task's breakdown: done, the one being worked on (with its ring), or still to do; `who` says who does it where a card lists several doers. */
export interface TaskStepView { readonly name: string; readonly at: "done" | "current" | "todo"; readonly ring?: StateRingState; readonly who?: string }

/** A task's breakdown, one step a row. */
export function renderTaskSteps(steps: readonly TaskStepView[]): string {
  return steps.map(step => `<div class="work-task-step" data-step="${step.at}">${ring(step.at === "done" ? "done" : step.at === "current" ? step.ring ?? "running" : "idle")}${text("work-task-step-name", plainLine(step.name))}${step.who ? text("work-task-step-who", step.who) : ""}</div>`).join("");
}

export interface TaskCardView {
  readonly id: string;
  readonly title: string;
  readonly owner: LineOwnerView;
  readonly ring: StateRingState;
  readonly state: string;
  readonly who: string;
  /** The event it is done for, in words (a new event, none, or for which event). */
  readonly serves: string;
  readonly returnsTo: string;
  readonly steps: readonly TaskStepView[];
  /** The buttons at the card's foot, drawn by the caller: stop, add a note, retry this step, open in its plugin. */
  readonly actions: string;
  /** What it asks the person to decide, drawn by the caller with `renderTaskDecision`; it stands first. */
  readonly decisions?: string;
}

/** One task's card, in the float that takes the information column's place, with the way back to what the column showed. The head holds only its name; its state stands with the other facts. */
export function renderTaskCard(card: TaskCardView): string {
  const steps = renderTaskSteps(card.steps), under = [plainLine(card.state), card.serves].filter(Boolean).join(" · ");
  const fact = (key: string, value: string, more = "") => `<dt>${uiText(`workbench.work-line.${key}`)}</dt><dd>${more}<span title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
  return `<section class="work-task-panel" id="work-task-panel" data-task-panel data-task-card="${escapeHtml(card.id)}" role="dialog" aria-label="${escapeHtml(card.title)}">`
    + `<header class="work-task-panel-head">${iconButton("back", uiText.text("workbench.work-line.back"), { "data-task-panel-close": "" })}${renderStateGlyph(glyphOfRing(card.ring))}<span class="work-task-panel-n"><b class="work-task-panel-title" title="${escapeHtml(card.title)}">${escapeHtml(card.title)}</b>${under ? `<small title="${escapeHtml(under)}">${escapeHtml(under)}</small>` : ""}</span></header>`
    + `<div class="work-task-panel-body" data-card>${card.decisions ?? ""}<dl class="work-task-facts">${fact("state", plainLine(card.state), ring(card.ring))}</dd>${fact("who", card.who)}</dd>`
    + `${fact("for-event", card.serves)}${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": card.id, "aria-haspopup": "menu" } })}</dd>`
    + `${fact("returns-to", card.returnsTo)}</dd></dl><div data-task-acceptance hidden></div>`
    + `${steps ? `<div class="work-card-section"><h4>${uiText("workbench.work-line.steps")}</h4>${steps}</div>` : ""}${card.actions ? `<div class="work-card-actions">${card.actions}</div>` : ""}</div></section>`;
}

/** Where a task can go from its card (specs/work-line §4.5): an event of the line, an event of its own, or none. The one it is on now is ticked. */
export function renderPlaceMenu(menu: { readonly task: string; readonly events: readonly { readonly id: string; readonly title: string; readonly current: boolean }[]; readonly own: boolean; readonly none: boolean }): string {
  const to = (kind: string, label: string, checked: boolean, event?: string) => renderMenuItem({ label, checked, attrs: { "data-place-to": kind, ...(event ? { "data-place-event": event } : {}) } });
  return renderMenu({ className: "work-place-menu", attrs: { "data-place-menu": menu.task, "aria-label": uiText.text("workbench.work-line.for-event") },
    items: menu.events.map(event => to("event", event.title, event.current, event.id)).join("")
      + to("new_event", uiText.text("workbench.work-line.register-as-event"), menu.own) + to("none", uiText.text("workbench.work-line.no-event"), menu.none) });
}

/** The float that takes the information column's place (a task's card, a sub-agent's conversation); the layout script lays it over the column. `dialog` is the dialog's element id. */
export const renderTaskFloat = (dialog: string, panel: string) => `<div class="work-task-float" data-work-task-float="${escapeHtml(dialog)}">${panel}</div>`;

/**
 * Where the Assistant put a piece of work (WLN-32): added to a task of an event that exists, done for an event, a new event on
 * the line, another work item, or no event at all (then it is only in the background tasks). `name` is the event's, or the
 * other work item's.
 */
export type ReplyPlacement = { readonly kind: "supplement" | "for-event" | "new-event" | "other-item"; readonly name: string } | { readonly kind: "none" };

const PLACED_GLYPH = { "supplement": "pin", "for-event": "pin", "new-event": "plus", "other-item": "folder", "none": "list" } as const satisfies Record<ReplyPlacement["kind"], PluginIconName>;

/** Under a reply: where the work was placed, with "change". */
export function renderReplyPlaced(placed: { readonly task: string; readonly where: ReplyPlacement }): string {
  const where = placed.where.kind === "none" ? uiText.text("workbench.work-line.placed-none") : uiText.text(`workbench.work-line.placed-${placed.where.kind}`, { name: placed.where.name });
  return `<div class="work-reply-placed" data-placed="${placed.where.kind}">${icon(PLACED_GLYPH[placed.where.kind])}<span class="work-reply-placed-where" title="${escapeHtml(where)}">${escapeHtml(where)}</span>`
    + `${renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.change"), attrs: { "data-place-change": placed.task, "aria-haspopup": "menu" } })}</div>`;
}

/**
 * In the main conversation, where a task done for an event on the line waits on the person (WLN-06; user decision 2026-11-15):
 * the platform writes this row itself, with no model, at once — one per task and decision — with 「去处理」, which opens the
 * event's tab. Once the task no longer waits it folds into a line that says so, with nothing to press.
 */
export function renderReplyWaiting(row: { readonly key: string; readonly task: string; readonly event: string; readonly settled: boolean }): string {
  const words = row.settled ? uiText.text("workbench.work-line.waiting-settled", { task: row.task }) : uiText.text("workbench.work-line.waiting-on-you", { task: row.task, event: row.event });
  return `<div class="work-reply-waiting" role="status" data-waiting="${row.settled ? "settled" : "open"}">${ring(row.settled ? "done" : "answer")}<span class="work-reply-waiting-text" title="${escapeHtml(words)}">${escapeHtml(words)}</span>`
    + (row.settled ? "" : renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.work-line.go-handle"), attrs: { "data-waiting-go": row.key, "aria-label": uiText.text("workbench.work-line.go-handle-task", { task: row.task }) } })) + "</div>";
}

/** Above a reply the Assistant gave by itself: which task handed back, or which task failed. */
export function renderReplyReturned(task: string, failed = false): string {
  return `<span class="work-reply-returned"${failed ? ' data-state="failed"' : ""}>${icon(failed ? "circle-alert" : "refresh")}${text("work-reply-returned-name", uiText.text(failed ? "workbench.work-line.task-failed" : "workbench.work-line.handed-back-task", { task }))}</span>`;
}

/** Under a reply: the Assistant carried on within what was asked, and how many times it may still do so by itself. */
export function renderReplyCarried(round: number, most: number): string {
  return `<div class="work-reply-carried">${icon("zap")}<span>${escapeHtml(uiText.text("workbench.work-line.carried-within-request-n-of-most", { n: round, most }))}</span></div>`;
}

/**
 * What is known about an event, as the information column shows it under 信息 and as it stays in the side panel once parked
 * (specs/work-line §2「这件事的信息」): 该你做的 — what the tasks behind it ask, or its owner's display when the owner says it
 * waits — shown only when something is asked; then 这件事现在怎样 — who registered it and how it stands, the pin that parks it,
 * and the body the caller draws. Parked (`parked`) it names the event and carries the way back to the conversation and its close.
 */
export function renderEventCard(card: { readonly id: string; readonly facts: string; readonly body: string; readonly parked?: boolean; readonly title?: string; readonly mark?: string }): string {
  const id = escapeHtml(card.id);
  const buttons = card.parked
    ? iconButton("message", uiText.text("workbench.work-line.back-to-dialog"), { "data-event-unpark": card.id }) + iconButton("x", uiText.text("workbench.work-line.close"), { "data-event-close": card.id })
    : iconButton("pin", uiText.text("workbench.work-line.park-side-panel"), { "data-event-park": card.id });
  return `<article class="work-card" data-event-card="${id}"${card.parked ? " data-parked" : ""}>`
    + `<section class="work-card-part work-card-ask" data-card-ask hidden><h4 data-card-ask-title>${uiText("workbench.work-line.asked-of-you")}</h4><div class="work-card-decisions" data-card-decisions hidden></div><div data-card-ask-body></div></section>`
    + `<section class="work-card-part work-card-now"><div class="work-card-part-head"><h4>${uiText("workbench.work-line.how-it-stands")}</h4>${buttons}</div>`
    + `<div class="work-card-name" data-card-name>${card.parked ? `${card.mark ?? ""}<strong title="${escapeHtml(card.title ?? "")}">${escapeHtml(card.title ?? "")}</strong>` : ""}</div>`
    + `<p class="work-card-facts" title="${escapeHtml(card.facts)}">${escapeHtml(card.facts)}</p>${card.body}</section></article>`;
}

/**
 * 信息 with no event in front (specs/work-line §2「这件事的信息」, last sentence): how the place stands — how many wait for the
 * person, are under way, come next and are done — and the tasks handed out from the main conversation, which belong to no event.
 * A count that names a list opens that list; 该你 is the card stack beside it and is not a key.
 */
export function renderPlaceCard(card: { readonly waiting: number; readonly counts: Readonly<Record<WorkListId, number>>; readonly tasks: string }): string {
  const lists = { now: WORK_LISTS[1], next: WORK_LISTS[2], done: WORK_LISTS[0] } as const;
  const key = (id: WorkListId) => `<button type="button" class="work-place-n" data-place-list="${id}"${card.counts[id] ? "" : " data-zero"}>${renderStateGlyph(lists[id].glyph)}<span>${uiText(`workbench.work-line.list-${id}`)}</span><em>${card.counts[id]}</em></button>`;
  return `<section class="work-card-part work-card-now work-place"><div class="work-card-part-head"><h4>${uiText("workbench.work-line.place-stands")}</h4></div>`
    + `<div class="work-place-counts"><span class="work-place-n"${card.waiting ? " data-waits" : " data-zero"}>${renderStateGlyph("you")}<span>${uiText("workbench.work-line.your-turn")}</span><em>${card.waiting}</em></span>${key("now")}${key("next")}${key("done")}</div>`
    + `${card.tasks ? `<div class="work-card-tasks"><small>${uiText("workbench.work-line.handed-from-here")}</small>${card.tasks}</div>` : ""}</section>`;
}

/**
 * 上下文, the last card of 信息 (§4「底栏第十三版」第 5 条): who the words go to, how it works, what the next words carry and
 * where the work is kept — four quiet rows the page fills from what the input is set to. They are read here and chosen at the
 * input (给谁, ＋); a row with nothing to say is left out.
 */
export function renderContextCard(): string {
  const row = (id: string) => `<div class="info-context-row" data-context-row="${id}" hidden><dt>${uiText(`workbench.work-line.context-${id}`)}</dt><dd data-context-value></dd></div>`;
  return `<section class="info-context" data-info-context aria-labelledby="info-context-title"><h4 id="info-context-title">${uiText("workbench.assistant-dock.context-title")}</h4><dl>${row("who")}${row("way")}${row("carry")}${row("place")}</dl></section>`;
}

/**
 * The page the platform draws for an event whose owner has no page of its own (specs/work-line §2「焦点」; POLISH-68): two
 * columns — what the owner gave (its composed display with the actions it declared, or its own words, and what is asked of the
 * person first), then who registered it, how it stands, where it is kept and the tasks done for it. One column when narrow, the
 * owner's part first. The hooks are the event card's own, so one reader paints the column, a parked card and this page.
 */
export function renderEventPage(page: { readonly id: string; readonly place: string }): string {
  const id = escapeHtml(page.id), say = (key: string) => uiText(`workbench.work-line.${key}`);
  return `<article class="work-event-page" data-event-card="${id}" data-event-page><div class="work-event-page-sheet">`
    + `<header class="work-event-page-head"><h2 data-card-name></h2></header>`
    + `<div class="work-event-page-cols"><div class="work-event-page-main">`
    + `<section class="work-card-part work-card-ask" data-card-ask hidden><h4 data-card-ask-title>${say("asked-of-you")}</h4><div class="work-card-decisions" data-card-decisions hidden></div><div data-card-ask-body></div></section>`
    + `<section class="work-event-page-owner" data-card-body-home><div class="work-card-body" data-card-body></div><div class="work-card-own" data-card-own hidden></div><div class="work-card-result" data-card-result hidden></div>`
    + `<p class="work-event-page-none" data-card-nothing hidden>${say("event-page-nothing-more")}</p></section></div>`
    + `<aside class="work-event-page-side"><p class="work-card-facts" hidden></p><dl class="work-event-page-facts"><dt>${say("fact-registered")}</dt><dd data-fact-owner></dd><dt>${say("fact-now")}</dt><dd data-fact-state></dd>`
    + (page.place ? `<dt>${say("kept-in")}</dt><dd title="${escapeHtml(page.place)}">${escapeHtml(page.place)}</dd>` : "")
    + `</dl><div data-card-tasks hidden></div><div data-card-acceptance hidden></div></aside></div></div></article>`;
}

/**
 * What the event's owner registered about it — its words and its facts (a todo's notes, the day it is planned for) — where the
 * owner declared no fuller display for a conversation (POLISH-22): the card and the page say it in the owner's own words.
 */
export function renderCardOwn(own: { readonly words: string; readonly facts: readonly (readonly [string, string])[] }): string {
  return (own.words ? `<p class="work-card-own-words">${escapeHtml(own.words)}</p>` : "")
    + (own.facts.length ? `<dl class="work-card-own-facts">${own.facts.map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join("")}</dl>` : "");
}

/**
 * What the card of something done offers (WLN-11): the result in its owner's own words where the owner declared no display, the
 * way to open it as a tab, and the way to put it on the Shelf (said as done once it is there).
 */
export function renderCardResult(result: { readonly id: string; readonly preview: string; readonly open: boolean; readonly shelf: "" | "busy" | "done" }): string {
  const say = (key: string) => uiText.text(`workbench.work-line.${key}`), id = escapeHtml(result.id);
  return `${result.preview ? `<div class="work-card-quote work-card-preview">${escapeHtml(result.preview)}</div>` : ""}<div class="work-card-actions">`
    + (result.open ? renderButton({ variant: "secondary", size: "sm", icon: "external", label: say("open-as-tab"), attrs: { "data-event-open": id } }) : "")
    + renderButton({ variant: "secondary", size: "sm", icon: result.shelf === "done" ? "check" : "bookmark", label: say(result.shelf === "done" ? "on-shelf" : "put-on-shelf"), attrs: { "data-event-shelve": id, ...(result.shelf ? { disabled: "" } : {}) } }) + "</div>";
}

/** How it was done, under what was done: the rows of the tasks behind a finished event, folded until asked for (WLN-11). */
export function renderCardProcess(rows: string): string {
  return `<details class="work-card-section work-card-process"><summary>${uiText("workbench.work-line.process")}</summary>${rows}</details>`;
}
