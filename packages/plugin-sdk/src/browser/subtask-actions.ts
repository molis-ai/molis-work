import type { MwSubtaskAction, MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import type { SubtaskActionOutcome, SubtaskConversationSource } from "./subtask-contract.js";

interface Operation {
  readonly requestId: string;
  state: "working" | "unknown" | "failed";
  reason?: string;
  check?: () => Promise<SubtaskActionOutcome>;
}

/** Operations belong to their clicked target, even when another target is being read by the time they settle. */
export function subtaskActions(source: SubtaskConversationSource, changed: (target: string) => void) {
  const operations = new Map<string, Operation>();
  async function reconcile(target: string, requestId: string): Promise<SubtaskActionOutcome> {
    const check = () => reconcile(target, requestId);
    try {
      const signal = new AbortController().signal, result = await source.read(target, signal);
      if (result.state !== "available" || result.view.pending?.requestId !== requestId) return { state: "unknown", check };
      return await source.act(result.view, result.view.pending.check, crypto.randomUUID(), signal);
    } catch { return { state: "unknown", check }; }
  }
  async function run(view: MwSubtaskConversationView, action: MwSubtaskAction | undefined, signal: AbortSignal) {
    const old = operations.get(view.target);
    if (old?.state === "working" || action?.disabled || (action && old?.state === "unknown")) return;
    const original = view.pending && action === view.pending.check ? view.pending.requestId : crypto.randomUUID();
    const operation: Operation = action ? { requestId: original, state: "working" } : old!;
    if (!operation || (!action && !operation.check)) return;
    const check = operation.check;
    operation.state = "working"; operations.set(view.target, operation); changed(view.target);
    let outcome: SubtaskActionOutcome;
    try { outcome = action ? await source.act(view, action, action === view.pending?.check ? crypto.randomUUID() : original, signal) : await check!(); }
    catch { outcome = { state: "unknown", check: () => reconcile(view.target, operation.requestId) }; }
    // Revocation / destroy may have discarded this operation while the owner was replying.
    if (operations.get(view.target) !== operation) return;
    if (outcome.state === "applied") operations.delete(view.target);
    else if (outcome.state === "not-applied") { operation.state = "failed"; operation.reason = outcome.reason; }
    else { operation.state = "unknown"; operation.check = outcome.check; }
    changed(view.target);
  }
  return { run, get: (target: string) => operations.get(target), forget: (target: string) => operations.delete(target), destroy: () => operations.clear() };
}
