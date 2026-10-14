import type { ContractDescriptor } from "./package.js";

export const platformUiContract = {
  contractId: "io.molis.work.platform.ui.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/UI-PLATFORM.md",
} as const satisfies ContractDescriptor;

export type UiContributionKind = "primary-page" | "embedded" | "overlay" | "settings-page";

/**
 * Where a Plugin view is placed. The Host owns the shell; a view declares the
 * region it belongs to and never positions itself.
 *
 * These are exactly the regions the Workbench has today: the directory column,
 * the tabbed work area, the global settings directory, the personal island
 * above the project card, and the side panel beside the work (specs/archive/side-panel),
 * where a `side` view becomes one tab. A new region is a shell change first and a
 * slot second, never a slot a Plugin can target before anywhere exists to put it.
 */
export const UI_VIEW_SLOTS = ["navigator", "stage", "settings", "island", "side"] as const;

export type UiViewSlot = (typeof UI_VIEW_SLOTS)[number];

/** Placement declaration. Rendering stays with `UiContribution.render`. */
export interface UiViewDeclaration {
  readonly view_id: string;
  readonly slot: UiViewSlot;
  readonly title: string;
  /** Contribution that renders this view. Defaults to `<plugin_id>.<view_id>`. */
  readonly contribution_id?: string;
  /**
   * Icon name from the Host's own catalog. The Host resolves it and falls back
   * to a default when it does not know the name; a Plugin never ships artwork
   * into the shell.
   */
  readonly icon?: string;
  /** The view can host bounded objects opened from elsewhere. */
  readonly accepts_objects?: boolean;
  /** Lower sorts earlier inside its slot. Ties fall back to view_id order. */
  readonly order?: number;
}

export const UI_COMMAND_INPUT_KINDS = ["current", "object", "agent-session", "artifacts"] as const;

export type UiCommandInputKind = (typeof UI_COMMAND_INPUT_KINDS)[number];

export interface UiCommandDeclaration {
  readonly command_id: string;
  readonly title: string;
  readonly input_kinds: readonly UiCommandInputKind[];
  readonly opens_view_id: string;
}

export type UiCommandAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly reason: string };

export interface UiViewObjectRef {
  readonly view_id: string;
  readonly object_id: string;
}

export interface UiOpenedObjectView {
  readonly ref: UiViewObjectRef;
  readonly title: string;
}

/** One command as the Host presents it, with the owning Plugin resolved. */
export interface UiWorkspaceCommand {
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly declaration: UiCommandDeclaration;
  readonly availability: UiCommandAvailability;
}

export interface UiSlotDescriptor {
  readonly slot_id: string;
  readonly version: number;
  readonly accepts: readonly string[];
}

export interface UiSurfaceDescriptor {
  readonly surface_id: string;
  readonly target_slot_id: string;
  readonly format: string;
}

export interface UiContributionDescriptor {
  readonly contribution_id: string;
  readonly plugin_id: string;
  readonly kind: UiContributionKind;
  readonly navigation_id?: string;
  readonly label: string;
  /** Surfaces this contribution can mount into Workbench-owned slots. */
  readonly surfaces?: readonly UiSurfaceDescriptor[];
  /** Slots this contribution opens for nested content from other Plugins. */
  readonly slots: readonly UiSlotDescriptor[];
}

export interface UiRenderRequest<TModel = unknown> {
  readonly contribution_id: string;
  readonly surface: string;
  readonly model: TModel;
}

export interface UiMountRequest<TModel = unknown> {
  readonly slot: UiSlotDescriptor;
  readonly contribution: UiRenderRequest<TModel>;
}

export interface UiMountResult {
  readonly slot_id: string;
  readonly contribution_id: string;
  readonly surface: string;
  readonly html: string;
}

export interface UiContribution<TModel = unknown> {
  readonly descriptor: UiContributionDescriptor;
  /** Native, trusted Plugin UI assets. IDs must redeem this Plugin's static GET routes.
   * The module defaults to a mount(host) function; the Workbench supplies its existing
   * scoped lifetime, route and request-header helpers. Not a sandbox code loader. */
  readonly client?: { readonly module_route: string; readonly stylesheet_route?: string };
  render(request: UiRenderRequest<TModel>): string;
}

export interface UiHostApi {
  register<TModel>(contribution: UiContribution<TModel>): void;
  unregister(contributionId: string): void;
  list(): readonly UiContributionDescriptor[];
  render<TModel>(request: UiRenderRequest<TModel>): string;
  mount<TModel>(request: UiMountRequest<TModel>): UiMountResult;
}

