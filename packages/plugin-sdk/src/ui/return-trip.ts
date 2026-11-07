import { renderButton } from "./button.js";
import { cx, escapeHtml } from "./html.js";

/**
 * The two shared pieces of the way back from the settings (specs/draft-and-return/spec.md §9, U2, U4). The return bar sits on top
 * of the settings the shell opened for a page: where the person came from, what happens once it is set up, and a way back now. The
 * resume prompt is the one line a page shows where it was, after a reload, before doing the step again: what was set up, the step,
 * and not now. Pages place the prompt and give the words; they draw neither themselves.
 */

/**
 * The bar's states: waiting for what was asked; `look`, nothing to wait for (already set up when the settings opened, or an ordinary
 * link that asked for nothing); set up but not taken back automatically; and the page that is gone.
 */
export type ReturnBarState = "waiting" | "look" | "ready" | "gone";

/**
 * The settings' return bar (an info alert with one secondary button). `title` names where the person came from; `body` says what
 * happens now. The body is a polite live region, so a change of state is heard; the bar itself is a labelled region.
 */
export function renderReturnBar(options: { title: string; body: string; back: string; label: string; state?: ReturnBarState; className?: string }): string {
  const state = options.state ?? "waiting";
  return `<div class="${cx("mw-alert", state === "ready" ? "mw-alert--success" : "mw-alert--info", "mw-return-bar", options.className)}" data-slot="return-bar" data-return-bar-state="${state}" role="region" aria-label="${escapeHtml(options.label)}">`
    + `<div class="mw-return-bar__text"><strong data-return-bar-title>${escapeHtml(options.title)}</strong><p data-return-bar-body aria-live="polite">${escapeHtml(options.body)}</p></div>`
    + renderButton({ label: options.back, variant: "secondary", icon: "back", className: "mw-return-bar__back", attrs: { "data-return-bar-back": "" } })
    + `</div>`;
}

/**
 * The resume prompt (U2): `title` says what was set up ("刚才去配了模型，已经好了"), `resume` names the step ("接着发送"), `dismiss`
 * declines it. The page handles the two buttons (`data-resume-prompt="resume"` and `"dismiss"`) and removes the prompt after either.
 */
export function renderResumePrompt(options: { title: string; body?: string; resume: string; dismiss: string; className?: string }): string {
  return `<div class="${cx("mw-resume-prompt", options.className)}" data-slot="resume-prompt" role="group" aria-label="${escapeHtml(options.title)}">`
    + `<div class="mw-alert mw-alert--success" role="status"><strong>${escapeHtml(options.title)}</strong>${options.body ? `<p>${escapeHtml(options.body)}</p>` : ""}</div>`
    + `<div class="mw-resume-prompt__actions">${renderButton({ label: options.resume, variant: "primary", attrs: { "data-resume-prompt": "resume" } })}${renderButton({ label: options.dismiss, variant: "secondary", attrs: { "data-resume-prompt": "dismiss" } })}</div>`
    + `</div>`;
}
