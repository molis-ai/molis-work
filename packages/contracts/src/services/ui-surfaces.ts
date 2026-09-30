/**
 * A browser page the Assistant may watch and act on (specs/side-panel D05–D10). The local Host implements it over the
 * side panel's browser; the Agent Host adapts it to Prologue's `UiSurface` and attaches it to the runtime, so every
 * observation and action goes through Prologue's policy, approval, receipts and screenshot redaction.
 *
 * Only the Agent Host reads Prologue resources: a `text` action reaches the driver as plain text it already resolved.
 */
export type HostSurfaceObservationKind = "dom" | "accessibility-tree" | "screenshot" | "window-metadata";

export type HostSurfaceAction =
  | { readonly what: "pointer"; readonly x: number; readonly y: number; readonly button: "left" | "right" | "middle"; readonly clicks: number }
  | { readonly what: "key"; readonly keys: readonly string[] }
  | { readonly what: "text"; readonly text: string }
  | { readonly what: "navigate"; readonly url: string }
  | { readonly what: "wait"; readonly ms: number }
  | { readonly what: "upload"; readonly from: readonly string[] }
  | { readonly what: "download"; readonly to: readonly string[] };

export interface HostSurfaceDriver {
  readonly kind: "browser";
  /** The project whose page this is: a surface serves only works in that project. */
  readonly project_id: string;
  /** Opaque, exact: the current page (full address and page identity). Never shown or stored by the caller. */
  identity(): Promise<string>;
  /** scheme://host[:port] of the current page, what site rules match. */
  scope(): Promise<string>;
  observe(kind: HostSurfaceObservationKind): Promise<Uint8Array>;
  /** Performs one action. Refuses while the person has taken the page over. */
  perform(action: HostSurfaceAction, context: { readonly session_id: string | null }): Promise<void>;
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
}

/** The side panel reports who drives the page; the Agent Host tells it when a round starts and stops acting. */
export interface HostSurfaceActivity {
  readonly session_id: string | null;
  readonly summary: string;
  readonly point: { readonly x: number; readonly y: number } | null;
}
