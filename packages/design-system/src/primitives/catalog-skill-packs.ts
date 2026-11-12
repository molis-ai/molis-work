// The board's parts for skill packs (docs/design/skill-packs/README.md「组件板新增」, decided by the user 2026-11-04: A's enable
// step and C's catalog): the three-way choice under an item row's words, a fold inside an item row, the list-and-detail page,
// buttons inside an alert and a link beside a status mark. Like the item rows they are built on (catalog-patterns.ts) they live on
// the board first: the rules below are the board's own (not in the served sheets) and move into the page sheets with the first
// product page that draws them (the 08 batch's settings section and install review). Every control is an existing one; these
// rules only place them. The status tones follow the README's table: auto and manual only are both settings in use (idle /
// ready), off is paused (quiet / paused), unavailable with something to do in place is hold / unavailable, and unavailable with
// only uninstall or reinstall left is blocked / blocked, told apart by its words as well.
import { escapeHtml, icon, renderButton, renderEmpty, renderRadioGroup, renderStatusMark, type MwStatusTone, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderCollapsible, renderToggleGroup } from "./navigation.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";

export const SKILL_PACK_BOARD_STYLES = `
  /* 1 · An item row whose words stack (name, what it is for, its marks) with the three-way choice under them, not at the row's end:
     the choice is the row's one control, and under the words it keeps the same place whatever the name's length. The name wraps
     instead of being cut: a finger has no hover to read a cut name by. */
  .mw-item.mw-item--stack { align-items: flex-start; flex-wrap: wrap; row-gap: 0; padding-block: 10px; }
  .mw-item--stack > .mw-mark { margin-top: 2px; }
  .mw-item.mw-item--stack > span:nth-child(2) { display: grid; gap: 4px; flex: 1 1 0; align-items: start; }
  .mw-item--stack > span:nth-child(2) > small { white-space: normal; text-wrap: pretty; }
  .mw-item.mw-item--stack > span:nth-child(2) > strong { overflow: visible; white-space: normal; text-overflow: clip; overflow-wrap: break-word; line-height: 1.45; }
  .mw-item--stack[data-off] strong { color: var(--muted); }
  /* The choice's own row in the item, indented to the words where there is room. */
  .mw-item > .mw-item__under { display: flex; flex: 1 0 100%; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; margin-top: 8px; padding-left: 44px; }
  .mw-item__under > .mw-alert { flex: 1 1 100%; }
  .mw-item__under .mw-toggle { white-space: nowrap; }

  /* 2 · A fold inside an item row: indented to the words (the 32px mark and the row's 12px gap), its summary a quiet 13px action
     instead of the standalone fold's 12px of room above and below. Its readable name carries the item's name. */
  .mw-item > .mw-item__more { flex: 1 0 100%; min-width: 0; padding: 0 0 0 44px; }
  .mw-item__more > summary { padding: 4px 0; color: var(--muted); font-size: 13px; }
  .mw-item__more > summary:hover { color: var(--ink-soft); }
  .mw-item__more > summary:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
  .mw-item__more .mw-collapsible__body { padding: 4px 0 6px; }
  .mw-facts { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; margin: 0; max-width: 640px; font-size: 13px; line-height: 1.55; }
  .mw-facts dt { color: var(--muted); font-size: 12px; }
  .mw-facts dd { min-width: 0; margin: 0 0 8px; color: var(--ink); overflow-wrap: anywhere; }
  .mw-facts dd:last-child { margin-bottom: 0; }
  .mw-facts code { font-size: 12px; }
  .mw-facts ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
  .mw-facts li { display: flex; flex-wrap: wrap; gap: 2px 10px; }
  .mw-facts li > span { color: var(--muted); font-size: 12px; }
  .mw-facts blockquote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line); color: var(--ink-soft); }

  /* 4 · Buttons inside an alert: under its words, so the next step reads as the answer to what the alert says. */
  .mw-alert__problems { display: grid; gap: 2px; margin: 4px 0 0; padding-left: 18px; color: var(--ink-soft); }
  .mw-alert__problems code { overflow-wrap: anywhere; }

  /* 5 · A link beside a status mark: one paragraph that starts with the mark, so the mark, its reason and the link share a line
     while they fit and wrap as words when they do not. The link's padding reaches a finger without taking line room. */
  .mw-status-line { margin: 0; min-width: 0; color: var(--ink-soft); font-size: 12px; line-height: 20px; text-wrap: pretty; }
  .mw-status-line > .mw-status { margin-right: 6px; vertical-align: middle; }
  .mw-status-line > .mw-btn--link { --reach: 6px; min-height: 0; margin-left: 6px; padding-block: var(--reach); margin-block: calc(-1 * var(--reach)); font-size: 13px; line-height: 20px; vertical-align: middle; }

  /* 3 · List and detail: the list on the left keeps each entry a list item (a screen reader says "3 of 5") and a real button fills
     it; the detail on the right is everything about one entry. Where the room is narrow it is one side at a time. */
  .mw-list-detail { container: mw-list-detail / inline-size; min-width: 0; }
  .mw-list-detail__body { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 20px; align-items: start; min-width: 0; }
  .mw-list-detail__list { min-width: 0; }
  .mw-list-detail__list > .mw-items { width: 100%; }
  .mw-item.mw-item--pick { min-height: 0; padding: 0; }
  .mw-item--pick:is(:hover, :focus-within) { background: transparent; }
  .mw-item__pick { appearance: none; display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 44px; margin: 0; padding: 6px 8px 6px 10px; border: 0; border-radius: var(--sk-r-item, 8px); background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; transition: background-color var(--dur-hover) var(--ease-quint); }
  .mw-item__pick:hover { background: var(--nav-hover); }
  .mw-item__pick[aria-current="true"] { background: var(--nav-active); }
  .mw-item__pick:active:not(:disabled) { background: var(--nav-press); }
  .mw-item__pick:focus-visible { outline: var(--focus-stroke); outline-offset: -2px; }
  .mw-item__pick > span:nth-child(2) { display: grid; gap: 1px; flex: 1 1 0; min-width: 0; }
  /* The name wraps as it is; the pack it lives in takes one line, cut where room runs out, its whole name on hover. */
  .mw-item__pick > span:nth-child(2) > strong { overflow: visible; white-space: normal; overflow-wrap: break-word; line-height: 1.4; }
  .mw-item__pick > span:nth-child(2) > small { flex: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .mw-item__pick > .mw-item__end { color: inherit; }
  .mw-list-detail__detail { display: grid; gap: 14px; align-content: start; min-width: 0; padding: 4px 4px 4px 20px; border-left: 1px solid var(--line); }
  .mw-list-detail__detail[hidden] { display: none; }
  /* Only when another entry is chosen; the first view and a reload show the detail at once. */
  .mw-list-detail__detail.is-entering { animation: craft-rise var(--dur-move) var(--ease-quint); }
  .mw-list-detail__detail > header { display: grid; gap: 6px; }
  .mw-list-detail__detail h3 { margin: 0; color: var(--ink); font-size: 20px; font-weight: var(--weight-title, 600); line-height: 1.4; overflow-wrap: anywhere; }
  .mw-list-detail__detail h3:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; border-radius: 4px; }
  .mw-list-detail__detail[data-off] h3 { color: var(--muted); }
  .mw-list-detail__detail > header > p { margin: 0; max-width: 640px; color: var(--ink-soft); font-size: 13px; line-height: 1.55; }
  /* The radios fade by their own .42; their words go muted, as the title does, without a second opacity. */
  .mw-list-detail__detail .mw-radio-group:disabled .mw-check-row { color: var(--muted); }
  .mw-list-detail__used { margin: 0; color: var(--muted); font-size: 12px; }
  .mw-list-detail__detail > .mw-list-detail__back { display: none; justify-self: start; }
  @container mw-list-detail (max-width: 640px) {
    .mw-list-detail__body { grid-template-columns: minmax(0, 1fr); }
    .mw-list-detail__detail { padding: 0; border-left: 0; }
    .mw-list-detail:not([data-detail]) .mw-list-detail__detail { display: none; }
    .mw-list-detail[data-detail] .mw-list-detail__list { display: none; }
    .mw-list-detail__detail > .mw-list-detail__back { display: inline-flex; }
  }
  /* A phone's list keeps its room for the names: the glyph, the same for every entry, gives way. */
  @container mw-list-detail (max-width: 480px) {
    .mw-item__pick > .mw-mark { display: none; }
    /* Only here may the status word be cut (its whole word on hover, and in the detail one tap away). */
    .mw-item__pick > .mw-item__end { min-width: 0; max-width: 45%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-list-detail__detail.is-entering { animation: none; }
    .mw-item__pick { transition: none; }
  }
  /* A phone or a finger: each of these is a 44px target, the link by its padding (it sits in a sentence). */
  @media (max-width: 600px), (pointer: coarse) {
    /* On a phone the choice takes the row from the glyph's edge and its three settings share it equally, so a longer word in
       another language narrows the others instead of running past the row. */
    .mw-item > .mw-item__under { padding-left: 0; }
    .mw-item__under > .mw-toggle-group { display: flex; flex: 1 1 100%; min-width: 0; }
    .mw-item__under .mw-toggle { flex: 1 1 0; min-width: 0; min-height: 44px; padding-inline: 6px; }
    .mw-item__more > summary { min-height: 44px; padding-block: 0; }
    .mw-status-line > .mw-btn--link { --reach: 12px; }
    .mw-alert__actions .mw-btn, .mw-list-detail__back { min-height: 44px; }
  }

  .mw-catalog :is([data-primitive="item-choice"], [data-primitive="item-details"], [data-primitive="alert-actions"], [data-primitive="status-link"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="item-choice"], [data-primitive="item-details"]) .mw-items { width: 100%; }
  .mw-catalog [data-primitive="list-detail"] .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog [data-primitive="list-detail"] .mw-catalog__row { display: block; }
  .mw-catalog [data-list-detail-narrow] { width: min(390px, 100%); padding: 12px; border-radius: var(--sk-r-item, 8px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-catalog [data-primitive="status-link"] .mw-catalog__row { display: grid; gap: 10px; justify-items: start; }
`;

