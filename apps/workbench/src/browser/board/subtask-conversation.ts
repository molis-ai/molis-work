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
  let failNext = false, sequence = 0;
  const receipts = new Set<string>();
  const targets = new Map<string, { state: SubtaskSpecimenState; draft: string; messages: MwSubtaskMessage[] }>(["writer", "mobile"].map(target => [target, { state: initial, draft: "", messages: [] }]));
  const adapters = new Map([...targets].map(([target, record]) => [target, {
    read: async () => record.draft, write: async (text: string) => { record.draft = text; },
  }] as const));
  const source: SubtaskConversationSource = {
    async read(target) {
      if (failNext) { failNext = false; throw new Error("board read failure"); }
      const record = targets.get(target)!, view = subtaskSpecimenView(record.state);
      return { state: "available", view: { ...view, target, binding: `${target}:${record.state}`, ...(target === "mobile" ? { title: say("nested"), parent: { target: "writer", title: say("task") }, children: [] } : {}), messages: [...view.messages, ...record.messages] } };
    },
    composer: view => ({
      kind: "ai", entry: `subtask-board-${initial}-${view.target}`, labels: { ...assistantComposerLabels(t.text, true), input: say("input") },
      sources: false, draft: { adapter: adapters.get(view.target)! }, receiver: () => ({ label: say(view.target === "mobile" ? "nested" : "writer"), icon: "user" }),
      submit: async input => { receipts.add(input.request_id); targets.get(view.target)!.messages.push({ id: `sent-${++sequence}`, role: "user", content: { text: input.text } }); return { state: "sent" }; },
    }),
    async check(target, requestId) { return receipts.has(requestId) ? { state: "applied" } : { state: "unknown", check: () => source.check(target, requestId, new AbortController().signal) }; },
    async act(view, action, requestId) {
      await new Promise(resolve => setTimeout(resolve, 150));
      receipts.add(requestId); targets.get(view.target)!.state = action.id === "stop" || action.id === "deny" ? "stopped" : "running";
      return { state: "applied" };
    },
  };
  const handle = createSubtaskConversation(root, { get labels() { return subtaskConversationLabels(); }, source,
    onBack: parent => { if (parent?.target === "writer") void handle.open("writer"); }, onClose() {} });
  const opened = handle.open("writer").then(async () => { if (failedInitially) { failNext = true; await handle.refresh(); } });
  root.querySelector<HTMLElement>(".mw-subtask")!.dataset.subtaskDemoState = initial;
  return {
    async reset() { await opened; for (const record of targets.values()) { record.state = initial; record.messages.length = 0; } failNext = false; await handle.open("writer"); },
    language: () => handle.refresh(),
    async history() { for (let n = 0; n < 80; n++) targets.get("writer")!.messages.push({ id: `history-${++sequence}`, role: "notice", content: { text: `${n + 1}. ${say("sample-reply")}` } }); await handle.refresh(); },
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
