import { cx, escapeHtml } from "./html.js";

/**
 * The prompt's two buttons, the same markup `renderButton` draws for a secondary text button (a test holds the two equal). Written out
 * here so a page bundle that uses only the prompt does not take the icon set `renderButton` brings along.
 */
const choice = (label: string, name: "resume" | "dismiss") =>
  `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-resume-prompt="${name}"><span data-slot="button-label">${escapeHtml(label)}</span></button>`;

/**
 * The resume prompt (U2), as the connections page's 接着改／放弃改动 has it: an info alert and, under it, two secondary buttons, the
 * step first. `title` says what was set up ("刚才去配了模型，已经好了"), `resume` names the step ("接着发送"), `dismiss`
 * declines it. The page handles the two buttons (`data-resume-prompt="resume"` and `"dismiss"`) and removes the prompt after either.
 */
export function renderResumePrompt(options: { title: string; body?: string; resume: string; dismiss: string; className?: string }): string {
  return `<div class="${cx("mw-resume-prompt", options.className)}" data-slot="resume-prompt" role="group" aria-label="${escapeHtml(options.title)}">`
    + `<div class="mw-alert mw-alert--info" role="status"><strong>${escapeHtml(options.title)}</strong>${options.body ? `<p>${escapeHtml(options.body)}</p>` : ""}</div>`
    + `<div class="mw-resume-prompt__actions">${choice(options.resume, "resume")}${choice(options.dismiss, "dismiss")}</div>`
    + `</div>`;
}