type Mode = "off" | "auto" | "manual";
interface Unavailable {
  /** The status mark's word (README「状态标记的色调」). */
  readonly word: string;
  /** What happened, in the person's words (README「用不了」). */
  readonly why: string;
  /** The one thing that can be done about it, if any. */
  readonly fix?: string;
  /** Only uninstall or reinstall is left: blocked, and the three-way choice cannot be changed. */
  readonly onlyRemove?: boolean;
  /** The plugin is off: the setting cannot be changed until it is on again. */
  readonly locked?: boolean;
}
interface Skill {
  readonly id: string;
  readonly name: string;
  readonly what: string;
  readonly pack: string;
  readonly mode: Mode;
  readonly unavailable?: Unavailable;
  readonly when: string;
  readonly tools: readonly string[];
  readonly files: readonly { readonly path: string; readonly role: string; readonly size: string }[];
  readonly used: string;
}

const MODE_WORD: Record<Mode, string> = { off: "workbench.catalog-skill-packs.off", auto: "workbench.catalog-skill-packs.automatic", manual: "workbench.catalog-skill-packs.manual-only" };
const MODE_SAYS: Record<Mode, string> = {
  off: "workbench.catalog-skill-packs.off-never-used",
  auto: "workbench.catalog-skill-packs.automatic-ai-picks-it-when-a-task-fits",
  manual: "workbench.catalog-skill-packs.manual-only-used-only-when-you-name-it",
};

