import type { AgentSubagentCommand, AgentSubagentConversation, AgentSubagentRequestResult } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { MwComposerAiLabels } from "../ui/composer.js";
import type { MwSubtaskConversationView, MwSubtaskDetail, MwSubtaskLink, StateRingState } from "../ui.js";
import type { SubtaskActionOutcome, SubtaskConversationSource } from "./subtask-contract.js";
import { subtaskDraft } from "./subtask-draft.js";

export interface AgentSubtaskSourcePorts {
  drafts: UiPageDrafts;
  labels: MwComposerAiLabels;
  /** Owner-localized words. Phase and receipt names are passed as `phase.<value>` / `receipt.<value>`. */
  text(key: string): string;
  read(target: string, signal: AbortSignal): Promise<{ conversation: AgentSubagentConversation; parent: MwSubtaskLink; children?: MwSubtaskLink[]; details?: MwSubtaskDetail[] }>;
  command(target: string, command: AgentSubagentCommand, signal: AbortSignal): Promise<AgentSubagentRequestResult>;
  check(target: string, requestId: string, signal: AbortSignal): Promise<AgentSubagentRequestResult>;
  subscribe?: SubtaskConversationSource["subscribe"];
  /** Questions, approvals and result tools remain the owner's existing actions. */
  action?: SubtaskConversationSource["act"];
}