export interface WorkbenchDocumentRenderRequest {
  readonly lang: string;
  readonly title: string;
  readonly preamble_html?: string;
  readonly head_before_title_html?: string;
  readonly head_html?: string;
  readonly body_attributes?: Readonly<Record<string, string | boolean | null | undefined>>;
  readonly body_html: string;
}

/**
 * The view's lifetime as a request sees it: the browser Host's mount scope (`UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT`). Its
 * `fetch` is cancelled when the view is removed or the page is left, and `assertCurrent` throws an `AbortError` once the
 * view is gone, so a request that finishes late never writes into a page that has moved on.
 */
export interface UiRequestScope {
  readonly fetch: (input: string, init: object) => Promise<Response>;
  assertCurrent(signal?: AbortSignal): void;
}

/**
 * What a page asks of the Host over HTTP (specs/repository-anti-corruption W3-10). Every request goes out with
 * `cache: "no-store"` and none is ever sent twice by the helper: whether to ask again is the person's decision.
 */
export interface UiRequestInit {
  /** Default: `POST` when there is a `body`, otherwise `GET`. */
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. A `GET` carries none. */
  readonly body?: unknown;
  /** How an answer is read: `json` (default; an empty answer is `null`), `text`, or the untouched `response` for any status. */
  readonly as?: "json" | "text" | "response";
  /** Statuses outside 2xx that still are an answer to read (a 404 that carries a result fragment, say). */
  readonly accept?: readonly number[];
  /** The one-time key. Give the same key when the same intent is sent again; without one every request gets a new key. */
  readonly key?: string;
  /** Extra request headers. They cannot add or replace the control token, the one-time key or the content type. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  /** The view's lifetime: leaving the page cancels the request, and an answer that arrives after that is dropped. */
  readonly scope?: UiRequestScope;
  /** Shown when the answer carries no explanation of its own. */
  readonly fallback?: string;
}

/**
 * A failed request: a plain `Error` carrying these fields, never a subclass of `Error`. The server's `code` is kept as it
 * is. The ones the browser decides itself start with `ui_host.`: `cross_origin` (the address is not this page's origin; no
 * request was made), `unreachable` (a read got no answer), `outcome_unknown` (a write got no answer, so it may or may not
 * have been done), `invalid_response` (a success answer that is not JSON) and `uncoded` (an error answer without a code).
 */
export interface UiRequestFailure extends Error {
  readonly code: string;
  /** The HTTP status; 0 when there was no answer. */
  readonly status: number;
  /** The `call_id` of the error body, which the Host writes only when the call can be looked up in the diagnostics. */
  readonly callId: string | null;
  /** The parsed JSON of the answer; the text when it is not JSON; `null` when there is no body. */
  readonly body: unknown;
}

/** The request half: what `createUiRequest` returns. */
export interface UiRequestCall {
  <T = unknown>(url: string, init?: UiRequestInit): Promise<T>;
  /** The headers of a change (control token, one-time key, JSON type), for callers that build their own request. */
  headers(key?: string): Record<string, string>;
  /** This page's control token, read from the page; for authenticating a socket. */
  token(): string;
}

/** Where a failure is written: an element-like target (this package has no DOM types). */
export interface UiFailureTarget {
  textContent: string | null;
  append(node: unknown): void;
}

/**
 * A toast: the Workbench's `.toast` element. `is-visible` shows it and `is-error` colours it; while a diagnostic ID is on
 * it, it takes the pointer (the stylesheet's `pointer-events: none` would make the button unreachable).
 */
export interface UiToastTarget extends UiFailureTarget {
  readonly classList: { add(name: string): void; remove(name: string): void };
  readonly style: { pointerEvents: string };
  addEventListener(type: string, listener: () => void): void;
}

export interface UiToastOptions {
  /** How long a toast without a diagnostic ID stays, in milliseconds. One with an ID stays about eight seconds. */
  readonly ms?: number;
}

/** The display half: what `createUiFailureView` returns. */
export interface UiFailureView {
  /** What to show for a failure: a request failure's message, a page's own `Error`'s message, otherwise the fallback. */
  text(error: unknown, fallback?: string): string;
  /** Writes the text into `target`, with a "diagnostic ID" button that copies the whole ID when the failure has one. */
  show(target: UiFailureTarget, error: unknown, fallback?: string): void;
  /** `show` as an error toast: held while pointed at or focused when it carries an ID, otherwise gone after `ms`. */
  toast(target: UiToastTarget, error: unknown, fallback?: string, options?: UiToastOptions): void;
}

/** One per page (`globalThis.molisWorkRequest`); plugin clients receive it as `host.request` from W5-04. */
export type UiRequest = UiRequestCall & UiFailureView;