/** The skills the specimens show (made up; nothing is read from a Home). Every text is still Chinese: `say` turns it. */
function skills(say: Say): { readonly weekly: Skill; readonly minutes: Skill; readonly invoice: Skill; readonly schedule: Skill; readonly contract: Skill } {
  return {
    weekly: { id: "weekly", name: say("workbench.catalog-skill-packs.write-the-weekly-review"), what: say("workbench.catalog-skill-packs.every-friday-puts-the-week-s-progress-risks"), pack: say("workbench.catalog-skill-packs.weekly-reports-and-reviews"), mode: "auto",
      when: say("workbench.catalog-skill-packs.when-the-week-s-work-needs-gathering-into"), tools: ["goals.list", "pages.create"],
      files: [{ path: "templates/weekly.md", role: say("workbench.catalog-skill-packs.reference"), size: "2 KB" }], used: say("workbench.catalog-skill-packs.last-used-yesterday-17-40-assistant") },
    minutes: { id: "minutes", name: say("workbench.catalog-skill-packs.turn-a-meeting-recording-into-minutes-with-action"), what: say("workbench.catalog-skill-packs.after-a-meeting-turns-the-transcript-into-minutes"), pack: say("workbench.catalog-skill-packs.meeting-helper-transcripts-minutes-and-action-follow-up"), mode: "manual",
      when: say("workbench.catalog-skill-packs.when-a-meeting-is-over-and-there-is"), tools: ["files.read", "inbox.send"],
      files: [{ path: "scripts/split-speakers.py", role: say("workbench.catalog-skill-packs.script-runs"), size: "6 KB" }], used: say("workbench.catalog-skill-packs.last-used-3-days-ago-coding") },
    invoice: { id: "invoice", name: say("workbench.catalog-skill-packs.sort-invoices"), what: say("workbench.catalog-skill-packs.reads-invoice-photos-into-a-table-filed-by"), pack: say("workbench.catalog-skill-packs.finance-tools"), mode: "off",
      when: say("workbench.catalog-skill-packs.when-invoice-photos-or-pdfs-come-in"), tools: ["files.read"], files: [], used: say("workbench.catalog-skill-packs.never-used") },
    schedule: { id: "schedule", name: say("workbench.catalog-skill-packs.schedule-a-meeting"), what: say("workbench.catalog-skill-packs.suggests-meeting-times-from-everyone-s-free-time"), pack: say("workbench.catalog-skill-packs.scheduling"), mode: "auto",
      unavailable: { word: say("workbench.catalog-skill-packs.unavailable-for-now"), why: say("workbench.catalog-skill-packs.no-calendar-connection-so-it-can-t-be"), fix: say("workbench.catalog-skill-packs.connect") },
      when: say("workbench.catalog-skill-packs.when-a-meeting-needs-a-time-everyone-is"), tools: ["calendar.free_busy"], files: [], used: say("workbench.catalog-skill-packs.last-used-last-week-assistant") },
    contract: { id: "contract", name: say("workbench.catalog-skill-packs.review-contract-clauses"), what: say("workbench.catalog-skill-packs.marks-the-risky-clauses-of-a-contract-one"), pack: say("workbench.catalog-skill-packs.legal-review"), mode: "auto",
      unavailable: { word: say("workbench.catalog-skill-packs.retracted"), why: say("workbench.catalog-skill-packs.publisher-revoked-it-can-only-be-uninstalled"), fix: say("workbench.catalog-skill-packs.uninstall"), onlyRemove: true },
      when: say("workbench.catalog-skill-packs.when-a-contract-arrives-to-be-signed"), tools: ["files.read"], files: [{ path: "reference/clauses.md", role: say("workbench.catalog-skill-packs.reference"), size: "18 KB" }], used: say("workbench.catalog-skill-packs.never-used") },
  };
}

