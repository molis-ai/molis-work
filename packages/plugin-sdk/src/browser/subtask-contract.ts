import type { ComposerDraftAdapter, ComposerOptions } from "../page-globals.js";
import type { MwSubtaskAction, MwSubtaskConversationLabels, MwSubtaskConversationView, MwSubtaskDetail, MwSubtaskLink } from "../ui/subtask-conversation.js";

export type SubtaskConversationRead = { readonly state: "available"; readonly view: MwSubtaskConversationView }
  | { readonly state: "denied"; readonly reason: string };
export type SubtaskActionOutcome = { readonly state: "applied" }
  | { readonly state: "not-applied"; readonly reason: string; readonly errors?: Readonly<Record<string, string>> }
  | { readonly state: "unknown"; readonly check: () => Promise<SubtaskActionOutcome> };
export type SubtaskComposerOptions = Omit<Extract<ComposerOptions, { kind: "ai" }>, "draft" | "placement" | "stop" | "pause">
  & { readonly draft: { readonly adapter: ComposerDraftAdapter } };

/** UI ports, not a substitute for the owner's trusted identity, permission and execution-generation checks. */
export interface SubtaskConversationSource {
  read(target: string, signal: AbortSignal): Promise<SubtaskConversationRead>;
  /** Resolve only when listening is ready. Invalidate again after a reconnect. Omit for a source without live updates. */
  subscribe?(target: string, invalidate: () => void, signal: AbortSignal): Promise<() => void>;
  /**
   * Reuse the draft adapter for a logical target. Submit is bound to this exact view, including its execution generation.
   * Return unknown with an original-request check when an interrupted wait cannot prove non-acceptance; never turn that into failed.
   * Receipt checks use the original request id and current read permission, even if the execution generation has advanced.
   */
  composer(view: MwSubtaskConversationView): SubtaskComposerOptions;
  /** Query the original persisted receipt under current read permission, including after pending removal or execution changes. Never retries the effect. */
  check(target: string, requestId: string, signal: AbortSignal): Promise<SubtaskActionOutcome>;
  /**
   * The entire view, action reference and requestId are frozen at the click. Persist unresolved operations before acting.
   * A pending.check action reports the original operation's outcome. A rejected Promise is unconfirmed, never proof of non-acceptance.
   */
  act(view: MwSubtaskConversationView, action: MwSubtaskAction, requestId: string, signal: AbortSignal): Promise<SubtaskActionOutcome>;
}

export interface SubtaskConversationOptions {
  /** Already translated. A getter can return the page's current language; call refresh after its language changes. */
  readonly labels: MwSubtaskConversationLabels;
  readonly source: SubtaskConversationSource;
  /** The owner mounts its existing question/review widget. Model HTML never becomes a form or an action handler. */
  mountDetail?(root: HTMLElement, view: MwSubtaskConversationView, detail: MwSubtaskDetail, submit: (action: MwSubtaskAction) => Promise<SubtaskActionOutcome | undefined>): {
    update?(view: MwSubtaskConversationView, detail: MwSubtaskDetail): void;
    destroy(): void;
  } | undefined;
  /** The shell owns the existing task card / parent float. This component never touches the main conversation or its input. */
  onBack(parent: MwSubtaskLink | undefined): void;
  onClose(): void;
}
export interface SubtaskConversationHandle {
  /** Reads only; does not start or resume any task. Every open, including A→B→A, has its own lifetime. */
  open(target: string): Promise<void>;
  refresh(): Promise<void>;
  /** Releases the subscription and input handle, retaining this instance's reading state and the same composer root. */
  close(): void;
  destroy(): void;
}
