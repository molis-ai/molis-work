/**
 * An interface the Assistant may watch and act on: the side panel's browser page (specs/archive/side-panel D05–D10) or
 * the person's Mac desktop, one app at a time (specs/computer-use). The local Host implements each driver; the Agent
 * Host adapts it to Prologue's `UiSurface` and attaches it to the runtime, so every observation and action goes through
 * Prologue's policy, approval, receipts and screenshot redaction.
 *
 * Only the Agent Host reads Prologue resources: a `text` action reaches the driver as plain text it already resolved.
 */
export type HostSurfaceKind = "browser" | "desktop";

export type HostSurfaceObservationKind = "dom" | "accessibility-tree" | "screenshot" | "window-metadata";

export type HostSurfaceAction =
  /** Browser: an opaque token from the latest observation, bound to that DOM object; the driver rereads its position and never falls back to x/y. Desktop: a tree id in brackets (`[3]`; bare `3` is a name), or `保存`, `按钮:保存`, `~保存`, resolved on the tree read at injection. */
  | { readonly what: "pointer"; readonly x: number; readonly y: number; readonly button: "left" | "right" | "middle"; readonly clicks: number; readonly node?: string }
  | { readonly what: "key"; readonly keys: readonly string[] }
  | { readonly what: "text"; readonly text: string }
  | { readonly what: "navigate"; readonly url: string }
  | { readonly what: "wait"; readonly ms: number }
  | { readonly what: "upload"; readonly from: readonly string[] }
  | { readonly what: "download"; readonly to: readonly string[] }
  /** Desktop: scroll at a point of the observed frame; positive dy shows what is further down. */
  | { readonly what: "scroll"; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number }
  /** Desktop: press at one point and release at another, both on the same app. */
  | { readonly what: "drag"; readonly x: number; readonly y: number; readonly to_x: number; readonly to_y: number }
  | { readonly what: "hover"; readonly x: number; readonly y: number }
  /** Desktop: make this app (bundle id) the one the desktop surface looks at and acts on, opening it when needed. */
  | { readonly what: "app"; readonly app: string }
  /** Desktop: choose a menu item of the current app by its titles from the menu bar down. */
  | { readonly what: "menu"; readonly path: readonly string[] };

/**
 * Why a driver will not look or act right now — the same four reasons Prologue names, so the Assistant and the person
 * read why, and nothing is retried another way: the driver or its helper is unavailable (or lacks a permission); the
 * person is using the mouse and keyboard or has taken over; the screen is locked or the person is away; the point is
 * not on the target app.
 */
export type HostSurfaceRefusal = "driver-unavailable" | "person-present" | "screen-locked" | "outside-target";

/**
 * What a desktop step leaves behind. The tree is the window after the step. A picture is attached only when that tree
 * was cut off or had nothing to click, and only for the person who will decide whether a model may see it.
 */
export interface HostSurfaceActReceipt {
  readonly tree: string;
  readonly model_image?: Uint8Array;
  readonly image_reason?: "truncated" | "no-clickable";
}

/** An error a driver throws to refuse with one of those reasons; the Agent Host maps it onto Prologue's refusal. */
export interface HostSurfaceRefusalError extends Error {
  readonly refusal: HostSurfaceRefusal;
  /** Part of the action may already have happened (the person interrupted between two events). */
  readonly partial?: boolean;
}

export function isHostSurfaceRefusal(error: unknown): error is HostSurfaceRefusalError {
  const refusal = error instanceof Error ? (error as Partial<HostSurfaceRefusalError>).refusal : undefined;
  return refusal === "driver-unavailable" || refusal === "person-present" || refusal === "screen-locked" || refusal === "outside-target";
}

/** How the round that used a surface ended, as its run settled: a person or the Host stopping it is `stopped`. */
export type HostSurfaceRoundEnd = "completed" | "failed" | "stopped";

/** Trusted, in-process control fixed to one original round. Object identity also identifies its exact driver lease. */
export interface HostSurfaceContext {
  readonly session_id: string | null;
  beforeEffect(): void | Promise<void>;
  /** Must be synchronous; called after the last wait, immediately before IO or a round-owned state change. */
  assertCurrent(): void;
}