const mark = (name: Parameters<typeof icon>[0]) => `<span class="mw-mark" aria-hidden="true">${icon(name)}</span>`;
const ring = (mode: Mode): { tone: MwStatusTone; state: StateRingState } => mode === "off" ? { tone: "quiet", state: "paused" } : { tone: "idle", state: "ready" };

/** The setting's status mark, or the unavailable one, which is shown instead of it (the setting is kept). */
function statusOf(say: Say, skill: Skill): string {
  const u = skill.unavailable;
  // A narrow list can cut the mark's word; its whole word is on hover.
  if (u) return renderStatusMark({ label: u.word, tone: u.onlyRemove ? "blocked" : "hold", state: u.onlyRemove ? "blocked" : "unavailable", labelAttrs: { title: u.word } });
  return renderStatusMark({ label: say(MODE_WORD[skill.mode]), ...ring(skill.mode), labelAttrs: { title: say(MODE_WORD[skill.mode]) } });
}

/** 5 · The mark, why, and the one thing to do, as one paragraph. */
export function statusLine(mark: string, why: string, fix?: string): string {
  return `<p class="mw-status-line">${mark}<span>${escapeHtml(why)}</span>${fix ? renderButton({ label: fix, variant: "link" }) : ""}</p>`;
}

/** 4 · An alert with its next steps under its words (renderAlert draws the title and the words). */
export function alertWithActions(options: { tone: "danger" | "success" | "warning" | "info"; title: string; body: string; problems?: readonly string[]; actions: string }): string {
  const role = options.tone === "danger" ? "alert" : "status";
  const problems = options.problems?.length ? `<ul class="mw-alert__problems">${options.problems.map((line) => `<li>${line}</li>`).join("")}</ul>` : "";
  return `<div class="mw-alert mw-alert--${options.tone}" data-slot="alert" role="${role}"><strong>${escapeHtml(options.title)}</strong><p>${escapeHtml(options.body)}</p>${problems}<div class="mw-alert__actions">${options.actions}</div></div>`;
}

