import { cx, escapeHtml, icon, renderAttrs, renderButton, type AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";

export { renderMenu, renderMenuItem, renderPopover, renderPreviewCard, renderSheet } from "@molis-ai/molis-work-plugin-sdk/ui";

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

export function renderAlertDialog(options: Parameters<typeof renderDialog>[0]): string {
  return renderDialog({ ...options, alert: true });
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
