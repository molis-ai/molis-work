import type { AgentSubagentConversation, AgentSubagentRequestResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createAgentSubtaskSource, createSubtaskConversation, createSubtaskQuestions, subscribeSubtask } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import { t, type MwSubtaskConversationLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codingComposerLabels } from "../composer-labels.js";
import { hostRequest } from "./main/request.js";
import type { CodingWorkbenchHost } from "./workbench.js";

const say = (key: string) => t.text(`coding.subtask.${key}`);
const labels = (): MwSubtaskConversationLabels => ({ back: say("back"), close: say("close"), loading: say("loading"), readFailed: say("read-failed"), retry: say("retry"), latest: say("latest"), messages: say("messages"), children: say("children"), unread: say("unread"), working: say("working"), actionFailed: say("action-failed"), unknown: say("unknown"), check: say("check") });
const targetOf = (input: Readonly<Record<string, string>>) => {
  if (!input.session || !input.run || !input.child) throw new Error(say("unavailable"));
  return JSON.stringify([input.session, input.run, input.child]);
};
const pathOf = (target: string) => {
  const [session, run, child] = JSON.parse(target) as string[];
  return `/sessions/${encodeURIComponent(session!)}/runs/${encodeURIComponent(run!)}/subagents/${encodeURIComponent(child!)}/conversation`;
};

/** Same registered Coding contribution, on an independent page grant in the existing task float. */
export function mountCodingSubtask(host: CodingWorkbenchHost): void {
  const task = host.view.task!, lifetime = host.mountPluginClient(host.root);
  if (!lifetime) return;
  const root = host.root as HTMLElement;
  const content = root.ownerDocument.createElement("div"); content.style.height = "100%";
  root.replaceChildren(content); root.style.cssText = "height:100%;min-height:0";
  const questions = createSubtaskQuestions({ drafts: host.drafts, interaction: host.interaction, text: say });
  const source = createAgentSubtaskSource({
    drafts: host.drafts, labels: codingComposerLabels(t.text, /Mac/i.test(navigator.platform)), text: say,
    async read(target, signal) {
      const conversation = await hostRequest<AgentSubagentConversation>(host, lifetime, pathOf(target), { signal });
      return { conversation, details: [...questions.remember(target, JSON.stringify(conversation.child.child_run), conversation.questions), ...(conversation.approvals.length ? [{ id: "approvals:" + JSON.stringify(conversation.approvals), title: say("approvals"), content: { text: "" }, expanded: true }] : [])], parent: { target: "", title: say("parent") } };
    },
    command: (target, command, signal) => hostRequest<AgentSubagentRequestResult>(host, lifetime, pathOf(target), { method: "POST", signal,
      body: command.kind === "send" || command.kind === "continue" ? { ...command, original_input: { input_id: command.request_id, text: command.text, use: "supplement" } } : command }),
    check: (target, requestId, signal) => hostRequest<AgentSubagentRequestResult>(host, lifetime, pathOf(target) + "/request?request_id=" + encodeURIComponent(requestId), { signal }),
    subscribe: (target, invalidate, signal) => subscribeSubtask((version, signal) => hostRequest<{ version: string }>(host, lifetime,
      pathOf(target) + "/live?" + new URLSearchParams(version ? { since: version } : {}), { signal }), invalidate, signal),
  });
  const handle = createSubtaskConversation(content, { get labels() { return labels(); }, source, mountDetail: (element, view, detail, submit) => {
    if (!detail.id.startsWith("approvals:")) return questions.mount(element, view, detail, submit);
    const run = JSON.parse(view.binding) as { run_id: string }, controller = new AbortController();
    void host.reviews.show(element, { runIds: [run.run_id] }, { signal: controller.signal }).catch(() => {
      if (!controller.signal.aborted) element.textContent = say("read-failed");
    });
    return { destroy: () => controller.abort() };
  }, onBack: () => task.close(), onClose: () => task.close() });
  let target = targetOf(task.input);
  const open = () => { if (lifetime.visible) void handle.open(target); };
  lifetime.own(task.subscribe(input => { const next = targetOf(input); if (next !== target) { target = next; open(); } }));
  lifetime.whenVisible(() => { open(); return () => handle.close(); });
  lifetime.own(() => handle.destroy());
}