/** 1 · The three-way choice; disabled while the plugin is off, revoked or broken. */
function choice(say: Say, skill: Skill, disabled = false): string {
  return renderToggleGroup({
    label: say("workbench.catalog-skill-packs.how-to-use-name", { name: skill.name }),
    items: (["off", "auto", "manual"] as const).map((mode) => ({ value: mode, label: say(MODE_WORD[mode]), current: skill.mode === mode, attrs: disabled ? { disabled: true } : {} })),
  });
}

function saveFailed(say: Say, skill: Skill): string {
  return alertWithActions({ tone: "danger", title: say("workbench.catalog-skill-packs.couldn-t-save"), body: say("workbench.catalog-skill-packs.name-is-still-mode-nothing-changed", { name: skill.name, mode: say(MODE_WORD[skill.mode]) }),
    actions: renderButton({ label: say("common.control.retry"), variant: "secondary", size: "sm" }) });
}

/** 1 · One row of the enable step: the words, then the choice under them (and what stops it, or a failed save). */
function choiceRow(say: Say, skill: Skill, options: { locked?: Unavailable; failed?: boolean } = {}): string {
  const locked = options.locked;
  const under = `${choice(say, skill, Boolean(locked))}${options.failed ? saveFailed(say, skill) : ""}`;
  const why = locked ? statusLine(renderStatusMark({ label: locked.word, tone: locked.onlyRemove ? "blocked" : "hold", state: locked.onlyRemove ? "blocked" : "unavailable" }), locked.why, locked.fix) : "";
  return `<li class="mw-item mw-item--stack"${locked ? " data-off" : ""}>${mark("book")}<span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.what)}</small>${why}</span><div class="mw-item__under">${under}</div></li>`;
}

