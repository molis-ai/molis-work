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
  | { readonly what: "pointer"; readonly x: number; readonly y: number; readonly button: "left" | "right" | "middle"; readonly clicks: number }
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

export interface HostSurfaceDriver {
  readonly kind: HostSurfaceKind;
  /** The project whose page this is: a surface serves only works in that project. The desktop serves every project: null. */
  readonly project_id: string | null;
  /** Opaque, exact: the current page (full address and page identity). Never shown or stored by the caller. */
  identity(): Promise<string>;
  /** scheme://host[:port] of the current page, what site rules match; `about:blank` while it has not opened a site. */
  scope(): Promise<string>;
  /** Looks at the page; the session looking, when known, is shown as the one using the page. */
  observe(kind: HostSurfaceObservationKind, context?: { readonly session_id: string | null }): Promise<Uint8Array>;
  /** Performs one action. Refuses while the person has taken the page over. */
  perform(action: HostSurfaceAction, context: { readonly session_id: string | null }): Promise<void>;
  /** The round using the page ended — finished, failed or stopped: the page is the person's again at once. */
  release?(): Promise<void>;
  close(): Promise<void>;
  /** The name of what sits at a point of the page now (for the person's approval card); empty when nothing readable. */
  describePoint?(x: number, y: number): Promise<string>;
  /** The field that has focus now: its name, and whether it takes a password, card number or one-time code. */
  focusedField?(): Promise<{ readonly label: string; readonly sensitive: boolean }>;
  /**
   * Whether a screenshot's bytes are ones this driver produced after covering password, card and one-time-code
   * fields. The Agent Host's redactor refuses any other screenshot (spec D10).
   */
  masked(bytes: Uint8Array): boolean;
  /** Desktop: whether looking and acting may happen at all right now; null when nothing stands in the way. */
  readiness?(context: { readonly session_id: string | null }): Promise<{ readonly refusal: HostSurfaceRefusal; readonly detail: string } | null>;
  /**
   * Desktop: whether one action cannot be taken back (send, pay, delete, submit), judged from what is at the point or
   * the keys, so even an app allowed for this round still asks for it.
   */
  assess?(action: HostSurfaceAction): Promise<{ readonly irreversible: boolean; readonly why: string }>;
  /** Desktop: the app the surface shows now, for the person's approval card; null before any app is targeted. */
  currentApp?(): Promise<{ readonly bundle_id: string; readonly name: string } | null>;
  /** Desktop: the round about to use the computer names its goal and ids, so the record started on first look names them. */
  describeRound?(sessionId: string, context: { readonly run_id: string | null; readonly project_id: string | null; readonly goal: string }): void;
}

/** The side panel reports who drives the page; the Agent Host tells it when a round starts and stops acting. */
export interface HostSurfaceActivity {
  readonly session_id: string | null;
  readonly summary: string;
  readonly point: { readonly x: number; readonly y: number } | null;
}
