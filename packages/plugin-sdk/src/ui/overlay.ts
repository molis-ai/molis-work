import { renderButton } from "./button.js";
import { cx, escapeHtml, renderAttrs, type AttrValue } from "./html.js";
import { icon } from "./icon.js";

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

export function renderMenu(options: { items: string; className?: string; labelledBy?: string }): string {
  return `<div class="${cx("mw-menu", options.className)}" data-slot="menu" role="menu"${
    options.labelledBy ? ` aria-labelledby="${escapeHtml(options.labelledBy)}"` : ""
  }>${options.items}</div>`;
}

/**
 * A menu item; `checked` makes it a checkbox item whose leading slot holds the tick, `shortcut` sits at the far end.
 * `description` is a quiet second line under the name (`mw-menu__desc`): what choosing it does, or why it cannot be chosen.
 */
export function renderMenuItem(options: {
  label: string;
  description?: string;
  iconName?: Parameters<typeof icon>[0];
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  attrs?: Record<string, AttrValue>;
}): string {
  const checkable = options.checked !== undefined;
  const lead = checkable ? `<span class="mw-menu__check" aria-hidden="true">${options.checked ? icon("check") : ""}</span>` : options.iconName ? icon(options.iconName) : "";
  const label = options.description
    ? `<span>${escapeHtml(options.label)}</span><small class="mw-menu__desc">${escapeHtml(options.description)}</small>`
    : escapeHtml(options.label);
  return `<button type="button" class="${cx("mw-menu__item", options.danger && "mw-menu__item--danger", options.description && "mw-menu__item--described")}" role="${checkable ? "menuitemcheckbox" : "menuitem"}"${
    checkable ? ` aria-checked="${options.checked}"` : ""
  }${options.disabled ? " disabled" : ""}${renderAttrs(options.attrs)}>${lead}<span data-slot="menu-item-label">${label}</span>${
    options.shortcut ? `<span class="mw-menu__shortcut">${escapeHtml(options.shortcut)}</span>` : ""
  }</button>`;
}

export function renderPreviewCard(options: {
  title: string;
  body: string;
  className?: string;
}): string {
  return `<article class="${cx("mw-preview-card", options.className)}" data-slot="preview-card"><strong>${escapeHtml(options.title)}</strong><p>${escapeHtml(options.body)}</p></article>`;
}
