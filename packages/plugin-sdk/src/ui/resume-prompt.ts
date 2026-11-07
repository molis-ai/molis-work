import { cx, escapeHtml } from "./html.js";

/**
 * The prompt's two buttons, the same markup `renderButton` draws for a small text button. Written out here so a page bundle that uses
 * only the prompt does not take the icon set `renderButton` brings along.
 */
const choice = (label: string, variant: "primary" | "secondary", name: "resume" | "dismiss") =>
  `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--sm" data-slot="button" data-resume-prompt="${name}"><span data-slot="button-label">${escapeHtml(label)}</span></button>`;

/**
 * The resume prompt (U2): `title` says what was set up ("刚才去配了模型，已经好了"), `resume` names the step ("接着发送"), `dismiss`
 * declines it. The page handles the two buttons (`data-resume-prompt="resume"` and `"dismiss"`) and removes the prompt after either.
 */
export function renderResumePrompt(options: { title: string; body?: string; resume: string; dismiss: string; className?: string }): string {
  return `<div class="${cx("mw-resume-prompt", options.className)}" data-slot="resume-prompt" role="group" aria-label="${escapeHtml(options.title)}">`
    + `<div class="mw-alert mw-alert--success" role="status"><strong>${escapeHtml(options.title)}</strong>${options.body ? `<p>${escapeHtml(options.body)}</p>` : ""}</div>`
    + `<div class="mw-resume-prompt__actions">${choice(options.resume, "primary", "resume")}${choice(options.dismiss, "secondary", "dismiss")}</div>`
    + `</div>`;
}
