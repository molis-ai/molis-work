import { createSubtaskConversation, createSubtaskQuestions, type SubtaskConversationSource } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { InteractionClient, InteractionClientHost } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { workOwner, deferred } from "./subtask-owners.js";

export function mountQuestionProbe(forms: Record<string, AgentPendingQuestion & { html: string }>, interaction: (root: HTMLElement, host: InteractionClientHost) => InteractionClient) {
  const root = document.createElement("div"); root.id = "question-probe";
  root.style.cssText = "position:fixed;inset:20px 20px auto auto;width:360px;height:650px;z-index:1000;background:var(--surface)"; document.body.append(root);
  const owner = workOwner(), saved = new Map<string, string>(), answers: Array<{ target: string; binding: string; request: string; input: unknown }> = [];
  let gate: ReturnType<typeof deferred<void>> | undefined;
  const drafts = {
    read: async (key: string) => saved.get(key) ?? null,
    write: async (key: string, value: string | null) => { if (value === null) saved.delete(key); else saved.set(key, value); },
    compareAndSwap: async (key: string, expected: string | null, value: string | null) => {
      if (gate) { const current = gate; gate = undefined; await current.promise; }
      if ((saved.get(key) ?? null) !== expected) return false;
      if (value === null) saved.delete(key); else saved.set(key, value); return true;
    },
  };
  const questions = createSubtaskQuestions({ drafts, interaction, text: key => key });
  const source: SubtaskConversationSource = { ...owner.source,
    async read(target, signal) {
      const result = await owner.source.read(target, signal);
      if (result.state !== "available") return result;
      return { state: "available", view: { ...result.view, details: questions.remember(target, result.view.binding, [forms[target]!]) } };
    },
    async act(view, action, request, signal) {
      if (action.id !== "answer") return owner.source.act(view, action, request, signal);
      const input = JSON.parse(action.ref); answers.push({ target: view.target, binding: view.binding, request, input });
      return input.answers[0].value > 120 ? { state: "not-applied", reason: "Too large", errors: { n0: "At most 120 minutes" } } : { state: "applied" };
    },
  };
  const handle = createSubtaskConversation(root, { source, mountDetail: questions.mount,
    labels: { back: "Back", close: "Close", loading: "Loading", readFailed: "Cannot read", retry: "Read again", latest: "Latest", messages: "Messages", children: "Children", unread: "Unread", working: "Working", actionFailed: "Action failed", unknown: "Unknown", check: "Check" }, onBack() {}, onClose() {} });
  return { root, owner, handle, forms, answers, flush: () => questions.flush(), blockSave() { gate = deferred<void>(); return gate; },
    fill(value: string) { const field = root.querySelector<HTMLInputElement>("[data-ix-field=n0] input")!; field.value = value; field.dispatchEvent(new Event("input", { bubbles: true })); },
    submit() { root.querySelector<HTMLButtonElement>("[data-ix-action=answer]")!.click(); },
  };
}