export function itemChoiceSection(say: Say): string {
  const { weekly, minutes, invoice } = skills(say);
  const plugin: Unavailable = { word: say("workbench.catalog-skill-packs.unavailable-for-now"), why: say("workbench.catalog-skill-packs.plugin-legal-review-is-turned-off-so-it"), fix: say("workbench.home-plugin-page.enable-plugin"), locked: true };
  const revoked: Unavailable = { word: say("workbench.catalog-skill-packs.retracted"), why: say("workbench.catalog-skill-packs.publisher-revoked-it-can-only-be-uninstalled"), fix: say("workbench.catalog-skill-packs.uninstall"), onlyRemove: true };
  const broken: Unavailable = { word: say("workbench.catalog-skill-packs.broken"), why: say("workbench.catalog-skill-packs.its-text-or-files-are-missing"), fix: say("workbench.catalog-skill-packs.reinstall"), onlyRemove: true };
  return section("item-choice", say("workbench.catalog-skill-packs.item-row-choice"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-packs.enabling-right-after-install-three-settings-each-off"), `<ul class="mw-items">${choiceRow(say, { ...weekly, mode: "off" })}${choiceRow(say, minutes)}${choiceRow(say, invoice)}</ul>`)}
    ${specimen(say("workbench.catalog-skill-packs.unavailable-the-three-settings-grey-out-the-status"), `<ul class="mw-items">${
      choiceRow(say, { ...invoice, name: say("workbench.catalog-skill-packs.review-contract-clauses"), what: say("workbench.catalog-skill-packs.marks-the-risky-clauses-of-a-contract-one"), mode: "auto" }, { locked: plugin })}${
      choiceRow(say, { ...invoice, name: say("workbench.catalog-skill-packs.compare-contract-versions"), what: say("workbench.catalog-skill-packs.marks-which-clauses-changed-between-two-versions"), mode: "manual" }, { locked: revoked })}${
      choiceRow(say, { ...invoice, name: say("workbench.catalog-skill-packs.make-a-quote"), what: say("workbench.catalog-skill-packs.makes-a-quote-pdf-from-a-template") }, { locked: broken })}</ul>`)}
    ${specimen(say("workbench.catalog-skill-packs.not-saved-said-in-place-the-setting-unchanged"), `<ul class="mw-items">${choiceRow(say, weekly, { failed: true })}</ul>`)}
  </div>`);
}

/** 2 · What a skill holds, inside its row's fold or in the detail. */
function facts(say: Say, skill: Skill, withExcerpt: boolean): string {
  const files = skill.files.length
    ? `<ul>${skill.files.map((file) => `<li><code>${escapeHtml(file.path)}</code><span>${escapeHtml(file.role)} · ${escapeHtml(file.size)}</span></li>`).join("")}</ul>`
    : `<span>${escapeHtml(say("workbench.catalog-skill-packs.no-included-files"))}</span>`;
  const excerpt = withExcerpt ? `<dt>${escapeHtml(say("workbench.catalog-skill-packs.start-of-the-text"))}</dt><dd><blockquote>${escapeHtml(say("workbench.catalog-skill-packs.first-list-the-goals-finished-this-week-then"))}</blockquote></dd>` : "";
  return `<dl class="mw-facts"><dt>${escapeHtml(say("workbench.catalog-skill-packs.when-to-use"))}</dt><dd>${escapeHtml(skill.when)}</dd><dt>${escapeHtml(say("workbench.catalog-skill-packs.declared-tools-a-note-not-a-permission"))}</dt><dd>${
    skill.tools.map((tool) => `<code>${escapeHtml(tool)}</code>`).join(" ")}</dd><dt>${escapeHtml(say("workbench.catalog-skill-packs.included-files"))}</dt><dd>${files}</dd>${excerpt}</dl>`;
}

function moreRow(say: Say, skill: Skill, open = false): string {
  const fold = renderCollapsible({ summary: say("workbench.catalog-skill-packs.details"), body: facts(say, skill, true), open, className: "mw-item__more" })
    .replace("<summary>", `<summary aria-label="${escapeHtml(say("workbench.catalog-skill-packs.details-name", { name: skill.name }))}">`);
  return `<li class="mw-item mw-item--stack">${mark("book")}<span><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.what)}</small></span>${fold}</li>`;
}

export function itemDetailsSection(say: Say): string {
  const { weekly, minutes, invoice } = skills(say);
  return section("item-details", say("workbench.catalog-skill-packs.item-row-details"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-packs.install-review-each-opens-in-place"), `<ul class="mw-items">${moreRow(say, weekly, true)}${moreRow(say, invoice)}</ul>`)}
    ${specimen(say("workbench.catalog-skill-packs.a-long-name-runs-a-script"), `<ul class="mw-items">${moreRow(say, minutes, true)}</ul>`)}
  </div>`);
}

