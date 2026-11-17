import { renderComposer } from "../ui/composer.js";
import type { ComposerDraftAdapter, ComposerHandle, ComposerOptions, ComposerOutcome, ComposerSubmission } from "../page-globals.js";
import type { MwSubtaskConversationView } from "../ui/subtask-conversation.js";
import type { SubtaskActionOutcome, SubtaskComposerOptions, SubtaskConversationSource } from "./subtask-contract.js";

interface Mounted {
  view: MwSubtaskConversationView;
  options: SubtaskComposerOptions;
  handle?: ComposerHandle;
  readonly words: SubtaskComposerOptions["labels"];
  readonly loaded: Promise<void>;
  readonly ready: () => void;
}

interface PendingInput { requestId: string; settled: boolean }

/** Same root + same owner adapter keeps the unified composer's pending request and selections across navigation. */
export function subtaskComposer(root: HTMLElement, source: SubtaskConversationSource, changed: (target: string) => void) {
  const pending = new Map<string, PendingInput>();
  const drafts = new WeakMap<ComposerDraftAdapter, ComposerDraftAdapter>();
  let current: Mounted | undefined;
  function draft(original: ComposerDraftAdapter) {
    let adapter = drafts.get(original);
    if (!adapter) {
      adapter = { read(signal) {
        const mounted = current, reading = Promise.resolve().then(() => original.read(signal));
        if (mounted?.options.draft.adapter === original) void reading.then(mounted.ready, mounted.ready);
        return reading;
      }, write: text => original.write(text), ...(original.sent ? { sent: () => original.sent!() } : {}) };
      drafts.set(original, adapter);
    }
    return adapter;
  }
  const local = (view: MwSubtaskConversationView) => view.pending?.kind === "input" && pending.get(view.target)?.requestId === view.pending.requestId;
  function settled(target: string, request: PendingInput) {
    if (pending.get(target) !== request || request.settled) return;
    request.settled = true;
    changed(target);
  }
  // An unexpected adapter rejection is not evidence of rejection by its owner. Reconcile its original persisted request.
  function restoreCheck(target: string, requestId: string) {
    let check = () => source.check(target, requestId, new AbortController().signal);
    return async (): Promise<"sent" | "not-sent" | "unknown"> => {
      let outcome: SubtaskActionOutcome;
      try { outcome = await check(); } catch { return "unknown"; }
      if (outcome.state === "unknown") { check = outcome.check; return "unknown"; }
      return outcome.state === "applied" ? "sent" : "not-sent";
    };
  }
  async function submit(mounted: Mounted, input: ComposerSubmission, signal: AbortSignal, acknowledge: () => void): Promise<ComposerOutcome> {
    const { view, options } = mounted; // Never consult the later selected task or execution after this point.
    const request = { requestId: input.request_id, settled: false };
    pending.set(view.target, request);
    let acknowledged = false;
    let outcome: ComposerOutcome;
    try { outcome = await options.submit(input, signal, () => {
      if (acknowledged) return;
      acknowledged = true; settled(view.target, request); acknowledge();
    }); }
    catch { outcome = { state: "unknown", check: restoreCheck(view.target, input.request_id) }; }
    if (acknowledged) return { state: "sent" };
    if (outcome.state !== "unknown") { settled(view.target, request); return outcome; }
    const check = outcome.check;
    return { state: "unknown", check: async () => {
      const result = await check();
      if (result !== "unknown") settled(view.target, request);
      return result;
    } };
  }
  function close() { current?.handle?.destroy(); current?.ready(); current = undefined; }
  function show(view: MwSubtaskConversationView, hold: string | null): boolean {
    const options = source.composer(view);
    const request = pending.get(view.target);
    // A receipt can settle before the refreshed view arrives; that stale pending is still the local composer's request.
    if (request?.settled && request.requestId !== view.pending?.requestId) pending.delete(view.target);
    if (current?.view.target !== view.target) {
      close();
      const labels = { ...options.labels };
      root.innerHTML = renderComposer({ kind: "ai", labels, add: Boolean(options.attachments || options.sources !== false || options.commands?.length),
        receiver: { label: view.title }, controls: options.controls, voice: options.voice });
      let ready!: () => void;
      const loaded = new Promise<void>(resolve => { ready = resolve; });
      const mounted: Mounted = { view, options, words: labels, loaded, ready }; current = mounted;
      // The composer re-reads its option fields. Delegate them to the latest read while submit captures that read before awaiting.
      const live = new Proxy({ ...options }, { get(_initial, key) {
        if (key === "placement") return "local";
        if (key === "stop" || key === "pause") return undefined;
        if (key === "labels") return labels;
        if (key === "draft") return { adapter: draft(mounted.options.draft.adapter) };
        if (key === "submit") return (input: ComposerSubmission, signal: AbortSignal, acknowledge: () => void) => submit(mounted, input, signal, acknowledge);
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
    const field = root.querySelector("textarea"); field?.setAttribute("aria-label", options.labels.input);
    handle.setRunning(view.running); handle.hold(hold); handle.refresh();
    return true;
  }
  async function reload(target: string) {
    const mounted = current;
    const assertMounted = () => { if (!mounted || mounted.view.target !== target || current !== mounted) throw new DOMException("Input mount changed", "AbortError"); };
    assertMounted();
    // Let the initial Composer restore finish first, so it cannot refill an old draft after the receipt has cleared it.
    await mounted!.handle!.ready();
    assertMounted();
    await mounted!.loaded;
    assertMounted();
    const text = await mounted!.options.draft.adapter.read(new AbortController().signal);
    assertMounted();
    const field = root.querySelector("textarea");
    // The recovered input is held throughout this read. Its owner already settled the persistent draft; this is only its display.
    if (field) { field.value = text; window.molisFit?.(field); mounted!.handle?.refresh(); }
  }
  return { show, close, local, reload, focus: () => current?.handle?.focus(), destroy() { close(); pending.clear(); } };
}
