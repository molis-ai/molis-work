import { icon, type MolisWorkIcon } from "../icons.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderSpinner, renderStatusMark, type MwStatusTone } from "./feedback.js";

/*
 * The arrival components: what the opening, the Welcome questions, the project chooser and the new-project journey
 * share — the wordmark and its caption, the short-line progress, the bottom bar's context and status blocks, the goal
 * track, the file list and the project brief. Specimens are in the catalog (`/__ui/catalog#arrival`); the motion is
 * `ARRIVAL_MOTION_CLIENT_SCRIPT`. Page layout (the desk, the sheet, the bar) stays with Workbench.
 */

/** The words after the fixed “A” and “I” of the caption: A·mplify I·deas, A·waken I·magination … */
export const ARRIVAL_CAPTION_PHRASES: ReadonlyArray<readonly [string, string]> = [
  ["mplify", "deas"], ["waken", "magination"], ["dvance", "ntuition"], ["ugment", "ntelligence"],
  ["ccelerate", "nnovation"], ["rtistic", "nspiration"], ["rtful", "nteractions"], ["daptive", "nterfaces"],
];

/** The product name, one span per letter so it can type itself. Decorative letters; the name is on the wrapper. */
export function renderWordmark(options: { text?: string; label?: string; className?: string; attrs?: Record<string, AttrValue> } = {}): string {
  const text = options.text ?? "Molis Work";
  const letters = Array.from(text).map((char, index) =>
    `<span class="mw-wordmark__l" aria-hidden="true" data-i="${index}">${char === " " ? "&nbsp;" : escapeHtml(char)}</span>`).join("");
  return `<span class="${cx("mw-wordmark", options.className)}" data-slot="wordmark" data-wordmark role="img" aria-label="${escapeHtml(options.label ?? text)}"${renderAttrs(options.attrs)}>${letters}<i class="mw-wordmark__caret" aria-hidden="true"></i></span>`;
}

/**
 * “A… I…”: the two letters stay, the words after them type, hold and erase in turn. A button, so the person can stop it;
 * it also rests on hover and focus, off screen, in a hidden page and under reduced motion.
 */
export function renderCaption(options: { label: string; playLabel: string; title: string; phrases?: ReadonlyArray<readonly [string, string]>; className?: string }): string {
  const row = (initial: string) => `<span class="mw-caption__row" lang="en"><span class="mw-caption__ini">${initial}</span><span class="mw-caption__tail"></span></span>`;
  return `<button type="button" class="${cx("mw-caption", options.className)}" data-slot="caption" data-caption aria-pressed="false" aria-label="${escapeHtml(options.label)}" data-label-pause="${escapeHtml(options.label)}" data-label-play="${escapeHtml(options.playLabel)}" title="${escapeHtml(options.title)}" data-phrases="${escapeHtml(JSON.stringify(options.phrases ?? ARRIVAL_CAPTION_PHRASES))}">${row("A")}${row("I")}</button>`;
}

/** Short-line progress: done in a copper tint, the current step in copper. */
export function renderSteps(options: { total: number; current: number; label: string; className?: string }): string {
  const items = Array.from({ length: options.total }, (_, index) =>
    `<li${index === options.current ? ' aria-current="step"' : ""}${index < options.current ? ' class="is-done"' : ""}><span></span></li>`).join("");
  return `<ol class="${cx("mw-steps", options.className)}" data-slot="steps" aria-label="${escapeHtml(options.label)}">${items}</ol>`;
}

export type MwGoalTrackState = "done" | "doing" | "todo";

/** One segment per goal: done in ink-soft, the one in progress in copper, the rest in the line colour. */
export function renderGoalTrack(options: { goals: ReadonlyArray<{ title: string; state: MwGoalTrackState }>; label: string; className?: string }): string {
  const items = options.goals.map((goal, index) =>
    `<li data-s="${goal.state}" style="--i:${index}" title="${escapeHtml(goal.title)}"><span class="mw-goal-track__bar"></span><span class="mw-goal-track__name">${escapeHtml(goal.title)}</span></li>`).join("");
  return `<ol class="${cx("mw-goal-track", options.goals.length > 7 && "is-dense", options.className)}" data-slot="goal-track" role="img" aria-label="${escapeHtml(options.label)}">${items}</ol>`;
}

