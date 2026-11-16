import type { MwSubtaskAction, MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import type { SubtaskActionOutcome, SubtaskConversationSource } from "./subtask-contract.js";

interface Operation {
  readonly requestId: string;
  state: "working" | "unknown" | "failed" | "settled";
  reason?: string;
  check?: () => Promise<SubtaskActionOutcome>;
  recovered?: MwSubtaskConversationView["pending"];
}

/** Operations belong to their clicked target, even when another target is being read by the time they settle. */
export function subtaskActions(source: SubtaskConversationSource, changed: (target: string) => void, reloadDraft: (target: string) => Promise<void>) {
  const operations = new Map<string, Operation>();
  function observe(view: MwSubtaskConversationView, localInput: boolean) {
    const pending = view.pending, old = operations.get(view.target);
    if (!pending || (pending.kind === "input" && localInput) || old?.requestId === pending.requestId || old?.state === "working" || old?.state === "unknown") return;
    operations.set(view.target, { requestId: pending.requestId, state: "unknown", recovered: pending, check: async () => {
      try { return await source.act(view, pending.check, crypto.randomUUID(), new AbortController().signal); }
      catch { return reconcile(view.target, pending.requestId); }
    } });
  }
  async function reconcile(target: string, requestId: string): Promise<SubtaskActionOutcome> {
    const check = () => reconcile(target, requestId);
    try {
      return await source.check(target, requestId, new AbortController().signal);
    } catch { return { state: "unknown", check }; }
  }
  async function run(view: MwSubtaskConversationView, action: MwSubtaskAction | undefined, signal: AbortSignal) {
    const old = operations.get(view.target);
    if (old?.state === "working" || action?.disabled || (action && old?.state === "unknown")) return;
    const operation: Operation = action ? { requestId: crypto.randomUUID(), state: "working" } : old!;
    if (!operation || (!action && !operation.check)) return;
    const check = operation.check;
    operation.state = "working"; operations.set(view.target, operation); changed(view.target);
    let outcome: SubtaskActionOutcome;
    try {
      outcome = action ? await source.act(view, action, operation.requestId, signal) : await check!();
      // A vanished pending is not a receipt. Only a confirmed terminal query allows the recovered input to reload and unlock.
      if (outcome.state !== "unknown" && operation.recovered?.kind === "input" && operations.get(view.target) === operation) await reloadDraft(view.target);
    }
    catch { outcome = { state: "unknown", check: check ?? (() => reconcile(view.target, operation.requestId)) }; }
    // Revocation / destroy may have discarded this operation while the owner was replying.
    if (operations.get(view.target) !== operation) return;
    if (outcome.state === "applied") operation.state = "settled";
    else if (outcome.state === "not-applied") { operation.state = "failed"; operation.reason = outcome.reason; }
    else { operation.state = "unknown"; operation.check = outcome.check; }
    changed(view.target);
  }
  return { run, observe, get: (target: string) => operations.get(target), forget: (target: string) => operations.delete(target), destroy: () => operations.clear() };
}
