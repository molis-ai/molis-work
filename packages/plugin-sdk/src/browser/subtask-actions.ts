import type { MwSubtaskAction, MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import type { SubtaskActionOutcome, SubtaskConversationSource } from "./subtask-contract.js";

interface SubtaskOperation {
  readonly target: string;
  readonly requestId: string;
  state: "working" | "unknown" | "failed" | "settled";
  reason?: string;
  check?: () => Promise<SubtaskActionOutcome>;
  recovered?: MwSubtaskConversationView["pending"];
}

/** Operations belong to their clicked target, even when another target is being read by the time they settle. */
export function subtaskActions(source: SubtaskConversationSource, changed: (target: string) => void, reloadDraft: (target: string) => Promise<void>) {
  const operations = new Map<string, SubtaskOperation>(), shown = new Map<string, string>();
  const get = (target: string) => operations.get(shown.get(target) ?? "");
  function observe(view: MwSubtaskConversationView, localInput: boolean) {
    const pending = view.pending, current = get(view.target);
    if (!pending || pending.kind === "input" && localInput || current?.state === "working") return;
    if (current?.state === "unknown" && current.requestId !== pending.requestId && pending.blocking !== false) return;
    const old = operations.get(pending.requestId);
    if (old) { old.recovered = pending; shown.set(view.target, old.requestId); return; }
    operations.set(pending.requestId, { target: view.target, requestId: pending.requestId, state: "unknown", recovered: pending, check: async () => {
      try { return await source.act(view, pending.check, crypto.randomUUID(), new AbortController().signal); }
      catch { return reconcile(view.target, pending.requestId); }
    } });
    shown.set(view.target, pending.requestId);
  }

  async function reconcile(target: string, requestId: string): Promise<SubtaskActionOutcome> {
    const check = () => reconcile(target, requestId);
    try {
      return await source.check(target, requestId, new AbortController().signal);
    } catch { return { state: "unknown", check }; }
  }
  async function run(view: MwSubtaskConversationView, action: MwSubtaskAction | undefined, signal: AbortSignal) {
    const old = get(view.target);
    if (old?.state === "working" || action?.disabled || (action && old?.state === "unknown" && view.pending?.blocking !== false && !action.pendingSafe)) return;
    const operation: SubtaskOperation = action ? { target: view.target, requestId: crypto.randomUUID(), state: "working" } : old!;
    if (!operation || (!action && !operation.check)) return;
    const check = operation.check;
    operation.state = "working"; operations.set(operation.requestId, operation); shown.set(view.target, operation.requestId); changed(view.target);
    let outcome: SubtaskActionOutcome;
    try {
      outcome = action ? await source.act(view, action, operation.requestId, signal) : await check!();
      // A vanished pending is not a receipt. Only a confirmed terminal query allows the recovered input to reload and unlock.
      if (outcome.state !== "unknown" && operation.recovered?.kind === "input" && operations.get(operation.requestId) === operation) await reloadDraft(view.target);
    }
    catch { outcome = { state: "unknown", check: check ?? (() => reconcile(view.target, operation.requestId)) }; }
    // Revocation / destroy may have discarded this operation while the owner was replying.
    if (operations.get(operation.requestId) !== operation) return;
    if (outcome.state === "applied") operation.state = "settled";
    else if (outcome.state === "not-applied") { operation.state = "failed"; operation.reason = outcome.reason; }
    else { operation.state = "unknown"; operation.check = outcome.check; }
    changed(view.target);
    return outcome;
  }
  return { run, observe, get, forget: (target: string) => { shown.delete(target); for (const [id, operation] of operations) if (operation.target === target) operations.delete(id); }, destroy: () => { operations.clear(); shown.clear(); } };
}