/** Maps the public Host projection to the common UI. Original history, authority and execution admission remain with the Host. */
export function createAgentSubtaskSource(ports: AgentSubtaskSourcePorts): SubtaskConversationSource {
  const drafts = new Map<string, ReturnType<typeof subtaskDraft>>(), armed = new Set<string>();
  const draft = (target: string) => { let one = drafts.get(target); if (!one) { one = subtaskDraft(ports.drafts, target); drafts.set(target, one); } return one; };
  const check = async (target: string, requestId: string, signal: AbortSignal): Promise<SubtaskActionOutcome> => {
    let result: AgentSubagentRequestResult;
    try { result = await ports.check(target, requestId, signal); } catch { result = { state: "unknown" }; }
    if (result.state === "unknown") return { state: "unknown", check: () => check(target, requestId, new AbortController().signal) };
    try { await draft(target).settle(requestId, result.state === "applied"); } catch { return { state: "unknown", check: () => check(target, requestId, new AbortController().signal) }; }
    return result.state === "applied" ? { state: "applied" } : { state: "not-applied", reason: result.reason };
  };
  const command = async (view: MwSubtaskConversationView, input: AgentSubagentCommand, signal: AbortSignal): Promise<SubtaskActionOutcome> => {
    await draft(view.target).begin(input.request_id, input.kind === "send" || input.kind === "continue" ? "input" : "action", view.binding, input.kind === "send" || input.kind === "continue" ? input.text : undefined);
    let result: AgentSubagentRequestResult;
    try { result = await ports.command(view.target, input, signal); } catch { return check(view.target, input.request_id, new AbortController().signal); }
    if (result.state === "unknown") return { state: "unknown", check: () => check(view.target, input.request_id, new AbortController().signal) };
    try { await draft(view.target).settle(input.request_id, result.state === "applied"); } catch { return { state: "unknown", check: () => check(view.target, input.request_id, new AbortController().signal) }; }
    return result.state === "applied" ? { state: "applied" } : { state: "not-applied", reason: result.reason };
  };
  const source: SubtaskConversationSource = {
    ...(ports.subscribe ? { subscribe: ports.subscribe } : {}), check,
    async read(target, signal) {
      let found: Awaited<ReturnType<AgentSubtaskSourcePorts["read"]>>;
      try { found = await ports.read(target, signal); }
      catch (error) {
        if (error && typeof error === "object" && "status" in error && [401, 403, 404].includes(Number(error.status))) return { state: "denied", reason: ports.text("unavailable") };
        throw error;
      }
      const { conversation: data, parent, children, details } = found, child = data.child;
      const binding = JSON.stringify(child.child_run ?? null), running = ["starting", "running", "compacting", "awaiting-input", "awaiting-review", "pausing", "paused"].includes(data.phase);
      const held = ["failed", "stopped", "cancelled"].includes(data.phase) && !armed.has(target + binding);
      const unavailable = data.input_unavailable ?? (!child.child_run ? ports.text("unavailable") : data.phase === "reconcile-required" ? ports.text("reconcile") : held ? ports.text("continue-note") : undefined);
      const state: StateRingState = data.phase === "completed" ? "round-ended" : data.phase === "awaiting-input" ? "answer" : data.phase === "awaiting-review" ? "approval" : data.phase === "reconcile-required" ? "interrupted" : data.phase === "failed" ? "failed" : data.phase === "stopped" || data.phase === "cancelled" ? "stopped" : "running";
      const pending = await draft(target).pending();
      return { state: "available", view: {
        target, binding, parent, title: child.role_name ?? child.role_id, summary: child.task, status: { state, label: ports.text(`phase.${data.phase}`) }, running,
        ...(unavailable ? { inputUnavailable: unavailable } : {}),
        messages: data.messages.map(message => ({ id: `${message.run.run_id}:${message.turn_id}`, role: message.kind === "user" ? "user" : message.kind === "assistant" ? "assistant" : "notice", content: { text: message.text },
          ...(message.steer ? { receipt: ports.text(`receipt.${message.steer.state}`) } : {}) })),
        details: [...(child.activity?.length ? [{ id: "process", title: ports.text("process"), content: { text: child.activity.map(activity => [activity.name, activity.target, activity.summary, activity.output].filter(Boolean).join("\n")).join("\n\n") } }] : []), ...(details ?? [])], children,
        actions: !child.child_run || data.input_unavailable || data.phase === "reconcile-required" ? [] : running ? [{ id: "stop", ref: binding, label: ports.text("stop") }]
          : [{ id: "continue", ref: binding, label: ports.text("continue"), title: ports.text("continue-note") }],
        ...(pending ? { pending: { kind: pending.kind, requestId: pending.requestId, message: ports.text("unknown"), check: { id: "pending.check", ref: pending.requestId, label: ports.text("check") } } } : {}),
      } };
    },
    composer: view => ({ kind: "ai", entry: `subtask:${view.target}`, labels: ports.labels, sources: false, draft: { adapter: draft(view.target).adapter },
      receiver: () => ({ label: view.title, icon: "user" }),
      delivery: () => ({ "next-boundary": { available: true }, interrupt: { available: false, reason: ports.labels.unsupported }, "after-run": { available: false, reason: ports.labels.unsupported } }),
      async submit(input, signal) {
        const result = await command(view, { kind: view.running ? "send" : "continue", request_id: input.request_id, child_run: JSON.parse(view.binding), text: input.text }, signal);
        return result.state === "applied" ? { state: "sent" } : result.state === "not-applied" ? { state: "failed", message: result.reason }
          : { state: "unknown", check: async () => { const found = await result.check(); return found.state === "applied" ? "sent" : found.state === "not-applied" ? "not-sent" : "unknown"; } };
      },
    }),
    async act(view, action, requestId, signal) {
      if (action.id === "pending.check") {
        const pending = await draft(view.target).pending();
        if (pending?.requestId === action.ref || view.pending?.requestId === action.ref) return check(view.target, action.ref, signal);
        return { state: "not-applied", reason: ports.text("unavailable") };
      }
      if (action.id === "continue") { armed.add(view.target + view.binding); return { state: "applied" }; }
      if (action.id === "stop") return command(view, { kind: "stop", request_id: requestId, child_run: JSON.parse(view.binding) }, signal);
      if (ports.action) return ports.action(view, action, requestId, signal);
      return { state: "not-applied", reason: ports.text("unavailable") };
    },
  };
  return source;
}
