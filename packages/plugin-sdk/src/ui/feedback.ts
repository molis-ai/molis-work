import { icon, type PluginIconName } from "./icon.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { renderStateRing } from "./state-ring.js";
import type { StateRingState } from "./state-ring-states.js";

export type MwTone = "neutral" | "info" | "success" | "warning" | "danger";
export type MwStatusTone = "idle" | "progress" | "attention" | "hold" | "blocked" | "done" | "quiet";

export function renderStatusMark(options: {
  label: string;
  state?: StateRingState;
  tone?: MwStatusTone;
  icon?: PluginIconName;
  plain?: boolean;
  className?: string;
  labelAttrs?: Record<string, AttrValue>;
}): string {
  return `<span class="${cx(
    "mw-status",
    options.tone && `mw-status--${options.tone}`,
    options.plain && "mw-status--plain",
    options.className,
  )}" data-slot="status">${options.state ? renderStateRing({ state: options.state }) : options.icon ? icon(options.icon) : ""}<span${renderAttrs(options.labelAttrs)}>${escapeHtml(options.label)}</span></span>`;
}

export function renderBadge(options: { label: string; tone?: MwTone; className?: string }): string {
  return `<span class="${cx("mw-badge", `mw-badge--${options.tone ?? "neutral"}`, options.className)}" data-slot="badge">${escapeHtml(options.label)}</span>`;
}

export function renderAlert(options: {
  title: string;
  body?: string;
  tone?: MwTone;
  className?: string;
}): string {
  return `<div class="${cx("mw-alert", `mw-alert--${options.tone ?? "info"}`, options.className)}" data-slot="alert" role="status"><strong>${escapeHtml(options.title)}</strong>${
    options.body ? `<p>${escapeHtml(options.body)}</p>` : ""
  }</div>`;
}

export function renderEmpty(options: {
  icon?: PluginIconName;
  title: string;
  body: string;
  action?: string;
  className?: string;
}): string {
  return `<div class="${cx("mw-empty", options.className)}" data-slot="empty">${
    options.icon ? `<span class="mw-empty__mark">${icon(options.icon)}</span>` : ""
  }<h2>${escapeHtml(options.title)}</h2><p>${escapeHtml(options.body)}</p>${options.action ?? ""}</div>`;
}

/** The one toast's markup (styles: `.mw-toast`). A success or a failure carries its state mark; a failure also nudges once. */
export function renderToast(options: { message: string; tone?: MwTone; action?: { label: string; attrs?: Record<string, AttrValue> }; className?: string; attrs?: Record<string, AttrValue> }): string {
  const state = options.tone === "success" ? "done" : options.tone === "danger" ? "failed" : "";
  const action = options.action ? `<button type="button" class="mw-toast__action"${renderAttrs(options.action.attrs)}>${escapeHtml(options.action.label)}</button>` : "";
  return `<div class="${cx("mw-toast", options.tone === "danger" && "is-error", options.className)}" data-slot="toast" role="status"${state ? ` data-mw-state="${state}"` : ""}${renderAttrs(options.attrs)}><span>${escapeHtml(options.message)}</span>${action}</div>`;
}

export function renderSpinner(options: { label?: string; className?: string } = {}): string {
  return `<span class="${cx("mw-spinner", options.className)}" data-slot="spinner" data-ring-mounted aria-hidden="${options.label ? "false" : "true"}"${
    options.label ? ` role="status" aria-label="${escapeHtml(options.label)}"` : ""
  }>${renderStateRing({ state: "running" })}</span>`;
}

export function renderSkeleton(options: { className?: string } = {}): string {
  return `<span class="${cx("mw-skeleton", options.className)}" data-slot="skeleton" aria-hidden="true"></span>`;
}

export function renderProgress(options: { value: number; max?: number; label?: string; className?: string }): string {
  const max = options.max ?? 100;
  const value = Math.max(0, Math.min(options.value, max));
  return `<div class="${cx("mw-progress", options.className)}" data-slot="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"${
    options.label ? ` aria-label="${escapeHtml(options.label)}"` : ""
  }><span style="width:${(value / max) * 100}%"></span></div>`;
}

export function renderKbd(keys: string): string {
  return `<kbd class="mw-kbd" data-slot="kbd">${escapeHtml(keys)}</kbd>`;
}

export function renderSeparator(options: { className?: string } = {}): string {
  return `<hr class="${cx("mw-separator", options.className)}" data-slot="separator">`;
}

export function renderAvatar(options: { label: string; className?: string }): string {
  const initial = Array.from(options.label.trim())[0] || "?";
  return `<span class="${cx("mw-avatar", options.className)}" data-slot="avatar" aria-label="${escapeHtml(options.label)}">${escapeHtml(initial)}</span>`;
}