/** 3 · One entry of the list: the list item stays, a real button fills it. */
function pick(say: Say, skill: Skill, key: string, current: boolean): string {
  return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" data-list-pick="${key}"${current ? ' aria-current="true"' : ""}>${mark("book")}<span><strong>${
    escapeHtml(skill.name)}</strong><small title="${escapeHtml(skill.pack)}">${escapeHtml(skill.pack)}</small></span><span class="mw-item__end">${statusOf(say, skill)}</span></button></li>`;
}

/** 3 · Everything about one entry; the choice is the three radios, each with what it means. */
function detail(say: Say, skill: Skill, key: string, shown: boolean): string {
  const u = skill.unavailable;
  const disabled = Boolean(u?.onlyRemove || u?.locked);
  const radios = renderRadioGroup({ legend: say("workbench.catalog-skill-packs.how-to-use"), name: `${key}-mode`, items: (["off", "auto", "manual"] as const).map((mode) => ({ value: mode, label: say(MODE_SAYS[mode]), checked: skill.mode === mode })) });
  const why = u ? statusLine(statusOf(say, skill), u.why, u.fix) : "";
  return `<section class="mw-list-detail__detail" data-list-panel="${key}" aria-labelledby="${key}-title"${shown ? "" : " hidden"}${disabled ? " data-off" : ""}>
    ${renderButton({ label: say("workbench.catalog-skill-packs.all-skills"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: { "data-list-back": "" } })}
    <header><h3 id="${key}-title" tabindex="-1">${escapeHtml(skill.name)}</h3><p>${escapeHtml(skill.what)}</p></header>
    ${why}${disabled ? radios.replace("<fieldset ", "<fieldset disabled ") : radios}${facts(say, skill, false)}<p class="mw-list-detail__used">${escapeHtml(skill.used)}</p>
  </section>`;
}

function listDetail(say: Say, id: string, narrow: boolean): string {
  const list = Object.values(skills(say));
  const picks = list.map((skill, index) => pick(say, skill, `${id}-${skill.id}`, index === 0)).join("");
  const details = list.map((skill, index) => detail(say, skill, `${id}-${skill.id}`, index === 0)).join("");
  return `<div class="mw-list-detail" data-list-detail${narrow ? " data-list-detail-narrow" : ""}><div class="mw-list-detail__body"><div class="mw-list-detail__list" role="region" aria-label="${escapeHtml(narrow ? say("workbench.catalog-skill-packs.skills-narrow-specimen") : say("workbench.catalog-skill-packs.skills"))}"><ul class="mw-items">${picks}</ul></div>${details}</div></div>`;
}

export function listDetailSection(say: Say): string {
  const empty = renderEmpty({ icon: "book", title: say("workbench.catalog-skill-packs.no-skills-yet"), body: say("workbench.catalog-skill-packs.a-skill-is-a-way-of-doing-something"),
    action: `<div class="mw-empty__actions">${renderButton({ label: say("workbench.characters.import-local"), variant: "secondary", icon: "download" })}${renderButton({ label: say("workbench.catalog-skill-packs.open-plugin-market"), variant: "primary" })}</div>` });
  return section("list-detail", say("workbench.catalog-skill-packs.list-and-detail"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-packs.list-on-the-left-detail-on-the-right"), listDetail(say, "list-wide", false))}
    ${specimen(say("workbench.catalog-skill-packs.narrow-one-side-at-a-time-choosing-moves"), listDetail(say, "list-narrow", true))}
    ${specimen(say("workbench.catalog-skill-packs.no-skills-yet"), empty)}
  </div>`);
}

