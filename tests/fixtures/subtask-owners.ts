import type { MwSubtaskConversationView } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SubtaskConversationRead, SubtaskConversationSource, SubtaskActionOutcome } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { ComposerDraftAdapter, ComposerSubmission } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { COMPOSER_AI_LABELS } from "./composer-labels.js";

type View = MwSubtaskConversationView;
export function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
type Work = { generation: number; draft: string; allowed: boolean; running: boolean; messages: View["messages"]; pending?: View["pending"] };

/** An independent Work-shaped owner. Its ledger, drafts and generation checks are not derived from component DOM. */
export function workOwner() {
  const records = new Map<string, Work>(["a", "b", "nested"].map(key => [key, { generation: 1, draft: `${key} draft`, allowed: true, running: true, messages: [{ id: `${key}-original`, role: "assistant", content: { text: `${key} original` } }] }]));
  const listeners: Array<{ target: string; invalidate: () => void; closed: boolean }> = [];
  const sends: Array<{ target: string; binding: string; input: ComposerSubmission }> = [];
  const controls: Array<{ target: string; binding: string; action: string; request: string }> = [];
  const queries: Array<{ target: string; requestId: string }> = [];
  const receipts = new Map<string, "sent" | "not-sent" | "unknown">();
  const adapters = new Map<string, ComposerDraftAdapter>();
  let readBarrier: ReturnType<typeof deferred<SubtaskConversationRead>> | undefined;
  let readyBarrier: ReturnType<typeof deferred<void>> | undefined;
  let actionBarrier: ReturnType<typeof deferred<void>> | undefined;
  let sendBarrier: ReturnType<typeof deferred<void>> | undefined;
  let draftBarrier: ReturnType<typeof deferred<string>> | undefined;
  let failRead = false, failCheck = false, failDraft = false; let rejectAction: boolean | "accepted" = false;
  let unknownInput: boolean | "reject" | "accepted-reject" = false;
  const reads: string[] = [];
  const record = (target: string) => records.get(target)!;
  const invalidate = (target: string) => listeners.filter(item => item.target === target && !item.closed).forEach(item => item.invalidate());
  function view(target: string): View {
    const item = record(target);
    return { target, binding: `${target}:${item.generation}`, title: target, parent: { target: target === "nested" ? "a" : "parent", title: "Parent task" },
      running: item.running, status: { state: item.running ? "running" : "stopped", label: item.running ? "Working" : "Stopped" },
      messages: item.messages, children: target === "a" ? [{ target: "nested", title: "Nested", unread: true }, { target: "b", title: "Sibling" }] : [],
      actions: [{ id: item.running ? "stop" : "continue", ref: `execution:${item.generation}`, label: item.running ? "Stop" : "Continue" }],
      details: [{ id: "process", title: "Process", content: { text: "Independent process detail" } }], pending: item.pending,
      ...(!item.running ? { inputUnavailable: "Continue first" } : {}),
    };
  }
  function settle(target: string, request: string): "sent" | "not-sent" | "unknown" {
    const outcome = receipts.get(request) ?? "unknown", item = record(target);
    if (outcome !== "unknown") {
      if (item.pending?.requestId === request) item.pending = undefined;
      const sent = sends.find(row => row.input.request_id === request);
      if (outcome === "sent" && sent && item.draft === sent.input.text) item.draft = "";
    }
    return outcome;
  }
  const source: SubtaskConversationSource = {
    async subscribe(target, callback) {
      const item = { target, invalidate: callback, closed: false }; listeners.push(item);
      if (readyBarrier) { const gate = readyBarrier; readyBarrier = undefined; await gate.promise; }
      return () => { item.closed = true; };
    },
    async read(target) {
      reads.push(target);
      if (failRead) { failRead = false; throw new Error("offline"); }
      if (readBarrier) { const gate = readBarrier; readBarrier = undefined; return gate.promise; }
      return record(target).allowed ? { state: "available", view: view(target) } : { state: "denied", reason: "Access removed" };
    },
    composer(snapshot) {
      let adapter = adapters.get(snapshot.target);
      if (!adapter) { adapter = { read: async () => {
        if (failDraft) { failDraft = false; throw new Error("draft temporarily offline"); }
        if (draftBarrier) { const gate = draftBarrier; draftBarrier = undefined; return gate.promise; }
        return record(snapshot.target).draft;
      }, write: async text => { record(snapshot.target).draft = text; }, sent: async () => {} }; adapters.set(snapshot.target, adapter); }
      return { kind: "ai", entry: "work", labels: COMPOSER_AI_LABELS, sources: false, draft: { adapter },
        submit: async input => {
          sends.push({ target: snapshot.target, binding: snapshot.binding, input }); const item = record(snapshot.target);
          if (sendBarrier) { const gate = sendBarrier; sendBarrier = undefined; await gate.promise; }
          if (snapshot.binding !== `${snapshot.target}:${item.generation}` || !item.allowed) return { state: "failed", message: "Stale execution" };
          if (unknownInput && unknownInput !== "accepted-reject") {
            item.pending = { kind: "input", requestId: input.request_id, message: "Confirm original send", check: { id: "check", ref: input.request_id, label: "Check original" } };
            if (unknownInput === "reject") throw new Error("send reply disconnected");
            return { state: "unknown", check: async () => settle(snapshot.target, input.request_id) };
          }
          item.messages = [...item.messages, { id: input.request_id, role: "user", content: { text: input.text } }];
          receipts.set(input.request_id, "sent"); settle(snapshot.target, input.request_id);
          if (unknownInput === "accepted-reject") throw new Error("accepted send reply lost");
          return { state: "sent" };
        } };
    },
    async check(target, requestId): Promise<SubtaskActionOutcome> {
      queries.push({ target, requestId });
      if (failCheck) { failCheck = false; throw new Error("receipt temporarily offline"); }
      if (!record(target).allowed) throw new Error("Access removed");
      const outcome = settle(target, requestId);
      return outcome === "sent" ? { state: "applied" } : outcome === "not-sent" ? { state: "not-applied", reason: "Not accepted" }
        : { state: "unknown", check: () => source.check(target, requestId, new AbortController().signal) };
    },
    async act(snapshot, action, request): Promise<SubtaskActionOutcome> {
      controls.push({ target: snapshot.target, binding: snapshot.binding, action: action.ref, request });
      if (action.id === "check") {
        const outcome = settle(snapshot.target, action.ref);
        return outcome === "sent" ? { state: "applied" } : outcome === "not-sent" ? { state: "not-applied", reason: "Not accepted" }
          : { state: "unknown", check: async () => source.act(snapshot, action, request, new AbortController().signal) };
      }
      const item = record(snapshot.target);
      item.pending = { kind: "action", requestId: request, message: "Confirm original control", check: { id: "check", ref: request, label: "Check original" } };
      if (actionBarrier) { const gate = actionBarrier; actionBarrier = undefined; await gate.promise; }
      if (rejectAction === true) throw new Error("reply disconnected");
      if (!item.allowed || snapshot.binding !== `${snapshot.target}:${item.generation}`) { item.pending = undefined; return { state: "not-applied", reason: "Stale execution" }; }
      item.running = action.id !== "stop"; if (item.running) item.generation++;
      item.pending = undefined; receipts.set(request, "sent");
      if (rejectAction === "accepted") throw new Error("accepted control reply lost");
      return { state: "applied" };
    },
  };
  return { source, records, listeners, reads, sends, controls, receipts, queries, record, view, invalidate,
    blockRead() { const gate = deferred<SubtaskConversationRead>(); readBarrier = gate; return gate; },
    blockReady() { const gate = deferred<void>(); readyBarrier = gate; return gate; },
    blockAction() { const gate = deferred<void>(); actionBarrier = gate; return gate; },
    blockSend() { const gate = deferred<void>(); sendBarrier = gate; return gate; },
    blockDraft() { const gate = deferred<string>(); draftBarrier = gate; return gate; },
    failDraft() { failDraft = true; },
    failRead() { failRead = true; }, failCheck() { failCheck = true; }, unknownInput(value: boolean | "reject" | "accepted-reject" = true) { unknownInput = value; }, rejectAction(value: boolean | "accepted" = true) { rejectAction = value; } };
}

