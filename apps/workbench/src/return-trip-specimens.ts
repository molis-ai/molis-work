import { t as uiText, escapeHtml, renderBadge, renderReturnBar, renderResumePrompt, type ReturnBarState } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The component board's 回到原处 section (specs/draft-and-return/spec.md §9, U2 and U4): the settings' return bar in each of its
 * states, after the service-connections prototype's plan B top bar (docs/design/service-connections/), and the shared 接着做 prompt
 * a page shows after a reload, whose look follows the connections page's 接着改／放弃改动. Both are new parts of this batch and are
 * marked for the D track's joint review (`data-board-review="d-track"`). The places and drafts are sample data; nothing goes anywhere.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

function figure(_L: Say, caption: string, body: string): string {
  return `<figure class="mw-catalog__specimen" data-board-review="d-track"><figcaption>${escapeHtml(caption)} ${renderBadge({ label: uiText.text("workbench.return-trip-specimens.awaiting-d-track-review"), tone: "info" })}</figcaption>${body}</figure>`;
}

function bar(_L: Say, name: string, state: ReturnBarState, body: string, back: string, kept = false): string {
  return renderReturnBar({ title: uiText.text("workbench.return-trip-specimens.name", { name }), body: uiText.text(body) + (kept ? uiText.text("workbench.return-trip-specimens.what-wrote-kept") : ""), back: uiText.text(back), label: uiText.text("workbench.return-trip-specimens.where-came"), state });
}

function barsSpecimen(readText: Say): string {
  const row = (label: string, body: string) => `<li><span>${escapeHtml(uiText.text(label))}</span>${body}</li>`;
  return `<ul class="mw-return-board__states">
    ${row("workbench.return-trip-specimens.waiting", bar(readText, "Coding", "waiting", "workbench.return-trip-specimens.goes-back-once-model-set-up", "workbench.return-trip-specimens.go-back-now", true))}
    ${row("workbench.return-trip-specimens.waiting-connect", bar(readText, "Feed", "waiting", "workbench.return-trip-specimens.goes-back-once-connected", "workbench.return-trip-specimens.go-back-now"))}
    ${row("workbench.return-trip-specimens.already-set-up", bar(readText, "Feed", "look", "workbench.return-trip-specimens.when-youre-done-press-go-back-return-where", "workbench.return-trip-specimens.go-back"))}
    ${row("workbench.return-trip-specimens.set-up", bar(readText, "Coding", "ready", "workbench.return-trip-specimens.its-set-up-can-go-back-now", "workbench.return-trip-specimens.go-back"))}
    ${row("workbench.return-trip-specimens.page-closed", bar(readText, "Images", "gone", "workbench.return-trip-specimens.page-came-closed-what-set-up-kept", "workbench.return-trip-specimens.close-settings"))}
  </ul>`;
}

function narrowSpecimen(readText: Say): string {
  return `<div class="mw-return-board__narrow">${bar(readText, "Cognia", "waiting", "workbench.return-trip-specimens.goes-back-once-model-set-up", "workbench.return-trip-specimens.go-back-now")}</div>`;
}

function resumeSpecimen(_L: Say): string {
  const prompt = (title: string, body: string, resume: string) =>
    renderResumePrompt({ title: uiText.text(title), body: uiText.text(body), resume: uiText.text(resume), dismiss: uiText.text("workbench.return-trip-specimens.not-now") });
  return `<div class="mw-return-board__prompts">
    ${prompt("workbench.return-trip-specimens.model-went-set-up-ready", "workbench.return-trip-specimens.what-wrote-still-message-box", "workbench.return-trip-specimens.send-now")}
    ${prompt("workbench.return-trip-specimens.git-hub-connected", "workbench.return-trip-specimens.push-these-3-commits-now", "workbench.return-trip-specimens.push-now")}
  </div>`;
}

export function renderReturnTripSection(readText: Say): string {
  return `<section class="mw-catalog__section" id="return-trips" data-primitive="return-trips"><h2>${escapeHtml(uiText.text("workbench.return-trip-specimens.back-where-were"))}</h2>
    <div class="mw-catalog__specimens">
      ${figure(readText, uiText.text("workbench.return-trip-specimens.return-bar-above-settings-where-came-what-happens"), barsSpecimen(readText))}
      ${figure(readText, uiText.text("workbench.return-trip-specimens.return-bar-narrow-390"), narrowSpecimen(readText))}
      ${figure(readText, uiText.text("workbench.return-trip-specimens.carry-back-after-reload-reopen-asked-once-before"), resumeSpecimen(readText))}
    </div>
  </section>`;
}

/** The board's own layout for the section; the parts' look is the design system's (`.mw-return-bar`, `.mw-resume-prompt`). */
export const RETURN_TRIP_SECTION_STYLES = ".mw-return-board__states{display:grid;gap:12px;max-width:760px;margin:0;padding:0;list-style:none}"
  + ".mw-return-board__states>li{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:12px;min-width:0}"
  + ".mw-return-board__states>li>span:first-child{color:var(--ink-soft);font-size:12px}"
  + ".mw-return-board__narrow{box-sizing:border-box;width:390px;max-width:100%;padding:16px;border:1px dashed var(--line);border-radius:12px}"
  + ".mw-return-board__prompts{display:grid;gap:24px;max-width:560px}"
  + "@media (max-width:760px){.mw-return-board__states>li{grid-template-columns:minmax(0,1fr);gap:4px}}";
