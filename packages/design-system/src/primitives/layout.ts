import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";

export function renderSidebar(options: {
  body: string;
  header?: string;
  footer?: string;
  variant?: "directory" | "rail";
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const variant = options.variant ?? "directory";
  return `<aside class="${cx("mw-sidebar", `mw-sidebar--${variant}`, options.className)}" data-slot="sidebar"${renderAttrs(options.attrs)}>
    ${options.header ? `<header class="mw-sidebar__header">${options.header}</header>` : ""}
    <div class="mw-sidebar__body mw-scroll">${options.body}</div>
    ${options.footer ? `<footer class="mw-sidebar__footer">${options.footer}</footer>` : ""}
  </aside>`;
}

export function renderFrame(options: {
  panel: string;
  header?: string;
  footer?: string;
  action?: string;
  title?: string;
  description?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const heading = options.title
    ? `<div class="mw-frame__heading"><h2>${escapeHtml(options.title)}</h2>${
        options.description ? `<p>${escapeHtml(options.description)}</p>` : ""
      }</div>`
    : "";
  return `<section class="${cx("mw-frame", options.className)}" data-slot="frame"${renderAttrs(options.attrs)}>
    ${options.header || heading || options.action ? `<header class="mw-frame__header">${heading}${options.header ?? ""}${
      options.action ? `<div class="mw-frame__action">${options.action}</div>` : ""
    }</header>` : ""}
    <div class="mw-frame__panel">${options.panel}</div>
    ${options.footer ? `<footer class="mw-frame__footer">${options.footer}</footer>` : ""}
  </section>`;
}

export function renderGroup(options: { body: string; label?: string; className?: string }): string {
  return `<div class="${cx("mw-group", options.className)}" data-slot="group"${
    options.label ? ` role="group" aria-label="${escapeHtml(options.label)}"` : ""
  }>${options.body}</div>`;
}

export function renderCard(options: {
  body: string;
  title?: string;
  description?: string;
  footer?: string;
  action?: string;
  className?: string;
}): string {
  return `<article class="${cx("mw-card", options.className)}" data-slot="card">
    ${options.title || options.description || options.action ? `<header class="mw-card__header"><div>${
      options.title ? `<h2 class="mw-card__title">${escapeHtml(options.title)}</h2>` : ""
    }${options.description ? `<p class="mw-card__description">${escapeHtml(options.description)}</p>` : ""}</div>${
      options.action ?? ""
    }</header>` : ""}
    <div class="mw-card__panel">${options.body}</div>
    ${options.footer ? `<footer class="mw-card__footer">${options.footer}</footer>` : ""}
  </article>`;
}

export function renderScrollArea(options: { body: string; className?: string }): string {
  return `<div class="${cx("mw-scroll", options.className)}" data-slot="scroll-area">${options.body}</div>`;
}

export function renderTable(options: {
  head: ReadonlyArray<string>;
  rows: ReadonlyArray<ReadonlyArray<string>>;
  className?: string;
}): string {
  return `<div class="${cx("mw-table-wrap", options.className)}" data-slot="table"><table class="mw-table"><thead><tr>${
    options.head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")
  }</tr></thead><tbody>${
    options.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}
