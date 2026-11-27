import type { InteractionClient, InteractionClientHost } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { AgentSubagentConversation, AgentSubagentRequestResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createAgentSubtaskSource, createSubtaskConversation, createSubtaskQuestions, subscribeSubtask, type SubtaskConversationSource } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "../assistant-composer-labels.js";
import { subtaskConversationLabels } from "../subtask-conversation-labels.js";
import { assistantWorkQuestionDraft, assistantWorkSubtaskSource, type AssistantSubtaskRequest } from "./assistant-work-subtask.js";
import { pageDraftStore } from "./page-drafts.js";
import { closeTaskFloatContent, forgetTaskFloatContent, openTaskFloatContent } from "./task-float-content.js";

import { accountTransition } from "./account-transition.js";
import { installTaskFloatShell } from "./task-float-shell.js";
import { assistantSubtaskReviews, type AssistantWorkReviewMount, type AssistantSubtaskReviewFactories } from "./assistant-subtask-reviews.js";
import type { AssistantScope } from "@molis-ai/molis-work-contracts/services/assistant";

interface AssistantTaskOpen { interaction(root: HTMLElement, host: InteractionClientHost): InteractionClient; reviews: AssistantWorkReviewMount; base: string; signal: AbortSignal; focus: HTMLElement | null; work_id: string; parent_run_id?: string; child_id?: string }
const sdkPath = (target: string) => { const [, work, run, child] = JSON.parse(target) as string[]; return `/works/${encodeURIComponent(work!)}/sdk-subtasks/${encodeURIComponent(run!)}/${encodeURIComponent(child!)}`; };
const kind = (target: string) => (JSON.parse(target) as string[])[0];
const say: typeof t.text = (key, values) => t.text(`workbench.subtask-conversation.${key === "unavailable" ? "not-available" : key}`, values);

