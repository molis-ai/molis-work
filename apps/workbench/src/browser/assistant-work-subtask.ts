import type { AssistantSubtaskBinding, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { UI_HOST_CLIENT_CODES, type UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import { subtaskDraft, type SubtaskActionOutcome, type SubtaskConversationSource } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { ComposerDraftAdapter } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { t, type MwSubtaskConversationView, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "../assistant-composer-labels.js";

export type AssistantSubtaskRequest = <T>(path: string, body?: unknown, signal?: AbortSignal) => Promise<T>;
const say = (key: string) => t.text(`workbench.subtask-conversation.${key}`);
const pathOf = (target: string) => "/works/" + encodeURIComponent(JSON.parse(target)[1]);

/** Work keeps its own draft, rounds and original Send receipts. Only unresolved request references use the browser draft owner. */
export function assistantWorkSubtaskSource(api: AssistantSubtaskRequest, storage: UiPageDrafts): SubtaskConversationSource {
  const retained = new Map<string, ReturnType<typeof subtaskDraft>>(), adapters = new Map<string, ComposerDraftAdapter & { prepare(text: string): Promise<number> }>(), armed = new Set<string>();
  const pending = (target: string) => { let record = retained.get(target); if (!record) { record = subtaskDraft(storage, target); retained.set(target, record); } return record; };
  const draft = (target: string) => {
    let adapter = adapters.get(target); if (adapter) return adapter;
    let writing: Promise<unknown> = Promise.resolve();
    const write = (text: string) => {
      const saved = writing.catch(() => {}).then(() => api<{ work: AssistantWork }>(pathOf(target) + "/draft", { draft: text })).then(result => result.work.draft_revision);
      writing = saved; return saved;
    };
    adapter = { prepare: write, write: async text => { await write(text); }, sent: async () => {},
      read: async signal => { await writing; return (await api<AssistantWorkView>(pathOf(target), undefined, signal)).work.draft; } };
    adapters.set(target, adapter); return adapter;
  };
  const check = async (target: string, requestId: string, signal: AbortSignal): Promise<SubtaskActionOutcome> => {
    const again = () => check(target, requestId, new AbortController().signal);
    try {
      const found = await api<{ state: "applied" | "unknown" }>(pathOf(target) + "/subtask/requests/" + encodeURIComponent(requestId), undefined, signal);
      if (found.state === "unknown") return { state: "unknown", check: again };
      await pending(target).settle(requestId, true); return { state: "applied" };
    } catch { return { state: "unknown", check: again }; }
  };
  const perform = async (view: MwSubtaskConversationView, requestId: string, kind: "input" | "action", operation: () => Promise<unknown>): Promise<SubtaskActionOutcome> => {
    await pending(view.target).begin(requestId, kind, view.binding);
    try { await operation(); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (!code || code === UI_HOST_CLIENT_CODES.outcomeUnknown || code === "assistant.pending_request") return check(view.target, requestId, new AbortController().signal);
      await pending(view.target).settle(requestId, false);
      return { state: "not-applied", reason: error instanceof Error ? error.message : say("action-failed") };
    }
    try { await pending(view.target).settle(requestId, true); return { state: "applied" }; }
    catch { return { state: "unknown", check: () => check(view.target, requestId, new AbortController().signal) }; }
  };
  const source: SubtaskConversationSource = {
    check,
    async read(target, signal) {
      let result: { view: AssistantWorkView; binding: AssistantSubtaskBinding | null; parent_subtask: boolean; input_unavailable?: string };
      try { result = await api(pathOf(target) + "/subtask", undefined, signal); }
      catch (error) { if (error && typeof error === "object" && "status" in error && [401, 403, 404].includes(Number(error.status))) return { state: "denied", reason: say("not-available") }; throw error; }
      const { view: original, binding } = result, { work, rounds } = original, last = rounds.at(-1), phase = last?.phase ?? "unknown", token = JSON.stringify(binding);
      const running = ["starting", "running", "compacting", "awaiting-input", "awaiting-review", "pausing", "paused"].includes(phase);
      const held = ["stopped", "failed"].includes(work.state) || ["stopped", "cancelled", "failed"].includes(phase);
      const unavailable = result.input_unavailable ?? (!binding ? say("not-available") : phase === "reconcile-required" || phase === "unknown" ? say("reconcile") : held && !armed.has(target + token) ? say("continue-note") : undefined);
      const state: StateRingState = phase === "completed" ? "round-ended" : phase === "awaiting-input" ? "answer" : phase === "awaiting-review" ? "approval" : phase === "failed" ? "failed" : phase === "stopped" || phase === "cancelled" ? "stopped" : phase === "unknown" || phase === "reconcile-required" ? "interrupted" : "running";
      const kept = await pending(target).pending();
      return { state: "available", view: { target, binding: token, title: work.title, parent: { target: result.parent_subtask && work.delegated_by ? JSON.stringify(["work", work.delegated_by.work_id]) : "", title: work.delegated_by?.title ?? say("parent-task") },
        summary: work.delegated_by?.acceptance, status: { state, label: say(phase === "unknown" ? "reconcile" : `phase.${phase}`) }, running, ...(unavailable ? { inputUnavailable: unavailable } : {}),
        messages: rounds.flatMap(round => [
          { id: `${round.run_id}:input`, role: round.written_by === "host" ? "notice" as const : "user" as const, content: { text: round.text } },
          ...round.turns.filter(turn => turn.kind !== "user" || turn.steer).map(turn => ({ id: `${round.run_id}:${turn.turn_id}`, role: turn.kind === "user" ? "user" as const : turn.kind === "assistant" ? "assistant" as const : "notice" as const, content: { text: turn.steer?.original?.text ?? turn.text }, ...(turn.steer ? { receipt: say(`receipt.${turn.steer.state}`) } : {}) })),
        ]),
        children: original.delegated?.map(child => ({ target: JSON.stringify(["work", child.work_id]), title: child.title })),
        actions: !binding || result.input_unavailable || phase === "reconcile-required" || phase === "unknown" ? [] : running ? [{ id: "stop", ref: token, label: say("stop") }] : [{ id: "continue", ref: token, label: say("continue"), title: say("continue-note") }],
        ...(kept ? { pending: { kind: kept.kind, requestId: kept.requestId, message: say("unknown"), check: { id: "pending.check", ref: kept.requestId, label: say("check") } } } : {}),
      } };
    },
    composer: view => ({ kind: "ai", entry: "assistant-subtask:" + view.target, labels: assistantComposerLabels(t.text, /Mac/i.test(navigator.platform)), sources: false,
      receiver: () => ({ label: view.title, icon: "user" }), draft: { adapter: draft(view.target) },
      delivery: () => ({ "next-boundary": { available: true }, interrupt: { available: false, reason: say("not-available") }, "after-run": { available: false, reason: say("not-available") } }),
      async submit(input, signal) {
        const binding = JSON.parse(view.binding) as AssistantSubtaskBinding;
        const outcome = await perform(view, input.request_id, "input", async () => api("/send", { work_id: binding.work_id, text: input.text, request_id: input.request_id, submission_id: input.request_id,
          draft_revision: await draft(view.target).prepare(input.text), target: "steer", subtask: { binding, operation: view.running ? "send" : "continue" } }, signal));
        return outcome.state === "applied" ? { state: "sent" } : outcome.state === "not-applied" ? { state: "failed", message: outcome.reason }
          : { state: "unknown", check: async () => { const found = await outcome.check(); return found.state === "applied" ? "sent" : found.state === "not-applied" ? "not-sent" : "unknown"; } };
      },
    }),
    async act(view, action, requestId, signal) {
      if (action.id === "pending.check") return check(view.target, action.ref, signal);
      if (action.id === "continue") { armed.add(view.target + view.binding); return { state: "applied" }; }
      if (action.id === "stop") return perform(view, requestId, "action", () => api(pathOf(view.target) + "/control", { kind: "stop", subtask: JSON.parse(view.binding), request_id: requestId }, signal));
      return { state: "not-applied", reason: say("not-available") };
    },
  };
  return source;
}