export function skillAlertSpecimens(say: Say): string {
  const bad = alertWithActions({ tone: "danger", title: say("workbench.catalog-skill-packs.this-package-can-t-be-installed"), body: say("workbench.catalog-skill-packs.these-are-wrong-so-nothing-was-installed-and"),
    problems: [`<code>skills/meeting-notes/SKILL.md</code>${escapeHtml(say("workbench.catalog-skill-packs.not-in-the-package"))}`, `<code>skills/weekly/scripts/run.sh</code>${escapeHtml(say("workbench.catalog-skill-packs.declared-but-the-file-is-not-there"))}`],
    actions: renderButton({ label: say("workbench.catalog-skill-packs.choose-another-file"), variant: "secondary", size: "sm" }) });
  const failed = alertWithActions({ tone: "danger", title: say("workbench.catalog-skill-packs.couldn-t-save"), body: say("workbench.catalog-skill-packs.name-is-still-mode-nothing-changed", { name: say("workbench.catalog-skill-packs.write-the-weekly-review"), mode: say("workbench.catalog-skill-packs.automatic") }), actions: renderButton({ label: say("common.control.retry"), variant: "secondary", size: "sm" }) });
  const done = alertWithActions({ tone: "success", title: say("workbench.catalog-skill-packs.installed-name-version", { name: say("workbench.catalog-skill-packs.weekly-reports-and-reviews"), version: "1.4" }), body: say("workbench.catalog-skill-packs.count-count-skill-skills-off-choose-which-to", { count: 4 }), actions: renderButton({ label: say("workbench.catalog-skill-packs.go-to-skills"), variant: "primary", size: "sm" }) });
  const two = alertWithActions({ tone: "warning", title: say("workbench.catalog-skill-packs.one-local-agent-skill"), body: say("workbench.catalog-skill-packs.tidy-repository-commits-runs-commands-on-this-computer"),
    actions: renderButton({ label: say("workbench.catalog-skill-packs.import-anyway"), variant: "secondary", size: "sm" }) + renderButton({ label: say("workbench.catalog-skill-packs.skip-this-one"), variant: "ghost", size: "sm" }) });
  const stack = (body: string) => `<div class="mw-keep-stack">${body}</div>`;
  return `${specimen(say("workbench.catalog-skill-packs.can-t-install-every-reason-listed"), stack(bad))}${specimen(say("workbench.client-events.could-not-save"), stack(failed))}${specimen(say("workbench.catalog-skill-packs.the-next-step-once-done"), stack(done))}${specimen(say("workbench.catalog-skill-packs.two-buttons-a-long-sentence"), stack(two))}`;
}

export function statusLinkSection(say: Say): string {
  const mode = (m: Mode) => `<p class="mw-status-line">${renderStatusMark({ label: say(MODE_WORD[m]), ...ring(m) })}</p>`;
  const hold = (word: string, why: string, fix?: string) => statusLine(renderStatusMark({ label: word, tone: "hold", state: "unavailable" }), why, fix);
  const blocked = (word: string, why: string, fix: string) => statusLine(renderStatusMark({ label: word, tone: "blocked", state: "blocked" }), why, fix);
  return section("status-link", say("workbench.catalog-skill-packs.status-with-link"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-skill-packs.in-use-and-not"), `${mode("auto")}${mode("manual")}${mode("off")}`)}
    ${specimen(say("workbench.catalog-skill-packs.unavailable-fixable-in-place"), `${hold(say("workbench.catalog-skill-packs.unavailable-for-now"), say("workbench.catalog-skill-packs.no-calendar-connection-so-it-can-t-be"), say("workbench.catalog-skill-packs.connect"))}${hold(say("workbench.catalog-skill-packs.unavailable-for-now"), say("workbench.catalog-skill-packs.missing-name", { name: say("workbench.catalog-skill-packs.the-plugin-scheduling") }), say("workbench.catalog-skill-packs.add-it"))}${
      hold(say("workbench.catalog-skill-packs.unavailable-for-now"), say("workbench.catalog-skill-packs.plugin-legal-review-is-turned-off-so-it"), say("workbench.home-plugin-page.enable-plugin"))}${hold(say("workbench.catalog-skill-packs.local-agents-only"), say("workbench.catalog-skill-packs.only-local-agents-can-use-it-why", { why: say("workbench.catalog-skill-packs.it-runs-commands-on-this-computer") }))}`)}
    ${specimen(say("workbench.catalog-skill-packs.only-uninstall-or-reinstall-left"), `${blocked(say("workbench.catalog-skill-packs.retracted"), say("workbench.catalog-skill-packs.publisher-revoked-it-can-only-be-uninstalled"), say("workbench.catalog-skill-packs.uninstall"))}${blocked(say("workbench.catalog-skill-packs.broken"), say("workbench.catalog-skill-packs.its-text-or-files-are-missing"), say("workbench.catalog-skill-packs.reinstall"))}`)}
  </div>`);
}
