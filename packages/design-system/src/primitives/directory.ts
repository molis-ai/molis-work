import { icon, type MolisWorkIcon } from "../icons.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderStatusMark, type MwStatusTone } from "./feedback.js";

export type DirectoryRowDensity = "compact" | "meta";
export type DirectoryStatusTone = MwStatusTone;

export interface DirectoryRow {
  title: string;
  caption?: string;
  icon?: MolisWorkIcon;
  count?: number | string;
  status?: string;
  statusTone?: DirectoryStatusTone;
  statusIcon?: MolisWorkIcon;
  selected?: boolean;
  current?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  density?: DirectoryRowDensity;
  href?: string;
  draggable?: boolean;
  trailing?: string;
  /** Overlay trailing actions on hover/selected instead of reserving a trailing column. */
  yield?: boolean;
  /** Split a filename so the stem yields and the extension stays. */
  fileName?: boolean;
  className?: string;
  attrs?: Record<string, AttrValue>;
  wrapperAttrs?: Record<string, AttrValue>;
}

export interface DirectoryAddOptions {
  label: string;
  icon?: MolisWorkIcon;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

export interface DirectoryPanelOptions {
  pluginId: string;
  /** A plugin-local list must not join the host navigation inventory. */
  embedded?: boolean;
  listLabel: string;
  body: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
  tools?: string;
  listRole?: "listbox" | "list" | "none";
  listClassName?: string;
  listAttrs?: Record<string, AttrValue>;
  empty?: string;
  emptyInList?: boolean;
  add?: DirectoryAddOptions;
  addPlacement?: "start" | "end";
  footer?: string;
  label?: string;
}

export function renderDirectoryHeading(label: string): string {
  return `<h2 class="mw-dir__heading" data-slot="directory-heading">${escapeHtml(label)}</h2>`;
}

/** Keep a file extension visible while the stem yields. URLs stay one run of text. */
export function renderDirectoryTitle(title: string, fileName = false): string {
  if (!fileName || title.includes("://")) return escapeHtml(title);
  const match = title.match(/^(.+?)(\.[A-Za-z0-9]{1,8})$/);
  if (!match || match[1].length < 2) return escapeHtml(title);
  return `<span class="mw-dir-row__stem">${escapeHtml(match[1])}</span><span class="mw-dir-row__ext">${escapeHtml(match[2])}</span>`;
}

export function renderDirectoryAdd(options: DirectoryAddOptions): string {
  return `<button type="button" class="${cx("mw-dir__add", options.className)}" data-slot="directory-add"${renderAttrs(options.attrs)}>${
    icon(options.icon ?? "plus")
  }<span>${escapeHtml(options.label)}</span></button>`;
}

export function renderDirectoryRow(options: DirectoryRow): string {
  const density = options.density ?? "compact";
  const tag = options.href ? "a" : "button";
  const selected = Boolean(options.selected || options.current);
  const count = options.count === undefined ? "" : `<span class="mw-dir-row__count">${escapeHtml(options.count)}</span>`;
  const status = options.status
    ? renderStatusMark({
        label: options.status,
        tone: options.statusTone ?? "idle",
        icon: options.statusIcon,
        plain: true,
        className: "mw-dir-row__status",
      })
    : "";
  const resolvedCaption = density === "meta" ? (options.caption || "") : "";
  const copy = `<span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${renderDirectoryTitle(options.title, options.fileName)}</strong>${count}${status}</span>${
    resolvedCaption ? `<small>${escapeHtml(resolvedCaption)}</small>` : ""
  }</span>`;
  const mark = options.icon ? `<span class="mw-dir-row__icon">${icon(options.icon)}</span>` : "";
  const row = `<${tag}${tag === "button" ? ` type="button"` : ""}${
    options.href ? ` href="${escapeHtml(options.href)}"` : ""
  } title="${escapeHtml(options.title)}" class="${cx(
    "mw-dir-row",
    `mw-dir-row--${density}`,
    "directory-list-row",
    selected && "is-selected",
    options.className,
  )}" data-slot="directory-row"${selected && options.current ? ` aria-current="page"` : ""}${renderAttrs(options.attrs)}${
    options.draggable ? ` draggable="true"` : ""
  }${options.hidden ? " hidden" : ""}${options.disabled ? " disabled" : ""}>${mark}${copy}</${tag}>`;
  if (!options.trailing && !options.wrapperAttrs) return row;
  const ops = options.trailing
    ? (options.yield ? `<span class="mw-dir-row__ops">${options.trailing}</span>` : options.trailing)
    : "";
  return `<div class="${cx("mw-dir-row-wrap", options.yield && "is-yield")}"${renderAttrs(options.wrapperAttrs)}>${row}${ops}</div>`;
}

export function renderDirectoryPanel(options: DirectoryPanelOptions): string {
  const tools = (options.label || options.tools)
    ? `<div class="mw-dir__tools" data-directory-list-actions>${
        options.label ? `<span class="mw-dir__label">${escapeHtml(options.label)}</span>` : ""
      }${options.tools ?? ""}</div>`
    : "";
  const listRole = options.listRole ?? "listbox";
  const empty = options.empty ?? "";
  const emptyInList = options.emptyInList !== false;
  const list = listRole === "none"
    ? `<div class="${cx("mw-dir__body", options.listClassName)}"${renderAttrs(options.listAttrs)}>${options.body}${emptyInList ? empty : ""}</div>`
    : `<div class="${cx("mw-dir__list", options.listClassName)}" role="${listRole}" aria-label="${escapeHtml(options.listLabel)}"${renderAttrs(options.listAttrs)}>${options.body}${emptyInList ? empty : ""}</div>`;
  const footer = options.footer ? `<footer class="mw-dir__footer">${options.footer}</footer>` : "";
  const add = options.add ? renderDirectoryAdd(options.add) : "";
  const addBeforeList = options.addPlacement === "start" ? add : "";
  const addAfterList = options.addPlacement === "start" ? "" : add;
  return `<section class="${cx("mw-dir", "desktop-directory-panel", options.className)}" data-slot="directory" ${options.embedded ? "" : `data-directory-panel="${escapeHtml(options.pluginId)}"`}${renderAttrs(options.attrs)}>${tools}${addBeforeList}${list}${
    emptyInList ? "" : empty
  }${addAfterList}${footer}</section>`;
}
