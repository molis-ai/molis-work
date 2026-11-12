import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderResumePrompt } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiReturnOutcome } from "@molis-ai/molis-work-plugin-sdk";
import { errorMessage } from "../dom.js";
import type { Page } from "./page.js";
import { status } from "./request.js";
import { select } from "./select.js";

/**
 * Sending without a text model (specs/draft-and-return §3.1, §4): 打开模型设置 takes the words of the session on show to the
 * platform's drafts (`composer:<session>`) and asks the settings for a model with the step `send`. Back with a model, the page asks
 * once with the platform's 接着做 prompt and sends only when the person says so; the send asks what it always asks. A trip that ended
 * after the page was rebuilt comes back through `arrived()` the same way. Without words there is no step: the page just reads again.
 * The copy in the drafts is the trip's alone (the composer keeps its own): it goes once the person answers, or at once when the
 * model is not ready. The prompt is the composer form's first row, at the input's width.
 */
const draftKey = (session: string) => "composer:" + session;

export function mountReturns(page: Page, send: () => Promise<void>): void {
  const { host, lifetime, q } = page;
  const setup = q<HTMLButtonElement>("[data-coding-model-setup]");
  lifetime.listen(setup, "click", () => void goForModel(page, send));
  void host.returns.arrived().then(outcome => { if (outcome) void back(page, outcome, send); }, () => undefined);
}

async function goForModel(page: Page, send: () => Promise<void>): Promise<void> {
  const { host, input, refs, s } = page;
  const session = s.current, words = input.value;
  try {
    let carry = {};
    if (session && words.trim()) {
      await refs.draft.flush();
      await host.drafts.write(draftKey(session), words);
      carry = { draft_key: draftKey(session), step: "send" };
    }
    await back(page, await host.returns.go({ kind: "model" }, carry), send);
  } catch (error) { status(page, errorMessage(error), true); }
}

async function back(page: Page, outcome: UiReturnOutcome, send: () => Promise<void>): Promise<void> {
  const key = outcome.carry.draft_key ?? "", session = key.startsWith("composer:") ? key.slice("composer:".length) : "";
  const { host, input, q, s } = page;
  if (session && outcome.status !== "ready") { await host.drafts.write(key, null); return; }
  if (outcome.status !== "ready" || outcome.carry.step !== "send" || !session) return;
  const words = await host.drafts.read(key);
  if (!words) return;
  page.root.querySelector("[data-coding-resume]")?.remove();
  const holder = document.createElement("div");
  holder.dataset.codingResume = "";
  holder.innerHTML = renderResumePrompt({ title: uiText.text("coding.resume.model-ready"), body: uiText.text("coding.resume.kept"), resume: uiText.text("coding.resume.send"), dismiss: uiText.text("coding.resume.dismiss") });
  q("[data-coding-composer]").prepend(holder);
  holder.querySelector<HTMLElement>("[data-resume-prompt=resume]")?.focus({ preventScroll: true });
  holder.addEventListener("click", event => {
    const choice = (event.target as Element | null)?.closest<HTMLElement>("[data-resume-prompt]")?.dataset.resumePrompt;
    if (!choice) return;
    holder.remove();
    void host.drafts.write(key, null);
    if (choice !== "resume") return;
    void (async () => {
      if (s.current !== session) await select(page, session);
      if (s.current !== session) return;
      if (!input.value.trim()) { input.value = words; window.molisFit?.(input); input.dispatchEvent(new Event("input", { bubbles: true })); }
      await send();
    })().catch((error: unknown) => status(page, errorMessage(error), true));
  });
}