/** The native Assistant borrows the task panel's same float; it never changes the main conversation or main input receiver. */
export function installAssistantSubtasks(factories: AssistantSubtaskReviewFactories): void {
  const account = accountTransition();
  const home = document.querySelector(".arrival-bar[data-dock]") ? installTaskFloatShell({ dialog: "assistant-panel", back: () => home?.hide() }) : undefined;
  const owners = new Map<string, { owner: object; target: string; focus: HTMLElement | null; ticket: number; unwatch?: () => void }>();
  let alive = true;
  const open = (event: Event) => {
    const input = (event as CustomEvent<AssistantTaskOpen>).detail;
    if (!alive || account.preparing || !input || !(input.signal instanceof AbortSignal) || input.signal.aborted || typeof input.interaction !== "function" || typeof input.base !== "string" || !/^\/(?:projects\/[^/]+\/)?api\/assistant$/.test(input.base) || typeof input.work_id !== "string" || !input.work_id || input.work_id.length > 1000
      || typeof input.reviews?.mount !== "function" || typeof input.reviews.retitle !== "function"
      || (input.parent_run_id === undefined) !== (input.child_id === undefined) || input.parent_run_id !== undefined && (typeof input.parent_run_id !== "string" || typeof input.child_id !== "string")) return;
    const base = input.base, target = JSON.stringify(input.child_id ? ["sdk", input.work_id, input.parent_run_id, input.child_id] : ["work", input.work_id]);
    let context = owners.get(base);
    if (!context) { context = { owner: {}, target, focus: null, ticket: 0 }; owners.set(base, context); }
    context.target = target; context.focus = input.focus; context.unwatch?.();
    const current = context, ticket = ++context.ticket;
    const close = () => { if (current.ticket === ticket) { current.ticket++; closeTaskFloatContent(current.owner); } };
    input.signal.addEventListener("abort", close, { once: true });
    current.unwatch = () => input.signal.removeEventListener("abort", close);
    const api: AssistantSubtaskRequest = (path, body, signal) => molisWorkRequest(base + path, { method: body === undefined ? "GET" : "POST", body, signal });
    void openTaskFloatContent(current.owner, (root, navigation) => {
      const assert = () => { if (!alive || !root.isConnected) throw new DOMException("View closed", "AbortError"); };
      const drafts = pageDraftStore("molis-plugin-page:native-assistant:" + base + ":drafts", assert);
      const reviews = assistantSubtaskReviews({ ...factories, api, sdkPath, work: input.reviews, refresh: () => { void handle.refresh(); } });
      const questions = createSubtaskQuestions({ drafts, text: say, draft: (target, _binding, question) => kind(target) === "work" ? assistantWorkQuestionDraft(api, target, question.pending_id) : undefined,
        interaction: (root, options) => input.interaction(root, { references: async (source, query) => {
        const found = await molisWorkRequest<{ candidates: Array<{ kind: string; id: string; label: string; plugin_title: string }> }>(base.replace(/\/assistant$/, "/search/references"), { body: { kinds: source.split(","), query, limit: 8 } });
        return { items: found.candidates.map(item => ({ value: item.kind + " " + item.id, label: item.label, meta: item.plugin_title })) };
      }, ...options }) });
      const work = assistantWorkSubtaskSource(api, drafts, (target, binding, original) => [...questions.remember(target, binding, original.rounds.flatMap(round => round.awaiting_input)), ...reviews.rememberWork(target, binding, original)]);
      type SdkView = { conversation: AgentSubagentConversation; parent_title: string; scope: AssistantScope; has_reviews: boolean };
      const present = (target: string, { conversation, parent_title, scope, has_reviews }: SdkView) => ({
        conversation, parent: { target: "", title: parent_title },
        get details() { return [...questions.remember(target, JSON.stringify(conversation.child.child_run), conversation.questions), ...reviews.rememberSdk(target, scope, conversation, has_reviews)]; },
      });
      const sdk = createAgentSubtaskSource({ drafts, labels: assistantComposerLabels(t.text, /Mac/i.test(navigator.platform)), text: say,
        read: async (target, signal) => present(target, await api<SdkView>(sdkPath(target), undefined, signal)),
        async wait(target, since, signal) {
          const result = await api<{ version: string } & (SdkView | { conversation?: never })>(sdkPath(target) + "/wait?" + new URLSearchParams(since ? { since } : {}), undefined, signal);
          return { version: result.version, snapshot: result.conversation ? present(target, result) : undefined };
        },
        command: (target, command, signal) => api<AgentSubagentRequestResult>(sdkPath(target), command, signal),
        check: (target, requestId, signal) => api<AgentSubagentRequestResult>(sdkPath(target) + "/requests/" + encodeURIComponent(requestId), undefined, signal),
      });
      const sourceOf = (target: string) => kind(target) === "sdk" ? sdk : work;
      const source: SubtaskConversationSource = {
        read: (target, signal) => sourceOf(target).read(target, signal), composer: view => sourceOf(view.target).composer(view),
        check: (target, requestId, signal) => sourceOf(target).check(target, requestId, signal),
        act: (view, action, requestId, signal) => sourceOf(view.target).act(view, action, requestId, signal),
        subscribe: (target, invalidate, signal) => kind(target) === "sdk" ? sdk.subscribe!(target, invalidate, signal) : subscribeSubtask((since, signal) => api<{ version: string }>(
          "/works/" + encodeURIComponent(JSON.parse(target)[1]) + "/wait?" + new URLSearchParams(since ? { since } : {}), undefined, signal), invalidate, signal),
      };
      const leave = () => navigation.close(true);
      const handle = createSubtaskConversation(root, { get labels() { return subtaskConversationLabels(); }, source, mountDetail: (...args) => questions.mount(...args) ?? reviews.mount(...args),
        onBack: parent => { if (parent?.target && kind(parent.target) === "work") { current.target = parent.target; void handle.open(parent.target); } else navigation.back(); }, onClose: leave });
      let resume = false;
      const unregister = account.page(root, async () => { resume = !root.hidden; handle.close(); await Promise.all([work.flush(), sdk.flush(), questions.flush()]); }, () => { forgetTaskFloatContent(current.owner); }, () => { if (resume && !root.hidden) void handle.open(current.target); resume = false; });
      return { show(target: string) { current.target = target; return handle.open(target); }, suspend: () => handle.close(), destroy: () => { unregister(); handle.destroy(); } };
    }, { beforeShow: async () => { if (!alive || account.preparing || input.signal.aborted || current.ticket !== ticket) throw new DOMException("View closed", "AbortError"); }, onClose: returnFocus => { if (current.ticket === ticket) current.ticket++; if (returnFocus) (current.focus?.isConnected ? current.focus : document.getElementById(current.focus?.id ?? ""))?.focus({ preventScroll: true }); } }).then(view => { if (alive && !account.preparing && !input.signal.aborted && current.ticket === ticket) return view.show(target); }).catch(error => { if (error?.name !== "AbortError") molisWorkRequest.toast?.(document.querySelector("[data-toast]") as never, error); });
  };
  const key = (event: KeyboardEvent) => { if (home?.shown && event.key === "Escape" && !event.isComposing && !event.defaultPrevented) { event.preventDefault(); home.hide(); } };
  const outside = (event: MouseEvent) => { const path = event.composedPath(); if (home?.shown && !path.includes(home.root!) && !path.includes(document.querySelector("[data-assistant-island]")!)) home.hide(); };
  document.addEventListener("keydown", key); document.addEventListener("click", outside);
  document.addEventListener("molis:assistant-subtask-open", open);
  window.addEventListener("pagehide", () => { alive = false; document.removeEventListener("molis:assistant-subtask-open", open); document.removeEventListener("keydown", key); document.removeEventListener("click", outside); for (const context of owners.values()) { context.unwatch?.(); forgetTaskFloatContent(context.owner); } owners.clear(); home?.dispose(); }, { once: true });
}
