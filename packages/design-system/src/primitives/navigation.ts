import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";

export function renderTabs(options: {
  label: string;
  tabs: ReadonlyArray<{ id: string; label: string; selected?: boolean; attrs?: Record<string, AttrValue> }>;
  className?: string;
}): string {
  return `<div class="${cx("mw-tabs", options.className)}" data-slot="tabs"><div class="mw-tabs__list" role="tablist" aria-label="${escapeHtml(options.label)}">${
    options.tabs.map((tab) => `<button type="button" class="${cx("mw-tabs__tab", tab.selected && "is-active")}" role="tab" aria-selected="${tab.selected ? "true" : "false"}"${renderAttrs({
      "data-tab": tab.id,
      ...tab.attrs,
    })}>${escapeHtml(tab.label)}</button>`).join("")
  }</div></div>`;
}

export function renderToolbar(options: { body: string; className?: string }): string {
  return `<div class="${cx("mw-toolbar", options.className)}" data-slot="toolbar" role="toolbar">${options.body}</div>`;
}

export function renderToggleGroup(options: {
  label: string;
  items: ReadonlyArray<{ value: string; label: string; current?: boolean; attrs?: Record<string, AttrValue> }>;
  className?: string;
}): string {
  return `<div class="${cx("mw-toggle-group", options.className)}" data-slot="toggle-group" role="group" aria-label="${escapeHtml(options.label)}">${
    options.items.map((item) => `<button type="button" class="${cx("mw-toggle", item.current && "is-current")}" aria-pressed="${item.current ? "true" : "false"}"${renderAttrs({
      value: item.value,
      ...item.attrs,
    })}>${escapeHtml(item.label)}</button>`).join("")
  }</div>`;
}

export function renderCollapsible(options: { summary: string; body: string; open?: boolean; className?: string }): string {
  return `<details class="${cx("mw-collapsible", options.className)}" data-slot="collapsible"${options.open ? " open" : ""}><summary>${escapeHtml(options.summary)}</summary><div class="mw-collapsible__body">${options.body}</div></details>`;
}

export function renderAccordion(options: {
  items: ReadonlyArray<{ summary: string; body: string; open?: boolean }>;
  className?: string;
}): string {
  return `<div class="${cx("mw-accordion", options.className)}" data-slot="accordion">${
    options.items.map((item) => renderCollapsible(item)).join("")
  }</div>`;
}

export function renderPagination(options: {
  page: number;
  pages: number;
  className?: string;
}): string {
  const buttons = Array.from({ length: options.pages }, (_, index) => {
    const page = index + 1;
    return `<button type="button" class="${cx("mw-pagination__page", page === options.page && "is-current")}" ${
      page === options.page ? 'aria-current="page"' : ""
    }>${page}</button>`;
  }).join("");
  return `<nav class="${cx("mw-pagination", options.className)}" data-slot="pagination" aria-label="分页">
    <button type="button" class="mw-pagination__page" ${options.page <= 1 ? "disabled" : ""} aria-label="上一页">上一页</button>
    ${buttons}
    <button type="button" class="mw-pagination__page" ${options.page >= options.pages ? "disabled" : ""} aria-label="下一页">下一页</button>
  </nav>`;
}

export function renderBreadcrumb(options: {
  items: ReadonlyArray<{ label: string; href?: string }>;
  className?: string;
}): string {
  return `<nav class="${cx("mw-breadcrumb", options.className)}" data-slot="breadcrumb" aria-label="路径"><ol>${
    options.items.map((item, index) => {
      const last = index === options.items.length - 1;
      const inner = item.href && !last
        ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`
        : `<span${last ? " aria-current=\"page\"" : ""}>${escapeHtml(item.label)}</span>`;
      return `<li>${inner}</li>`;
    }).join("")
  }</ol></nav>`;
}

export function renderCombobox(options: {
  labelledBy?: string;
  placeholder?: string;
  items: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<div class="${cx("mw-combobox", options.className)}" data-slot="combobox"${renderAttrs(options.attrs)}>
    <input class="mw-input" role="combobox" aria-expanded="false" aria-autocomplete="list"${
      options.labelledBy ? ` aria-labelledby="${escapeHtml(options.labelledBy)}"` : ""
    } placeholder="${escapeHtml(options.placeholder ?? "")}">
    <div class="mw-combobox__list" role="listbox">${options.items}</div>
  </div>`;
}
