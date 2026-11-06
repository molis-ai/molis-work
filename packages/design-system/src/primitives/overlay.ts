import { cx, escapeHtml, icon, renderAttrs, renderButton, type AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";

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
 * The description line's rules are the board's own until K2 (`COMPOSER_BOARD_STYLES` in catalog-composer.ts); K2 moves
 * `.mw-menu__item--described` and `.mw-menu__desc` into the page sheets. Until then a page that passes `description` gets
 * the unstyled line (squeezed into the item's one nowrap row), so no product page passes it before K2.
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

/** Items that belong together, under an optional quiet heading; consecutive groups are divided by a hairline. */
export function renderMenuGroup(options: { items: string; label?: string }): string {
  return `<div class="mw-menu__group" role="group"${options.label ? ` aria-label="${escapeHtml(options.label)}"` : ""}>${
    options.label ? `<div class="mw-menu__label" aria-hidden="true">${escapeHtml(options.label)}</div>` : ""
  }${options.items}</div>`;
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
