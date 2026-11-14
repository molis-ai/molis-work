import { escapeHtml as esc, renderAlert, renderBadge, renderButton, renderPopover, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { RISK_LIMITS } from "../model.js";
import { act, prose, section, text, when } from "./parts.js";
import type { RiskPage, RiskRecord, RiskReview } from "./types.js";

/**
 * The review on a risk's record (specs/risk-plugin/implementation.md §4.5): a one-off Schedule task about this risk. The page shows what
 * Schedule says (when, on or paused, the last round's result or why it did not finish, what the task may read) and asks Schedule, through
 * the risk's review actions, to schedule, pause, resume or cancel it. Granting the task its reads is the person's, on Schedule's own page.
 */

const REVIEW_MARK: Record<RiskReview["state"], { tone: "progress" | "hold" | "done"; state: "running" | "paused" | "done" }> = {
  scheduled: { tone: "progress", state: "running" }, paused: { tone: "hold", state: "paused" }, done: { tone: "done", state: "done" },
};

/** The presets the schedule popover offers, in days from now; the round runs at nine in the morning, local time. */
export const REVIEW_PRESETS = [3, 7, 14] as const;

export function reviewAt(days: number, now = new Date()): string {
  const at = new Date(now);
  at.setDate(at.getDate() + days);
  at.setHours(9, 0, 0, 0);
  return at.toISOString();
}

/** A local `datetime-local` value as an instant with its zone; empty or unreadable gives null. */
export function customAt(value: string): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function picker(review: RiskReview | null): string {
  const presets = REVIEW_PRESETS.map(days => `<button type="submit" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" name="days" value="${days}">${
    esc(text(`review.in-${days}`))}</button>`).join("");
  return renderPopover({ preview: true, className: "rk-pop rk-pop--form", body: `<form class="rk-review-form" data-rk-form="review" novalidate>
    <label class="rk-label" for="rk-review-focus">${esc(text("review.focus"))}</label>
    <input class="mw-input mw-input--sm" id="rk-review-focus" name="focus" maxlength="${RISK_LIMITS.note}" autocomplete="off" value="${esc(review?.focus ?? "")}"
      placeholder="${esc(text("review.focus-hint"))}">
    <span class="rk-label">${esc(text("review.when"))}</span><div class="rk-actions">${presets}</div>
    <div class="rk-actions"><input class="mw-input mw-input--sm" type="datetime-local" name="at" aria-label="${esc(text("review.custom"))}">${
      renderButton({ label: text("review.schedule"), variant: "primary", size: "sm", type: "submit", attrs: { name: "days", value: "custom" } })}</div>
  </form>` });
}

/** What the task may read: no grant means the round reads no risk, and the person grants it on Schedule's page. */
function reads(page: RiskPage, review: RiskReview): string {
  const grants = review.reads;
  const go = page.state.readOnly ? [] : [{ label: text("review.grant"), icon: "key" as const, attrs: { "data-rk-act": "review-grants", "data-rk-value": review.task_id } }];
  if (!grants) return `<p class="rk-muted">${esc(text("review.reads-unknown"))}</p>`;
  if (!grants.granted) return renderAlert({ tone: "warning", title: text("review.no-reads"), body: text("review.no-reads-body"), actions: go });
  if (grants.needs_confirmation || grants.removed || grants.unavailable) return renderAlert({ tone: "warning", title: text("review.reads-attention"), body: text("review.reads-attention-body"), actions: go });
  return `<p class="rk-muted">${esc(text("review.reads-ok"))}</p>`;
}

function outcome(review: RiskReview): string {
  // A round that did not finish is said apart from one that found nothing new (RISK-08).
  if (review.failure) return renderAlert({ tone: "danger", title: text("review.failed"), body: review.failure });
  if (!review.result) return review.last_run_at ? `<p class="rk-muted">${esc(text("review.no-result"))}</p>` : "";
  const mark = review.result.important ? renderBadge({ label: text("review.important"), tone: "warning" }) : renderBadge({ label: text("review.quiet"), tone: "neutral" });
  return `<div class="rk-result"><div class="rk-result__head"><span class="rk-label">${esc(text("review.result", { when: when(review.result.at) }))}</span>${mark}</div>${prose(review.result.text)}</div>`;
}

function controls(page: RiskPage, review: RiskReview | null, risk: RiskRecord): string {
  if (page.state.readOnly || risk.status === "closed") return "";
  const open = page.state.pop === "review";
  const busy = { disabled: page.state.busy };
  const schedule = `<span class="rk-anchor">${act(text(review ? (review.state === "done" ? "review.again" : "review.reschedule") : "review.add"), "pop",
    { value: "review", variant: review ? "ghost" : "secondary", icon: "calendar", ...busy, attrs: { "aria-expanded": String(open), "aria-haspopup": "dialog" } })}${open ? picker(review) : ""}</span>`;
  if (!review) return schedule;
  const future = review.at !== null && Date.parse(review.at) > Date.now();
  const toggle = review.state === "scheduled" ? act(text("review.pause"), "review-enabled", { value: "false", variant: "ghost", icon: "pause", ...busy })
    : review.state === "paused" && future ? act(text("review.resume"), "review-enabled", { value: "true", variant: "ghost", icon: "play", ...busy }) : "";
  return `${schedule}${toggle}${review.state === "done" ? "" : act(text("review.cancel"), "review-cancel", { variant: "ghost", icon: "x", ...busy })}`;
}

export function renderReview(page: RiskPage, risk: RiskRecord): string {
  const { review: answer, reviewError } = page.state;
  if (reviewError) {
    return section(text("review.title"), renderAlert({ tone: "danger", title: text("review.read-failed"), body: reviewError,
      actions: [{ label: text("action.retry"), icon: "refresh", attrs: { "data-rk-act": "reload-review" } }] }));
  }
  if (!answer) return section(text("review.title"), `<p class="rk-muted" aria-busy="true">${esc(text("overview.loading"))}</p>`);
  if (answer.state === "unavailable") return section(text("review.title"), renderAlert({ tone: "info", title: text("review.unavailable"), body: text("review.unavailable-body") }));
  const review = answer.review;
  if (!review) {
    const none = risk.status === "closed" ? text("review.none-closed") : text("review.none");
    return section(text("review.title"), `<p class="rk-muted">${esc(none)}</p><div class="rk-actions">${controls(page, null, risk)}</div>`);
  }
  const mark = renderStatusMark({ label: text(`review.${review.state}`), ...REVIEW_MARK[review.state] });
  const at = review.at ? `<span class="rk-review-at">${esc(when(review.at))}</span>` : "";
  const focus = review.focus.trim() ? `<p class="rk-review-focus"><span class="rk-label">${esc(text("review.focus"))}</span>${esc(review.focus)}</p>` : "";
  return section(text("review.title"), `<div class="rk-review"><div class="rk-review__line">${mark}${at}</div>${focus}${outcome(review)}${reads(page, review)}
    <div class="rk-actions">${controls(page, review, risk)}</div></div>`);
}
