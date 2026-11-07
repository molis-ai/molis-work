// The return trip a plugin page may ask for (`UiPluginClientHost.returns`, specs/draft-and-return/spec.md §2.4), published through
// the `platform/ui` subpath. Where the person came from, where they go back to and what the settings had to make true are written
// and read by the trusted shell alone; the page gives only the need and names of its own.

/** What the settings have to make true. The first version has a text model only; a connection is asked in place (`connectionNeed`). */
export type UiReturnNeed = { readonly kind: "model" };

/**
 * Names the page wants back, never content: a key of its own `host.drafts`, the one step to do on return, what was selected. Every
 * value given is non-empty text with no control characters; lengths count characters as code points (`UI_RETURN_CARRY_LIMITS`).
 */
export interface UiReturnCarry {
  /** A key of this page's own `host.drafts`, at most 256 characters. */
  readonly draft_key?: string;
  /** The one step to do on return, at most 128 characters of `[A-Za-z0-9._:-]`. */
  readonly step?: string;
  /** What was selected: `kind` at most 64 characters, `id` at most 256. */
  readonly object?: { readonly kind: string; readonly id: string };
}

export interface UiReturnOutcome {
  /** `ready` only after the platform read the need back from its owner; `not_ready` when the person came back without it. */
  readonly status: "ready" | "not_ready";
  readonly carry: UiReturnCarry;
}

export interface UiPageReturns {
  /**
   * Opens the settings for `need` over the workbench, remembering this page as where the person came from. Resolves when the
   * person is back here. Rejects at once, with one fixed message whatever the reason, when the page is not visible, the carry is
   * refused or returns are unavailable (no settings to open, or no trips in this window). Rejects with an `AbortError` when the page aborts `signal` or this mount ends: the trip
   * then ends as `not_ready`, and a setting finished after that stays with its owner. Whether a later mount of this page gets the
   * outcome is decided by the platform from the workbench layout, never by the page (see `arrived`).
   */
  go(need: UiReturnNeed, carry?: UiReturnCarry, options?: { signal?: AbortSignal }): Promise<UiReturnOutcome>;
  /**
   * Once per mount. When a trip opened by `go` (never one the platform opened for its own cards) on an earlier mount of this page, in the same place, was kept because the page
   * was rebuilt without the person leaving it (a reload, a pane frame the workbench let go of), this waits until that trip
   * settles and resolves with its outcome, or resolves `null` when it ends without one or this mount ends first. With no such
   * trip it resolves `null` at once. Show the outcome with the platform's resume prompt; never redo the step unasked.
   */
  arrived(): Promise<UiReturnOutcome | null>;
}

/** The limits a carry is checked against (§2.1); a carry over any of them is refused whole. */
export const UI_RETURN_CARRY_LIMITS = { draft_key: 256, step: 128, object_id: 256, object_kind: 64 } as const;
