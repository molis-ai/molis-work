import type { AgentSubagentConversation, AgentSubagentRequestResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createAgentSubtaskSource, createSubtaskConversation, subscribeSubtask, type SubtaskConversationSource } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "../assistant-composer-labels.js";
import { subtaskConversationLabels } from "../subtask-conversation-labels.js";
import { assistantWorkSubtaskSource, type AssistantSubtaskRequest } from "./assistant-work-subtask.js";
import { pageDraftStore } from "./page-drafts.js";
import { forgetTaskFloatContent, openTaskFloatContent } from "./task-float-content.js";

interface AssistantTaskOpen { work_id: string; parent_run_id?: string; child_id?: string }
const sdkPath = (target: string) => { const [, work, run, child] = JSON.parse(target) as string[]; return `/works/${encodeURIComponent(work!)}/sdk-subtasks/${encodeURIComponent(run!)}/${encodeURIComponent(child!)}`; };
const kind = (target: string) => (JSON.parse(target) as string[])[0];
const say = (key: string) => t.text(`workbench.subtask-conversation.${key === "unavailable" ? "not-available" : key}`);

/** The native Assistant borrows the task panel's same float; it never changes the main conversation or main input receiver. */
export function installAssistantSubtasks(route: (path: string) => string): void {
  const owners = new Map<string, { owner: object; target: string; focus: HTMLElement | null }>();
  let alive = true;
  const open = (event: Event) => {
    const input = (event as CustomEvent<AssistantTaskOpen>).detail;
    if (!input || typeof input.work_id !== "string" || !input.work_id || input.work_id.length > 1000
      || (input.parent_run_id === undefined) !== (input.child_id === undefined) || input.parent_run_id !== undefined && (typeof input.parent_run_id !== "string" || typeof input.child_id !== "string")) return;
    const base = route("/api/assistant"), target = JSON.stringify(input.child_id ? ["sdk", input.work_id, input.parent_run_id, input.child_id] : ["work", input.work_id]);
    let context = owners.get(base);
    if (!context) { context = { owner: {}, target, focus: null }; owners.set(base, context); }
    context.target = target; context.focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const current = context;
    const api: AssistantSubtaskRequest = (path, body, signal) => molisWorkRequest(base + path, { method: body === undefined ? "GET" : "POST", body, signal });
    void openTaskFloatContent(current.owner, (root, navigation) => {
      const assert = () => { if (!alive || !root.isConnected) throw new DOMException("View closed", "AbortError"); };
      const drafts = pageDraftStore("molis-plugin-page:native-assistant:" + base + ":drafts", assert);
      const work = assistantWorkSubtaskSource(api, drafts), sdk = createAgentSubtaskSource({ drafts, labels: assistantComposerLabels(t.text, /Mac/i.test(navigator.platform)), text: say,
        async read(target, signal) {
          const result = await api<{ conversation: AgentSubagentConversation; parent_title: string }>(sdkPath(target), undefined, signal);
          return { conversation: result.conversation, parent: { target: "", title: result.parent_title } };
        },
        command: (target, command, signal) => api<AgentSubagentRequestResult>(sdkPath(target), command, signal),
        check: (target, requestId, signal) => api<AgentSubagentRequestResult>(sdkPath(target) + "/requests/" + encodeURIComponent(requestId), undefined, signal),
      });
      const sourceOf = (target: string) => kind(target) === "sdk" ? sdk : work;
      const source: SubtaskConversationSource = {
        read: (target, signal) => sourceOf(target).read(target, signal), composer: view => sourceOf(view.target).composer(view),
        check: (target, requestId, signal) => sourceOf(target).check(target, requestId, signal),
        act: (view, action, requestId, signal) => sourceOf(view.target).act(view, action, requestId, signal),
        subscribe: (target, invalidate, signal) => subscribeSubtask((version, signal) => api<{ version: string }>(
          (kind(target) === "sdk" ? sdkPath(target) : "/works/" + encodeURIComponent(JSON.parse(target)[1])) + "/wait?" + new URLSearchParams(version ? { since: version } : {}), undefined, signal), invalidate, signal),
      };
      const leave = () => { navigation.close(); if (current.focus?.isConnected) current.focus.focus({ preventScroll: true }); };
      const handle = createSubtaskConversation(root, { get labels() { return subtaskConversationLabels(); }, source,
        onBack: parent => { if (parent?.target && kind(parent.target) === "work") { current.target = parent.target; void handle.open(parent.target); } else navigation.back(); }, onClose: leave });
      return { show(target: string) { current.target = target; return handle.open(target); }, suspend: () => handle.close(), destroy: () => handle.destroy() };
    }).then(view => { if (alive && current.target === target) return view.show(target); }).catch(error => { if (error?.name !== "AbortError") molisWorkRequest.toast?.(document.querySelector("[data-toast]") as never, error); });
  };
  document.addEventListener("molis:assistant-subtask-open", open);
  window.addEventListener("pagehide", () => { alive = false; document.removeEventListener("molis:assistant-subtask-open", open); for (const context of owners.values()) forgetTaskFloatContent(context.owner); owners.clear(); }, { once: true });
}