/** A second, event-shaped owner: SDK child events and attempts, without Work records or Work projection code. */
export function sdkOwner() {
  const events: Array<{ seq: number; who: "user" | "assistant"; words: string }> = [{ seq: 1, who: "assistant", words: "SDK child original" }];
  const receipts = new Set<string>();
  const calls: string[] = []; let attempt = 3, active = false, draft = "SDK draft";
  const adapter = { read: async () => draft, write: async (text: string) => { draft = text; } };
  const source: SubtaskConversationSource = {
    async read(target) { return { state: "available", view: { target, binding: `child-run/${attempt}`, title: "SDK child", parent: { target: "sdk-parent", title: "Parent run" },
      status: { state: active ? "running" : "round-ended", label: active ? "Running" : "Ended" }, running: active,
      messages: events.map(event => ({ id: `event:${event.seq}`, role: event.who, content: { text: event.words } })),
      actions: [{ id: active ? "stop" : "continue", ref: `attempt/${attempt}`, label: active ? "Stop" : "Continue" }] } }; },
    composer(snapshot) { return { kind: "ai", entry: "sdk-child", labels: COMPOSER_AI_LABELS, sources: false, draft: { adapter },
      submit: async input => { calls.push(snapshot.binding); receipts.add(input.request_id); events.push({ seq: events.length + 1, who: "user", words: input.text }); return { state: "sent" }; } }; },
    async check(target, requestId): Promise<SubtaskActionOutcome> { return receipts.has(requestId) ? { state: "applied" } : { state: "unknown", check: () => source.check(target, requestId, new AbortController().signal) }; },
    async act(snapshot, action, requestId) { receipts.add(requestId); calls.push(`${snapshot.binding}:${action.ref}`); active = !active; if (active) attempt++; return { state: "applied" }; },
  };
  return { source, events, calls };
}