/** The bar's left block while something is only being looked at: a mark, its name and what Enter does. */
export function renderBarContext(options: { mark: string; title: string; caption: string; none?: boolean; className?: string }): string {
  return `<div class="${cx("mw-bar-context", options.className)}" data-slot="bar-context"><span class="${cx("mw-bar-context__mark", options.none && "is-none")}">${options.mark}</span><span class="mw-bar-context__text"><strong>${escapeHtml(options.title)}</strong><small>${escapeHtml(options.caption)}</small></span></div>`;
}

/** The bar's middle block while a step is under way or waiting: what is happening, in one line and a quieter one. */
export function renderBarStatus(options: { glyph?: MolisWorkIcon; spin?: boolean; title: string; caption?: string; className?: string }): string {
  return `<div class="${cx("mw-bar-status", options.className)}" data-slot="bar-status" role="status" aria-live="polite"><span class="mw-bar-status__tile" aria-hidden="true">${options.spin ? renderSpinner() : icon(options.glyph ?? "info")}</span><span class="mw-bar-status__text"><strong>${escapeHtml(options.title)}</strong>${options.caption ? `<small>${escapeHtml(options.caption)}</small>` : ""}</span></div>`;
}

/** A file's kind as a small chip: its extension, in the colour of its kind (the five `--mark-*` tones). */
export function renderFileKind(name: string): string {
  // A name with no extension (“README”, “.env”) is plain text.
  const dot = name.lastIndexOf(".");
  const extension = (dot > 0 ? name.slice(dot + 1) : "txt").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "txt";
  return `<span class="mw-file-kind mw-file-kind--${extension}" data-slot="file-kind">${escapeHtml(extension.toUpperCase())}</span>`;
}

export interface MwFileRowOptions {
  name: string;
  size?: string;
  /** Right-hand state, already rendered (a status mark or plain words). */
  state?: string;
  /** A leading checkbox, so the row is a choice. */
  check?: { checked: boolean; attrs?: Record<string, AttrValue> };
  /** A trailing icon-only remove button, shown on hover and focus. */
  remove?: { label: string; attrs?: Record<string, AttrValue> };
  className?: string;
}

export function renderFileRow(options: MwFileRowOptions): string {
  const label = `${options.check ? `<input class="mw-check" type="checkbox"${options.check.checked ? " checked" : ""}${renderAttrs(options.check.attrs)}>` : ""}${renderFileKind(options.name)}<span class="mw-file-row__name">${escapeHtml(options.name)}</span>`;
  const remove = options.remove
    ? `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-row__x" data-slot="button" aria-label="${escapeHtml(options.remove.label)}" title="${escapeHtml(options.remove.label)}"${renderAttrs(options.remove.attrs)}>${icon("x")}</button>`
    : "";
  return `<li class="${cx("mw-file-row", options.className)}" data-slot="file-row">${options.check ? `<label class="mw-file-row__label">${label}</label>` : `<span class="mw-file-row__label">${label}</span>`}${options.size ? `<span class="mw-file-row__size" title="${escapeHtml(options.size)}">${escapeHtml(options.size)}</span>` : ""}${options.state ?? ""}${remove}</li>`;
}

