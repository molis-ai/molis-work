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

/** `attrs` carries what places the menu: an `id` and `popover` for one anchored under its button (`data-anchored-menu`). */
export function renderMenu(options: { items: string; className?: string; labelledBy?: string; attrs?: Record<string, AttrValue> }): string {
  return `<div class="${cx("mw-menu", options.className)}" data-slot="menu" role="menu"${
    options.labelledBy ? ` aria-labelledby="${escapeHtml(options.labelledBy)}"` : ""
  }${renderAttrs(options.attrs)}>${options.items}</div>`;
}

/** A stable id for a described item that was given none: the same label and description give the same id on every render. */
function describedItemIdent(label: string, description: string): string {
  let hash = 0x811c9dc5;
  for (const char of `${label}\u0000${description}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0;
  return `mw-menu-item-${hash.toString(36)}`;
}

/**
 * A menu item; `checked` makes it a checkbox item whose leading slot holds the tick, `shortcut` sits at the far end.
 * `description` is a quiet second line under the name (`mw-menu__desc`): what choosing it does, or why it cannot be chosen.
 * A described item's accessible name is its label alone (`aria-labelledby` → `<id>-label`) and the line is its description
 * (`aria-describedby` → `<id>-desc`), so a screen reader says the name, then the consequence, instead of one run-on sentence.
 * `id` names the two; without one it is derived from the label and the description, so an item drawn twice on one page (the
 * same menu in two places) needs one from its caller. K2's composer client gives `<composer id>-delivery-<mode>`.
 * The description line's rules are in the served primitive styles: it aims for one or two lines and wraps, never cut, and
 * stays `--muted` on an item that cannot be chosen, since it is then the reason.
 */
export function renderMenuItem(options: {
  label: string;
  description?: string;
  id?: string;
  iconName?: Parameters<typeof icon>[0];
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  attrs?: Record<string, AttrValue>;
}): string {
  const checkable = options.checked !== undefined;
  const lead = checkable ? `<span class="mw-menu__check" aria-hidden="true">${options.checked ? icon("check") : ""}</span>` : options.iconName ? icon(options.iconName) : "";
  const ident = options.description ? escapeHtml(options.id ?? describedItemIdent(options.label, options.description)) : "";
  const label = options.description
    ? `<span id="${ident}-label">${escapeHtml(options.label)}</span><small class="mw-menu__desc" id="${ident}-desc">${escapeHtml(options.description)}</small>`
    : escapeHtml(options.label);
  return `<button type="button" class="${cx("mw-menu__item", options.danger && "mw-menu__item--danger", options.description && "mw-menu__item--described")}" role="${checkable ? "menuitemcheckbox" : "menuitem"}"${
    checkable ? ` aria-checked="${options.checked}"` : ""
  }${options.description ? ` aria-labelledby="${ident}-label" aria-describedby="${ident}-desc"` : ""}${options.disabled ? " disabled" : ""}${renderAttrs(options.attrs)}>${lead}<span data-slot="menu-item-label">${label}</span>${
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
