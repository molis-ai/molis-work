import { icon, type PluginIconName } from "./icon.js";
import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";
import { type MwButtonOptions, renderButton } from "./button.js";
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

/**
 * A notice. With `actions` it carries the buttons that answer it, in a row under its words (`mw-alert__actions`); they default to
 * ghost, so the caller names the one primary. `state` puts a state mark before the title. `rise` is for the moment it first
 * appears: it rises in and its mark settles; a repaint of the same notice leaves it off so nothing moves again. To send someone
 * back to it, the page adds `is-nudged` (one small hop).
 */
export function renderAlert(options: {
  title: string;
  body?: string;
  tone?: MwTone;
  className?: string;
  state?: StateRingState;
  actions?: readonly MwButtonOptions[];
  rise?: boolean;
  attrs?: Record<string, AttrValue>;
}): string {
  const title = options.state
    ? `<strong class="mw-alert__title"><span class="mw-alert__mark" aria-hidden="true">${renderStateRing({ state: options.state })}</span><span>${escapeHtml(options.title)}</span></strong>`
    : `<strong>${escapeHtml(options.title)}</strong>`;
  const actions = options.actions?.length
    ? `<div class="mw-alert__actions">${options.actions.map((action) => renderButton({ variant: "ghost", ...action })).join("")}</div>`
    : "";
  return `<div class="${cx("mw-alert", `mw-alert--${options.tone ?? "info"}`, options.rise && "mw-alert--rise", options.className)}" data-slot="alert" role="status"${renderAttrs(options.attrs)}>${title}${
    options.body ? `<p>${escapeHtml(options.body)}</p>` : ""
  }${actions}</div>`;
}

/**
 * What someone wrote, kept right under the field it came from when the field took another version (`mw-kept`): `who` says whose
 * words these are, `action` puts them back. Once put back the same slot holds the other version, `swapped`, with the way back as
 * its `action`. A long text shows three lines; `more` is the way to the rest, shown only when the text is really cut (the page
 * measures, because how much fits depends on the width). `rise` is for its first appearance, and `index` staggers a group.
 */
export function renderKept(options: {
  who: string;
  text: string;
  /** Said instead of the text when it is empty ("you cleared this field"). */
  blankText?: string;
  action: MwButtonOptions;
  swapped?: boolean;
  more?: { label: string; open?: boolean; attrs?: Record<string, AttrValue> };
  rise?: boolean;
  index?: number;
  className?: string;
  attrs?: Record<string, AttrValue>;
}): string {
  const more = options.more
    ? renderButton({ variant: "link", className: "mw-kept__more", label: options.more.label, attrs: { "aria-expanded": options.more.open ? "true" : "false", ...options.more.attrs } })
    : "";
  return `<div class="${cx("mw-kept", options.swapped && "is-swapped", options.rise && "mw-kept--rise", options.className)}" data-slot="kept"${
    options.index ? ` style="--i:${Math.max(0, Math.trunc(options.index))}"` : ""
  }${renderAttrs(options.attrs)}><div class="mw-kept__head"><span class="mw-kept__who">${escapeHtml(options.who)}</span>${renderButton({ variant: "ghost", ...options.action })}</div><p class="${cx(
    "mw-kept__text",
    !options.text && "is-blank",
    options.more?.open && "is-open",
  )}">${escapeHtml(options.text || options.blankText || "")}</p>${more}</div>`;
}

/**
 * The dot on a step that holds something to look at (`mw-step-dot`), so a change on another step can be found: it goes inside
 * the step's number, and its name joins the step button's. It is not shown on the current step, where the thing is in view.
 */
export function renderStepDot(options: { label: string; className?: string }): string {
  const label = escapeHtml(options.label);
  return `<i class="${cx("mw-step-dot", options.className)}" data-slot="step-dot" role="img" aria-label="${label}" title="${label}"></i>`;
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
