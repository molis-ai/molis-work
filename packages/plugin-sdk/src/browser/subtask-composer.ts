import { renderComposer } from "../ui/composer.js";
import type { ComposerHandle, ComposerOptions, ComposerOutcome, ComposerSubmission } from "../page-globals.js";
import type { MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import type { SubtaskComposerOptions, SubtaskConversationSource } from "./subtask-contract.js";

interface Mounted {
  view: MwSubtaskConversationView;
  options: SubtaskComposerOptions;
  handle?: ComposerHandle;
  readonly words: SubtaskComposerOptions["labels"];
  restoredInput?: string;
}

/** Same root + same owner adapter keeps the unified composer's pending request and selections across navigation. */
export function subtaskComposer(root: HTMLElement, source: SubtaskConversationSource, changed: (target: string) => void) {
  const pending = new Map<string, { requestId: string; settled: boolean }>();
  let current: Mounted | undefined;
  const local = (view: MwSubtaskConversationView) => view.pending?.kind === "input" && pending.get(view.target)?.requestId === view.pending.requestId;
  function settled(target: string, requestId: string) {
    const request = pending.get(target);
    if (request?.requestId === requestId) request.settled = true;
    changed(target);
  }
  // An unexpected adapter rejection is not evidence of rejection by its owner. Reconcile its original persisted request.
  async function restoreCheck(target: string, requestId: string): Promise<"sent" | "not-sent" | "unknown"> {
    try {
      const outcome = await source.check(target, requestId, new AbortController().signal);
      return outcome.state === "applied" ? "sent" : outcome.state === "not-applied" ? "not-sent" : "unknown";
    } catch { return "unknown"; }
  }
  async function submit(mounted: Mounted, input: ComposerSubmission, signal: AbortSignal): Promise<ComposerOutcome> {
    const { view, options } = mounted; // Never consult the later selected task or execution after this point.
    pending.set(view.target, { requestId: input.request_id, settled: false });
    let outcome: ComposerOutcome;
    try { outcome = await options.submit(input, signal); }
    catch { outcome = { state: "unknown", check: () => restoreCheck(view.target, input.request_id) }; }
    if (outcome.state !== "unknown") { settled(view.target, input.request_id); return outcome; }
    const check = outcome.check;
    return { state: "unknown", check: async () => {
      const result = await check();
      if (result !== "unknown") settled(view.target, input.request_id);
      return result;
    } };
  }
  function close() { current?.handle?.destroy(); current = undefined; }
  function show(view: MwSubtaskConversationView, hold: string | null): boolean {
    const options = source.composer(view);
    const request = pending.get(view.target);
    // A receipt can settle before the refreshed view arrives; that stale pending is still the local composer's request.
    if (request?.settled && request.requestId !== view.pending?.requestId) pending.delete(view.target);
    // The owner has settled a request recovered after reload. Re-read its version-aware draft instead of keeping the old loaded text.
    if (current?.view.target === view.target && current.restoredInput && current.restoredInput !== view.pending?.requestId) close();
    if (current?.view.target !== view.target) {
      close();
      const labels = { ...options.labels };
      root.innerHTML = renderComposer({ kind: "ai", labels, add: Boolean(options.attachments || options.sources !== false || options.commands?.length),
        receiver: { label: view.title }, controls: options.controls, voice: options.voice });
      const mounted: Mounted = { view, options, words: labels }; current = mounted;
      // The composer re-reads its option fields. Delegate them to the latest read while submit captures that read before awaiting.
      const live = new Proxy({ ...options }, { get(_initial, key) {
        if (key === "placement") return "local";
        if (key === "stop" || key === "pause") return undefined;
        if (key === "labels") return labels;
        if (key === "submit") return (input: ComposerSubmission, signal: AbortSignal) => submit(mounted, input, signal);
        if (key === "receiver") return () => {
          const receiver = mounted.options.receiver?.();
          return { label: receiver?.label ?? mounted.view.title, ...(receiver?.icon ? { icon: receiver.icon } : {}) };
        };
        return Reflect.get(mounted.options, key);
      } }) as ComposerOptions;
      mounted.handle = window.molisComposer?.(root, live);
      // Keep the object the original composer captured; a language refresh updates its words without remounting an active send.
    } else {
      current.view = view; current.options = options;
      Object.assign(current.words, options.labels);
    }
    const handle = current?.handle;
    if (!handle) return false;
    current!.restoredInput = view.pending?.kind === "input" && !local(view) ? view.pending.requestId : undefined;
    const field = root.querySelector("textarea"); field?.setAttribute("aria-label", options.labels.input);
    handle.setRunning(view.running); handle.hold(hold); handle.refresh();
    return true;
  }
  return { show, close, local, focus: () => current?.handle?.focus(), destroy() { close(); pending.clear(); } };
}
