import { t, type MwSubtaskMessage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createSubtaskConversation, type SubtaskConversationSource } from "@molis-ai/molis-work-plugin-sdk/browser";
import { assistantComposerLabels } from "../../assistant-composer-labels.js";
import { subtaskConversationLabels, subtaskSpecimenView, type SubtaskSpecimenState } from "../../subtask-conversation-specimen.js";

/** Board-owned sample facts, consumed through the same public controller as a plugin. No task is started. */
const say = (key: string) => t.text(`workbench.subtask-conversation.${key}`);
function specimenDemo(sample: HTMLElement) {
  const initial = sample.dataset.subtaskDemoState as SubtaskSpecimenState;
  const failedInitially = Boolean(sample.querySelector("[data-subtask-feedback]")?.textContent);
  const root = sample.parentElement!;
  let state = initial, draft = "", failNext = false, sequence = 0;
  const messages: MwSubtaskMessage[] = [];
  const adapter = { read: async () => draft, write: async (text: string) => { draft = text; } };
  const source: SubtaskConversationSource = {
    async read(target) {
      if (failNext) { failNext = false; throw new Error("board read failure"); }
      const view = subtaskSpecimenView(state);
      return { state: "available", view: { ...view, target, ...(target === "mobile" ? { title: say("nested"), parent: { target: "writer", title: say("task") }, children: [] } : {}), messages: [...view.messages, ...messages] } };
    },
    composer: () => ({
      kind: "ai", entry: `subtask-board-${initial}`, labels: { ...assistantComposerLabels(t.text, true), input: say("input") },
      sources: false, draft: { adapter }, receiver: () => ({ label: say("writer"), icon: "user" }),
      submit: async input => { messages.push({ id: `sent-${++sequence}`, role: "user", content: { text: input.text } }); return { state: "sent" }; },
    }),
    async act(_view, action) {
      await new Promise(resolve => setTimeout(resolve, 150));
      state = action.id === "stop" || action.id === "deny" ? "stopped" : "running";
      return { state: "applied" };
    },
  };
  const handle = createSubtaskConversation(root, { get labels() { return subtaskConversationLabels(); }, source,
    onBack: parent => { if (parent?.target === "writer") void handle.open("writer"); }, onClose() {} });
  const opened = handle.open("writer").then(async () => { if (failedInitially) { failNext = true; await handle.refresh(); } });
  root.querySelector<HTMLElement>(".mw-subtask")!.dataset.subtaskDemoState = initial;
  return {
    async reset() { await opened; state = initial; messages.length = 0; failNext = false; await handle.open("writer"); },
    language: () => handle.refresh(),
    async history() { for (let n = 0; n < 80; n++) messages.push({ id: `history-${++sequence}`, role: "notice", content: { text: `${n + 1}. ${say("sample-reply")}` } }); await handle.refresh(); },
    async fail() { failNext = true; await handle.refresh(); },
    destroy: () => handle.destroy(),
  };
}

export function mountSubtaskSpecimenDemo(): void {
  const section = document.getElementById("subtask-conversation");
  if (!section || !window.molisComposer) return;
  const demos = [...section.querySelectorAll<HTMLElement>(".mw-subtask")].map(specimenDemo);
  section.addEventListener("click", event => {
    const action = (event.target as Element).closest<HTMLElement>("[data-subtask-demo]")?.dataset.subtaskDemo;
    if (action === "history") void demos[0]!.history();
    if (action === "read-error") void demos[0]!.fail();
    if (action === "reset") demos.forEach(demo => { void demo.reset(); });
  });
  document.addEventListener("molis-work:language-changed", () => demos.forEach(demo => { void demo.language(); }));
  window.addEventListener("pagehide", () => demos.forEach(demo => demo.destroy()), { once: true });
}