export interface MwFileGroupOptions {
  glyph: MolisWorkIcon;
  title: string;
  caption?: string;
  count?: string;
  /** A status mark, already rendered. */
  status?: string;
  /** The group's own checkbox (it shows a mixed state when only some of its files are chosen). */
  check?: { checked: boolean; mixed?: boolean; attrs?: Record<string, AttrValue> };
  remove?: { label: string; attrs?: Record<string, AttrValue> };
  rows: readonly string[];
  note?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

export function renderFileGroup(options: MwFileGroupOptions): string {
  const head = `${options.check ? `<input class="mw-check" type="checkbox"${options.check.checked ? " checked" : ""}${options.check.mixed ? " data-mixed" : ""}${renderAttrs(options.check.attrs)}>` : ""}<span class="mw-file-group__ic">${icon(options.glyph)}</span><span class="mw-file-group__text"><strong>${escapeHtml(options.title)}</strong>${options.caption ? `<small>${escapeHtml(options.caption)}</small>` : ""}</span>${options.count ? `<span class="mw-file-group__count">${escapeHtml(options.count)}</span>` : ""}${options.status ?? ""}${options.remove ? `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm mw-file-group__x" data-slot="button" aria-label="${escapeHtml(options.remove.label)}" title="${escapeHtml(options.remove.label)}"${renderAttrs(options.remove.attrs)}>${icon("x")}</button>` : ""}`;
  return `<section class="${cx("mw-file-group", options.className)}" data-slot="file-group"${renderAttrs(options.attrs)}>${options.check ? `<label class="mw-file-group__head">${head}</label>` : `<div class="mw-file-group__head">${head}</div>`}<ul class="mw-file-list">${options.rows.join("")}</ul>${options.note ? `<p class="mw-file-group__note">${escapeHtml(options.note)}</p>` : ""}</section>`;
}

/* ───────── The brief: what a directory item is, in one reading ───────── */

export interface MwBriefOptions {
  /** The state line above the title (a status mark, a few quiet facts), already rendered. */
  kicker: string;
  title: string;
  titleId?: string;
  /** The one-sentence description, or — when there is none — the sentence that says how to add one. */
  description?: string;
  descriptionMissing?: string;
  /** The focus card, already rendered. */
  focus?: string;
  /** Sections laid out side by side (two columns on a wide sheet), already rendered with `renderBriefSection`. */
  sections?: readonly string[];
  /** A quiet closing line of facts, already rendered. */
  facts?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

/** A project's (or the personal space's) summary: the page the chooser's right-hand sheet and the new-project preview share. */
export function renderBrief(options: MwBriefOptions): string {
  const id = options.titleId ?? "brief-title";
  const description = options.description
    ? `<p class="mw-brief__desc">${escapeHtml(options.description)}</p>`
    : options.descriptionMissing ? `<p class="mw-brief__desc is-missing">${icon("info")}<span>${escapeHtml(options.descriptionMissing)}</span></p>` : "";
  return `<article class="${cx("mw-brief", options.className)}" data-slot="brief" aria-labelledby="${id}"${renderAttrs(options.attrs)}><p class="mw-brief__kicker">${options.kicker}</p><h1 class="mw-brief__title" id="${id}">${escapeHtml(options.title)}</h1>${description}${options.focus ?? ""}${options.sections?.length ? `<div class="mw-brief__cols">${options.sections.join("")}</div>` : ""}${options.facts ?? ""}</article>`;
}

export function renderBriefSection(options: { title: string; body: string; className?: string }): string {
  return `<section class="${cx("mw-brief__sec", options.className)}"><h2>${escapeHtml(options.title)}</h2>${options.body}</section>`;
}

/** The focus card: the one thing in play (a goal, with its count and track), or the plain absence of it. */
export function renderBriefFocus(options: { label: string; count?: string; title: string; body?: string; track?: string; empty?: { action?: string }; className?: string }): string {
  if (options.empty) {
    return `<section class="${cx("mw-brief__focus is-empty", options.className)}"><div><h2>${escapeHtml(options.title)}</h2>${options.body ? `<p>${escapeHtml(options.body)}</p>` : ""}</div>${options.empty.action ?? ""}</section>`;
  }
  return `<section class="${cx("mw-brief__focus", options.className)}"><header><span class="mw-brief__focus-label">${escapeHtml(options.label)}</span>${options.count ? `<span class="mw-brief__focus-count">${options.count}</span>` : ""}</header><h2>${escapeHtml(options.title)}</h2>${options.body ? `<p>${escapeHtml(options.body)}</p>` : ""}${options.track ?? ""}</section>`;
}

/** The recent-activity list: a date beside what happened. */
export function renderBriefRecent(rows: ReadonlyArray<{ when: string; text: string }>): string {
  return `<ul class="mw-brief__recent">${rows.map((row) => `<li><time>${escapeHtml(row.when)}</time><span>${escapeHtml(row.text)}</span></li>`).join("")}</ul>`;
}

export function renderBriefStatus(options: { label: string; tone: MwStatusTone; glyph: MolisWorkIcon }): string {
  return renderStatusMark({ label: options.label, tone: options.tone, icon: options.glyph, plain: true });
}
