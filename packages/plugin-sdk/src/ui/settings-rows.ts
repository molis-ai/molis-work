import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { icon, type PluginIconName } from "./icon.js";

/**
 * The rows a settings page is written in (specs/screen-polish/p5-settings.md): a page is titled sections, each one card of
 * rows, and every line in a card is one of three rows with one control at its end.
 *
 * - 设置行 `renderSettingRow`: a name and one sentence on the left, one control on the right.
 * - 对象行 `renderObjectRow`: a mark, a name, a state; it opens in place onto 问句行 (`renderQuestionList`).
 * - 列表行 `renderListToolbar` over the page's own table rows: search first, at most two filters, the rest behind 更多筛选.
 *
 * Names, sentences and states are plain text and are escaped here; controls, answers and bodies are the caller's HTML.
 */

/**
 * A part of a settings page: a title, then one card holding its rows. Every settings page is made of these and nothing else, so
 * the pages read alike. `action` sits at the title's end; `lead` (a list's toolbar) sits between the title and the card. Without
 * a title the card stands alone.
 */
export function renderSettingsSection(options: {
  title?: string;
  body: string;
  id?: string;
  action?: string;
  lead?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const heading = options.id ? ` id="${escapeHtml(options.id)}"` : "";
  const head = options.title ? `<header class="mw-settings-section__head"><h2${heading}>${escapeHtml(options.title)}</h2>${options.action ?? ""}</header>` : "";
  return `<section class="${cx("mw-settings-section", options.className)}" data-slot="settings-section"${options.title && options.id ? ` aria-labelledby="${escapeHtml(options.id)}"` : ""}${renderAttrs(options.attrs)}>
    ${head}${options.lead ?? ""}
    <div class="mw-settings-section__rows">${options.body}</div>
  </section>`;
}

/**
 * 设置行. `control` is one control (a switch, a select, a button, a value). With `label`, the whole row is the control's label,
 * so pressing anywhere on it toggles a switch; leave it off when the control is a button or carries its own label.
 */
export function renderSettingRow(options: {
  name: string;
  hint?: string;
  control: string;
  label?: boolean;
  className?: string;
  attrs?: Record<string, AttrValue>;
  nameAttrs?: Record<string, AttrValue>;
  hintAttrs?: Record<string, AttrValue>;
}): string {
  const tag = options.label ? "label" : "div";
  return `<${tag} class="${cx("mw-setting-row", options.className)}" data-slot="setting-row"${renderAttrs(options.attrs)}><span class="mw-setting-row__copy"><strong${renderAttrs(options.nameAttrs)}>${escapeHtml(options.name)}</strong>${
    options.hint !== undefined ? `<span${renderAttrs(options.hintAttrs)}>${escapeHtml(options.hint)}</span>` : ""
  }</span><span class="mw-setting-row__control">${options.control}</span></${tag}>`;
}

export type MwObjectRowTone = "ok" | "quiet" | "attention" | "bad";

/**
 * 对象行: a connection, a model, a tool, a role. With `body` it is a disclosure that opens in place (a chevron at its end);
 * without, a plain row. A state that is not fine (`attention`, `bad`) carries a mark as well as its colour, and what can be
 * done about it goes in `action`, beside it.
 */
export function renderObjectRow(options: {
  name: string;
  hint?: string;
  icon?: PluginIconName;
  /** The caller's own mark for the tile (a brand image); `icon` otherwise. */
  mark?: string;
  /** `attrs` go on the state itself: a platform state (`data-mw-state`) draws its ring there, in place of the dot. */
  state?: { label: string; tone?: MwObjectRowTone; attrs?: Record<string, AttrValue> };
  action?: string;
  body?: string;
  open?: boolean;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const tone = options.state?.tone ?? "quiet";
  const state = options.state
    ? `<span class="mw-object-row__state" data-tone="${tone}"${renderAttrs(options.state.attrs)}>${tone === "bad" || tone === "attention" ? icon("circle-alert") : '<i aria-hidden="true"></i>'}<span>${escapeHtml(options.state.label)}</span></span>`
    : "";
  const tile = options.mark ?? (options.icon ? icon(options.icon) : "");
  const head = `${tile ? `<span class="mw-object-row__tile" aria-hidden="true">${tile}</span>` : ""}<span class="mw-object-row__copy"><strong>${escapeHtml(options.name)}</strong>${
    options.hint !== undefined ? `<span>${escapeHtml(options.hint)}</span>` : ""
  }</span>${state}${options.action ? `<span class="mw-object-row__action">${options.action}</span>` : ""}`;
  const className = cx("mw-object-row", !tile && "mw-object-row--plain", options.className);
  if (options.body === undefined) return `<div class="${className}" data-slot="object-row"${renderAttrs(options.attrs)}><div class="mw-object-row__head">${head}</div></div>`;
  return `<details class="${className}" data-slot="object-row"${options.open ? " open" : ""}${renderAttrs(options.attrs)}><summary class="mw-object-row__head">${head}<span class="mw-object-row__chevron" aria-hidden="true">${icon("chevron-right")}</span></summary><div class="mw-object-row__body">${options.body}</div></details>`;
}

/** 问句行: what an opened object answers — 装在哪、连得上吗、能做什么、谁在用 — each with at most one thing to do at its end. */
export function renderQuestionList(options: {
  rows: ReadonlyArray<{ question: string; answer: string; action?: string; attrs?: Record<string, AttrValue> }>;
  className?: string;
}): string {
  return `<dl class="${cx("mw-question-list", options.className)}" data-slot="question-list">${options.rows.map(row =>
    `<div class="mw-question"${renderAttrs(row.attrs)}><dt>${escapeHtml(row.question)}</dt><dd>${row.answer}</dd>${row.action ? `<span class="mw-question__action">${row.action}</span>` : ""}</div>`).join("")}</dl>`;
}

/**
 * The bar over a list of records: the search first, then at most two filters; whatever else the list can be filtered by
 * goes in `more`, behind one 更多筛选 disclosure, and `end` (an add button) sits at the far side.
 */
export function renderListToolbar(options: {
  label: string;
  search: string;
  filters?: string;
  more?: { label: string; body: string };
  end?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<div class="${cx("mw-list-toolbar", options.className)}" data-slot="list-toolbar" role="group" aria-label="${escapeHtml(options.label)}"${renderAttrs(options.attrs)}>
    <div class="mw-list-toolbar__main"><span class="mw-list-toolbar__search">${options.search}</span>${options.filters ?? ""}${
    options.more ? `<details class="mw-list-toolbar__more"><summary class="mw-btn mw-btn--secondary mw-btn--sm">${escapeHtml(options.more.label)}${icon("chevron-down")}</summary><div class="mw-list-toolbar__more-body">${options.more.body}</div></details>` : ""
  }${options.end ? `<span class="mw-list-toolbar__end">${options.end}</span>` : ""}</div>
  </div>`;
}
