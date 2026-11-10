import { renderResumePrompt } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiReturnOutcome } from "@molis-ai/molis-work-plugin-sdk";
import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import { reload } from "./list.js";
import { notice, q, type CogniaPage } from "./page.js";

const uiText = globalThis.t;

/**
 * The model the asks need (specs/draft-and-return §4): the model-settings button asks the settings for a model with the step `query`, the ask
 * the missing model held back. Back with a model, the list reads again and, once a read shows the model can run (the read right
 * after going back may not yet: the settings tell the pages a first model is ready after that, and the list reads again then), the
 * platform's resume prompt offers that ask once; it opens the ask's dialog and nothing more, so what is asked is still the person's.
 * A trip that ended after the page was rebuilt comes back through `arrived()` the same way.
 */
export function installReturns(page: CogniaPage, ask: () => void): void {
  void page.host.returns.arrived().then(outcome => { if (outcome) void back(page, outcome, ask); }, () => undefined);
}

export async function goForModel(page: CogniaPage, ask: () => void): Promise<void> {
  try { await back(page, await page.host.returns.go({ kind: "model" }, { step: "query" }), ask); }
  catch (error) { notice(page, messageOf(error)); }
}

async function back(page: CogniaPage, outcome: UiReturnOutcome, ask: () => void): Promise<void> {
  page.modelRead = outcome.status === "ready" && outcome.carry.step === "query" ? () => {
    if (!page.state.ai_available) return;
    page.modelRead = undefined;
    offer(page, ask);
  } : undefined;
  await reload(page);
}

/** Draws the resume prompt above the model line; only a press on its resume button opens the ask. */
function offer(page: CogniaPage, ask: () => void): void {
  page.root.querySelector("[data-cognia-resume]")?.remove();
  const holder = document.createElement("div");
  holder.dataset.cogniaResume = "";
  holder.className = "cognia-resume";
  holder.innerHTML = renderResumePrompt({ title: uiText.text("cognia.resume.model-ready"), resume: uiText.text("cognia.resume.ask"), dismiss: uiText.text("cognia.resume.dismiss") });
  q(page, "[data-cognia-model]").before(holder);
  holder.addEventListener("click", event => {
    const choice = (event.target as Element | null)?.closest<HTMLElement>("[data-resume-prompt]")?.dataset.resumePrompt;
    if (!choice) return;
    holder.remove();
    if (choice === "resume") ask();
  });
}