/** The desktop landing point and private control fingerprint used to classify this exact action. */
export interface HostSurfacePointerTarget {
  readonly x: number;
  readonly y: number;
  readonly fingerprint: string;
}

/** Frozen facts of the original SDK observation/plan. Trusted in-process only; never accept these from page/model input or serialize them. */
export interface HostSurfaceExpectedTarget {
  readonly identity: string;
  readonly scope: string;
  /** Only present after the original text approval reached the SDK. Process-local driver fact. */
  readonly approved_focus?: string;
  /** Desktop: if the original assessment resolved the control, recheck it before input. */
  readonly assessed_pointer?: HostSurfacePointerTarget;
  /** The exact call's original target/epoch and cancellation; must run synchronously at each final read/input fence. */
  assertCurrent(): void;
}

export interface HostSurfaceDriver {
  readonly kind: HostSurfaceKind;
  /** The project whose page this is: a surface serves only works in that project. The desktop serves every project: null. */
  readonly project_id: string | null;
  /** Opaque, exact: the current page (full address and page identity). Never shown or stored by the caller. */
  identity(context: HostSurfaceContext): Promise<string>;
  /** scheme://host[:port] of the current page, what site rules match; `about:blank` while it has not opened a site. */
  scope(context: HostSurfaceContext): Promise<string>;
  /** Looks at the page under the original round's control; that round is shown as the one using the page. */
  observe(kind: HostSurfaceObservationKind, context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<Uint8Array>;
  /**
   * Performs one action. Refuses while the person has taken the page over.
   * A desktop step returns the accessibility tree from after it; a browser step returns nothing.
   */
  perform(action: HostSurfaceAction, context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<HostSurfaceActReceipt | void>;
  /** Releases only this exact context's lease, even after its authority expired. Never releases a newer round's state. */
  release?(context: HostSurfaceContext, ended?: HostSurfaceRoundEnd): Promise<void>;
  close(): Promise<void>;
  /** Browser: the retained node's current name for approval, using the same object check as injection; unavailable tokens reject. */
  describeNode?(node: string, context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<string>;
  /** The field that has focus now: its name, and whether it takes a password, card number or one-time code. */
  focusedField?(context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<{
    readonly label: string; readonly sensitive: boolean;
    /** Opaque driver fact used to verify the same control. Never shown or stored. */
    readonly focus?: string;
  }>;
  /**
   * Whether a screenshot's bytes are ones this driver produced after covering password, card and one-time-code
   * fields. The Agent Host's redactor refuses any other screenshot (spec D10).
   */
  masked(bytes: Uint8Array): boolean;
  /** Desktop: whether looking and acting may happen at all right now; null when nothing stands in the way. */
  readiness?(context: HostSurfaceContext): Promise<{ readonly refusal: HostSurfaceRefusal; readonly detail: string } | null>;
  /**
   * Desktop: whether one action cannot be taken back (send, pay, delete, submit), judged from what is at the point or
   * the keys, so even an app allowed for this round still asks for it.
   */
  assess?(action: HostSurfaceAction, context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<{
    readonly irreversible: boolean; readonly why: string; readonly pointer?: HostSurfacePointerTarget;
  }>;
  /** Desktop: the app the surface shows now, for the person's approval card; null before any app is targeted. */
  currentApp?(context: HostSurfaceContext, expected: HostSurfaceExpectedTarget): Promise<{ readonly bundle_id: string; readonly name: string } | null>;
  /** Desktop: the round about to use the computer names its goal and ids, so the record started on first look names them. */
  describeRound?(context: HostSurfaceContext, metadata: { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): void;
  /** Desktop: the run id, known only once the round's run has started (after the surface was attached). */
  noteRun?(context: HostSurfaceContext, runId: string): void;
}

/** The side panel reports who drives the page; the Agent Host tells it when a round starts and stops acting. */
export interface HostSurfaceActivity {
  readonly session_id: string | null;
  readonly summary: string;
  readonly point: { readonly x: number; readonly y: number } | null;
}
