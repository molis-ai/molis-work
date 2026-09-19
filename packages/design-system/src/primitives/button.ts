import { icon, type MolisWorkIcon } from "../icons.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";

export type MwButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline" | "link";
export type MwControlSize = "sm" | "md" | "lg" | "icon";

export interface MwButtonOptions {
  variant?: MwButtonVariant;
  size?: MwControlSize;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  icon?: MolisWorkIcon;
  iconOnly?: boolean;
  label: string;
  className?: string;
  attrs?: Record<string, AttrValue>;
}

export function renderButton(options: MwButtonOptions): string {
  const variant = options.variant ?? "primary";
  const size = options.size ?? "sm";
  const disabled = Boolean(options.disabled || options.loading);
  const label = escapeHtml(options.label);
  const leading = options.icon ? icon(options.icon) : "";
  const spinner = options.loading ? `<span class="mw-spinner" data-slot="button-loading-indicator" aria-hidden="true"></span>` : "";
  const text = options.iconOnly
    ? `<span class="mw-sr-only">${label}</span>`
    : `<span data-slot="button-label">${label}</span>`;
  return `<button type="${options.type ?? "button"}" class="${cx(
    "mw-btn",
    `mw-btn--${variant}`,
    `mw-btn--${size}`,
    options.iconOnly && "mw-btn--icon-only",
    options.className,
  )}" data-slot="button"${options.loading ? " data-loading" : ""}${disabled ? " disabled" : ""}${
    options.iconOnly ? ` aria-label="${label}"` : ""
  }${renderAttrs(options.attrs)}>${spinner}${leading}${text}</button>`;
}
