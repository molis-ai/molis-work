import { icon, type PluginIconName } from "./icon.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderStateRing } from "./state-ring.js";

export type MwButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline" | "link";
export type MwControlSize = "sm" | "md" | "lg" | "icon";

export interface MwButtonOptions {
  variant?: MwButtonVariant;
  size?: MwControlSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  /** Same-origin navigation uses a real link, with the same control styling. */
  href?: string;
  loading?: boolean;
  icon?: PluginIconName;
  iconOnly?: boolean;
  label: string;
  /** The key the button names beside its label (“↵” on a step's primary action); the shortcut itself is the caller's. */
  key?: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

export function renderButton(options: MwButtonOptions): string {
  const variant = options.variant ?? "primary";
  const size = options.size ?? "sm";
  const disabled = Boolean(options.disabled || options.loading);
  const label = escapeHtml(options.label);
  const leading = options.icon ? icon(options.icon) : "";
  const key = options.key && !options.iconOnly ? `<kbd class="mw-btn__key" aria-hidden="true">${escapeHtml(options.key)}</kbd>` : "";
  const spinner = options.loading ? `<span class="mw-spinner" data-slot="button-loading-indicator" data-ring-mounted aria-hidden="true">${renderStateRing({ state: "running" })}</span>` : "";
  const text = options.iconOnly
    ? `<span class="mw-sr-only">${label}</span>`
    : `<span data-slot="button-label">${label}</span>`;
  const href = !disabled && options.href && /^\/(?!\/)/u.test(options.href) && !/[\\\u0000-\u0020\u007f]/u.test(options.href) ? options.href : null;
  const tag = href ? "a" : "button";
  return `<${tag} ${href ? `href="${escapeHtml(href)}"` : `type="${options.type ?? "button"}"`} class="${cx(
    "mw-btn",
    `mw-btn--${variant}`,
    `mw-btn--${size}`,
    options.iconOnly && "mw-btn--icon-only",
    options.className,
  )}" data-slot="button"${options.loading ? " data-loading" : ""}${disabled ? " disabled" : ""}${
    options.iconOnly ? ` aria-label="${label}"` : ""
  }${renderAttrs(options.attrs)}>${spinner}${leading}${text}${key}</${tag}>`;
}
