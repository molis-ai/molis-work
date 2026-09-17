import { icon } from "../icons.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderButton } from "./button.js";

export function renderDialog(options: {
  labelledBy: string;
  title: string;
  description?: string;
  body: string;
  footer: string;
  alert?: boolean;
  className?: string;
  attrs?: Record<string, AttrValue>;
  closeLabel?: string;
}): string {
  const close = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "x",
    iconOnly: true,
    label: options.closeLabel ?? "关闭",
    className: "mw-dialog__close",
    attrs: { "data-dialog-close": true },
  });
  return `<dialog class="${cx("mw-dialog", options.alert && "mw-dialog--alert", options.className)}" data-slot="${
    options.alert ? "alert-dialog" : "dialog"
  }" aria-labelledby="${escapeHtml(options.labelledBy)}"${renderAttrs(options.attrs)}>
    <form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="${escapeHtml(options.labelledBy)}">${escapeHtml(options.title)}</h2>${
        options.description ? `<p>${escapeHtml(options.description)}</p>` : ""
      }</div>${close}</header>
      <div class="mw-form__body">${options.body}</div>
      <footer class="mw-form__footer">${options.footer}</footer>
    </form>
  </dialog>`;
}

export function renderSheet(options: {
  labelledBy: string;
  title: string;
  description?: string;
  body: string;
  footer: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
  closeLabel?: string;
}): string {
  const close = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "x",
    iconOnly: true,
    label: options.closeLabel ?? "关闭",
    className: "mw-dialog__close",
    attrs: { "data-dialog-close": true },
  });
  return `<dialog class="${cx("mw-sheet", options.className)}" data-slot="sheet" aria-labelledby="${escapeHtml(options.labelledBy)}"${renderAttrs(options.attrs)}>
    <form method="dialog" class="mw-form mw-sheet__shell">
      <header class="mw-form__header"><div><h2 id="${escapeHtml(options.labelledBy)}">${escapeHtml(options.title)}</h2>${
        options.description ? `<p>${escapeHtml(options.description)}</p>` : ""
      }</div>${close}</header>
      <div class="mw-form__body">${options.body}</div>
      <footer class="mw-form__footer">${options.footer}</footer>
    </form>
  </dialog>`;
}

export function renderAlertDialog(options: Parameters<typeof renderDialog>[0]): string {
  return renderDialog({ ...options, alert: true });
}

export function renderPopover(options: {
  body: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
  preview?: boolean;
}): string {
  return `<div class="${cx("mw-popover", options.className)}" data-slot="popover"${
    options.preview ? "" : ` popover="auto"`
  }${renderAttrs(options.attrs)}>${options.body}</div>`;
}

export function renderTooltip(options: { text: string; className?: string }): string {
  return `<span class="${cx("mw-tooltip", options.className)}" data-slot="tooltip" role="tooltip">${escapeHtml(options.text)}</span>`;
}

function hintIdent(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+/, "") || "hint";
}

export function renderHint(options: {
  id: string;
  label: string;
  text?: string;
  html?: string;
  iconName?: Parameters<typeof icon>[0];
}): string {
  const ident = hintIdent(options.id);
  const anchor = `--${ident}`;
  const body = options.html ?? escapeHtml(options.text ?? "");
  return `<span class="mw-hint"><button type="button" class="mw-hint__trigger" popovertarget="${escapeHtml(ident)}" aria-label="${escapeHtml(options.label)}" style="anchor-name: ${anchor}">${icon(options.iconName ?? "circle-alert")}</button><div id="${escapeHtml(ident)}" class="mw-tooltip mw-hint__tooltip" data-slot="tooltip" role="tooltip" popover="auto" style="position-anchor: ${anchor}">${body}</div></span>`;
}

export function renderMenu(options: { items: string; className?: string; labelledBy?: string }): string {
  return `<div class="${cx("mw-menu", options.className)}" data-slot="menu" role="menu"${
    options.labelledBy ? ` aria-labelledby="${escapeHtml(options.labelledBy)}"` : ""
  }>${options.items}</div>`;
}

export function renderMenuItem(options: { label: string; iconName?: Parameters<typeof icon>[0]; danger?: boolean; attrs?: Record<string, AttrValue> }): string {
  return `<button type="button" class="${cx("mw-menu__item", options.danger && "mw-menu__item--danger")}" role="menuitem"${renderAttrs(options.attrs)}>${
    options.iconName ? icon(options.iconName) : ""
  }<span>${escapeHtml(options.label)}</span></button>`;
}

export function renderDrawer(options: {
  labelledBy: string;
  title: string;
  description?: string;
  body: string;
  footer?: string;
  side?: "left" | "right" | "bottom";
  className?: string;
  attrs?: Record<string, AttrValue>;
  closeLabel?: string;
}): string {
  const close = renderButton({
    variant: "ghost",
    size: "icon",
    icon: "x",
    iconOnly: true,
    label: options.closeLabel ?? "关闭",
    className: "mw-dialog__close",
    attrs: { "data-dialog-close": true },
  });
  return `<dialog class="${cx("mw-drawer", `mw-drawer--${options.side ?? "left"}`, options.className)}" data-slot="drawer" aria-labelledby="${escapeHtml(options.labelledBy)}"${renderAttrs(options.attrs)}>
    <form method="dialog" class="mw-form mw-drawer__shell">
      <header class="mw-form__header"><div><h2 id="${escapeHtml(options.labelledBy)}">${escapeHtml(options.title)}</h2>${
        options.description ? `<p>${escapeHtml(options.description)}</p>` : ""
      }</div>${close}</header>
      <div class="mw-form__body mw-scroll">${options.body}</div>
      ${options.footer ? `<footer class="mw-form__footer">${options.footer}</footer>` : ""}
    </form>
  </dialog>`;
}

export function renderContextMenu(options: { items: string; className?: string }): string {
  return `<div class="${cx("mw-menu", "mw-menu--context", options.className)}" data-slot="context-menu" role="menu">${options.items}</div>`;
}

export function renderPreviewCard(options: {
  title: string;
  body: string;
  className?: string;
}): string {
  return `<article class="${cx("mw-preview-card", options.className)}" data-slot="preview-card"><strong>${escapeHtml(options.title)}</strong><p>${escapeHtml(options.body)}</p></article>`;
}

export function renderCommand(options: {
  labelledBy: string;
  placeholder: string;
  groups: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  return `<dialog class="${cx("mw-dialog", "mw-command", options.className)}" data-slot="command" aria-labelledby="${escapeHtml(options.labelledBy)}"${renderAttrs(options.attrs)}>
    <form method="dialog" class="mw-command__shell">
      <header><h2 id="${escapeHtml(options.labelledBy)}" class="mw-sr-only">${escapeHtml(options.labelledBy)}</h2>
      <input class="mw-input" data-slot="command-input" type="search" placeholder="${escapeHtml(options.placeholder)}"></header>
      <div class="mw-command__list" role="listbox">${options.groups}</div>
    </form>
  </dialog>`;
}
