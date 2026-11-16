import { renderButton, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ComposerHandle } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { assistantComposerLabels } from "../../assistant-composer-labels.js";
import { renderSubtaskSpecimen, subtaskSpecimenView, type SubtaskSpecimenState } from "../../subtask-conversation-specimen.js";

/** Board-only simulation; no task is started. Words and templates always use the current page language. */
const say = (key: string) => t.text(`workbench.subtask-conversation.${key}`);
function specimenDemo(root: HTMLElement) {
  const initial = root.dataset.subtaskDemoState as SubtaskSpecimenState;
  const node = <T extends HTMLElement = HTMLElement>(part: string) => root.querySelector<T>(`[data-subtask-${part}]`)!;
  const composerRoot = node("composer"), messages = node("messages"), thread = node("thread"), feedback = node("feedback");
  let state = initial, draft = "", busy = false, failedRead = Boolean(feedback.textContent);
  let handle: ComposerHandle;
  const adapter = { read: async () => draft, write: async (text: string) => { draft = text; } };
  function feedbackText() {
    feedback.innerHTML = failedRead ? `${t("workbench.subtask-conversation.read-failed")} ${renderButton({ label: say("retry"), variant: "link", attrs: { "data-subtask-retry": true } })}` : "";
  }
  function update() {
    const view = subtaskSpecimenView(state);
    handle.setRunning(view.running); handle.hold(view.inputUnavailable ?? null);
  }
  function mountInput() {
    handle?.destroy();
    handle = window.molisComposer!(composerRoot, {
      kind: "ai", entry: `subtask-board-${initial}`, labels: { ...assistantComposerLabels(t.text, true), input: say("input") },
      sources: false, draft: { adapter }, receiver: () => ({ label: say("writer"), icon: "user" }),
      submit: async input => {
        const item = document.createElement("article"); item.className = "mw-subtask__message"; item.dataset.role = "user";
        const words = document.createElement("div"); words.className = "mw-subtask__words"; words.textContent = input.text;
        item.append(words); messages.append(item); thread.scrollTop = thread.scrollHeight;
        return { state: "sent" };
      },
    });
    update();
  }
  function repaint(resetMessages = false) {
    const box = document.createElement("div"); box.innerHTML = renderSubtaskSpecimen(state);
    for (const part of ["head", "context", "intro", "details", "children"]) node(part).innerHTML = box.querySelector(`[data-subtask-${part}]`)!.innerHTML;
    const translated = box.querySelector("[data-subtask-messages]")!;
    if (resetMessages) messages.innerHTML = translated.innerHTML;
    else [...translated.children].forEach((item, index) => messages.children[index]?.replaceWith(item));
    feedbackText(); update();
  }
  mountInput();
  root.addEventListener("click", async event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button"); if (!button || busy) return;
    const action = button.dataset.subtaskAction;
    if (action) {
      busy = true; button.disabled = true; feedback.textContent = say("working");
      await new Promise(resolve => setTimeout(resolve, 150));
      state = action === "stop" || action === "deny" ? "stopped" : "running";
      repaint(); busy = false;
      const next = root.querySelector<HTMLButtonElement>("[data-subtask-action]");
      if (next) next.focus(); else handle.focus();
    }
    if (button.hasAttribute("data-subtask-retry")) {
      busy = true; feedback.textContent = say("loading");
      await new Promise(resolve => setTimeout(resolve, 150)); failedRead = false; feedbackText(); busy = false;
    }
    if (button.hasAttribute("data-subtask-back") || button.hasAttribute("data-subtask-close")) root.hidden = true;
    if (button.hasAttribute("data-subtask-open")) node("head").querySelector("strong")!.textContent = button.textContent;
  });
  return {
    reset() { state = initial; root.hidden = false; failedRead = false; repaint(true); thread.scrollTop = 0; },
    language() { repaint(); mountInput(); },
    history() { for (let n = 0; n < 80; n++) { const item = document.createElement("p"); item.textContent = `${n + 1}. ${say("sample-reply")}`; messages.append(item); } },
    fail() { failedRead = true; feedbackText(); },
    destroy: () => handle.destroy(),
  };
}

export function mountSubtaskSpecimenDemo(): void {
  const section = document.getElementById("subtask-conversation");
  if (!section || !window.molisComposer) return;
  const demos = [...section.querySelectorAll<HTMLElement>(".mw-subtask")].map(specimenDemo);
  section.addEventListener("click", event => {
    const action = (event.target as Element).closest<HTMLElement>("[data-subtask-demo]")?.dataset.subtaskDemo;
    if (action === "history") demos[0]!.history();
    if (action === "read-error") demos[0]!.fail();
    if (action === "reset") demos.forEach(demo => demo.reset());
  });
  document.addEventListener("molis-work:language-changed", () => demos.forEach(demo => demo.language()));
  window.addEventListener("pagehide", () => demos.forEach(demo => demo.destroy()), { once: true });
}
