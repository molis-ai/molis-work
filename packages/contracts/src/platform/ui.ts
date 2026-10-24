import type { ContractDescriptor } from "./package.js";
import type { ActionReference } from "./actions.js";

/** The isolated page calls only its installation's own or declared consumed actions. Identity and grants stay with the Host. */
/** The current contribution only; the Host chooses its address and rechecks its installation. */
/** Refreshing the shell always uses its current address; plugins cannot select a host URL. */
export interface UiPageView<Element = unknown> {
  readDocument(): Promise<string>;
  /** Replace the current own-action cleanup; null cancels it. The Host runs it before revoking this page. */
  onClosing(action: { reference: ActionReference; input: unknown } | null): void;
  refreshShell(): void;
  /** The shell displays another current-project object inside this slot; its DOM and authority stay outside this page. */
  embed(element: Element, target: { surface: string; itemId: string; title?: string }): { ready: Promise<void>; dispose(): void };
}

export interface UiPageActions {
  invokeAction<Output = unknown>(reference: ActionReference, input: unknown): Promise<Output>;
}

/** Current-project directories only. Linking requires confirmation in the trusted Host; selecting grants no new access. */
export interface UiPageWorkspaces {
  add(path: string): Promise<{ workspace_id: string }>;
  select(workspaceId: string): Promise<void>;
}

/** A Host-owned review surface. The page supplies filters and a slot, never a decision or review contents. */
export interface UiPageReviewQuery {
  readonly runIds: readonly string[];
  readonly sessionId?: string | null;
  readonly workspaceId?: string | null;
  readonly runSession?: string;
  readonly limit?: number;
}
/** Completion only; detailed review contents and receipts remain in the trusted Host. */
export type UiPageReviewOutcome = "unavailable" | "uncertain" | "rejected" | "reconciled" | "failed" | "settled" | "pending";
export interface UiPageReviews<Element = unknown> {
  show(element: Element, query: UiPageReviewQuery, options?: { signal?: AbortSignal; onDecision?: (outcome: UiPageReviewOutcome) => void }): Promise<void>;
}

/** Browser-local unsent drafts, namespaced by the Host to this installation. Keys are at most 256 characters; values at most 16 MiB of UTF-8. */
export interface UiPageDrafts {
  read(key: string): Promise<string | null>;
  write(key: string, value: string | null): Promise<void>;
}

/** Modal page interactions work without native browser dialogs in an isolated view. Closing the view cancels them. */
export interface UiPageDialogs {
  confirm(message: string): Promise<boolean>;
  prompt(message: string, initial?: string): Promise<string | null>;
}

/** Page commands only address a terminal already created by this installation in the current project. */
export type UiTerminalCommand = { type: "attach"; panelId: string; cols?: number; rows?: number }
  | { type: "write"; panelId: string; data: string } | { type: "resize"; panelId: string; cols: number; rows: number }
  | { type: "kill"; panelId: string };
export type UiTerminalEvent = { type: "disconnected" }
  | { type: "spawned"; panelId: string; attached: boolean; started: boolean; replay: string }
  | { type: "data"; panelId: string; data: string } | { type: "exit"; panelId: string; exitCode: number; signal: number }
  | { type: "error"; panelId?: string; message: string };
export interface UiTerminalView {
  focus(): void;
  fit(): void;
  /** Release the view. The accepted server process continues. */
  dispose(): void;
}
export interface UiTerminalMountOptions {
  readonly panelId: string;
  readonly onEvent?: (event: UiTerminalEvent) => void;
}
export interface UiPageTerminal<Element = unknown> {
  /** The Host supplies rendering, keyboard input, replay, theme and resize handling. */
  mount(element: Element, options: UiTerminalMountOptions): Promise<UiTerminalView>;
  /** Resolves after handing the command to the transport; terminal events confirm its effect. */
  send(command: UiTerminalCommand): Promise<void>;
  listen(receive: (event: UiTerminalEvent) => void): () => void;
}

/** Presentation messages between one plugin's stage and contextual side view, routed by the shell. */
export interface UiPageMessage {
  type: "molis:side-open" | "molis:side-ready" | "molis:side-context" | "molis:side-shown" | "molis:side-context-command" | "molis:side-context-result";
  [key: string]: unknown;
}
export interface UiPageMessages {
  send(message: UiPageMessage): void;
  listen(receive: (message: UiPageMessage) => void): () => void;
}
/** Export content created by this page, or load media through its installation-bound request channel. */
export interface UiPageFiles<Element = unknown> {
  /** Desktop handoff of files inside this installation's declared owner directory. Paths must be relative. */
  readonly nativeFiles?: {
    copy(paths: readonly string[]): Promise<void>;
    drag(paths: readonly string[], itemIds?: readonly string[]): Promise<void>;
    open(path: string): Promise<void>;
    /** Search in the trusted desktop picker. Only files the person selects there are returned; paths never enter this page. */
    pick(query: string): Promise<readonly File[]>;
  };
  /** Write text after a user interaction; no clipboard read permission is granted. */
  copyText(text: string): Promise<void>;
  download(blob: Blob, filename: string): Promise<void>;
  printDocument(html: string): void;
  loadMedia(element: Element, path: string): void;
}

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

/**
 * The rail's groups, in the order the shell lists them. They read as what a person wants to do, not as kinds of software
 * (specs/archive/plugin-e2e-review §3.1): 推进, 写与做, 个人, 研究, 编码. The Host owns their names and their order; a view
 * that opens its plugin from the rail names the group it belongs to, and one that names none is listed under 更多.
 */
export const UI_VIEW_GROUPS = ["advance", "make", "personal", "research", "code"] as const;

export type UiViewGroup = (typeof UI_VIEW_GROUPS)[number];

/** A kind of thing a person can make new from a Goal: one of the Manifest's create stations, and the kind's name. */
export interface UiViewCreateEntry {
  /** The `id` of a `workflow_content` station of the same Manifest whose role is `create`; `placement.create` calls it. */
  readonly station: string;
  /** The kind's name (文档, 问卷): the button says it, and a new one is called 未命名 followed by it. */
  readonly title: string;
}

/** One way to start something from the project home on an empty day; choosing it opens the view's plugin. */
export interface UiViewStartEntry {
  readonly title: string;
  /** One sentence, shown as the entry's hint. */
  readonly hint: string;
  /** Icon name from the Host's catalog, as for the view's own `icon`; omitted means the view's icon. */
  readonly icon?: string;
}

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
  /** A side view follows the focused stage object of its own plugin. Omitted means a persistent tool. */
  readonly context_binding?: "focused-object";
  /**
   * `side` views only: the object kinds this cell of the right panel shows, so what is picked up there is a known object.
   * Each kind needs an object reader (`subject.read`) in the same Manifest (context-program §4).
   */
  readonly objects?: readonly string[];
  /** Lower sorts earlier inside its slot. Ties fall back to view_id order. */
  readonly order?: number;
  /** `navigator` and `island` views only: the rail group the plugin is listed in. Omitted means 更多. */
  readonly group?: UiViewGroup;
  /** `navigator` and `island` views only: what a person can make new with this plugin from a Goal. */
  readonly creates?: UiViewCreateEntry;
  /** `navigator` and `island` views only: the project home's way to start with this plugin. */
  readonly start?: UiViewStartEntry;
}

/** Focused stage metadata delivered by the shell to a declared contextual side view. Never grants object access. */
export interface UiSideContext {
  readonly plugin_id: string;
  readonly pane_id: string;
  readonly tab_id: string;
  readonly view_id: string;
  readonly object_ref: { readonly kind: string; readonly id: string; readonly title?: string; readonly version?: string | number };
  readonly revision: string | number | null;
  readonly unsaved: boolean;
}

/** A side client announces molis:side-ready; the shell sends its latest context, including explicit clearing. */
export interface UiSideContextMessage {
  readonly type: "molis:side-context";
  readonly context_epoch: number;
  readonly context: UiSideContext | null;
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

export type UiClientTranslate = (key: string, values?: Record<string, string | number>) => string;

/** The current mounted client only. Removing its view cancels reads and releases owned work. */
export interface UiClientScope extends UiRequestScope {
  readonly alive: boolean;
  readonly visible: boolean;
  readonly signal: AbortSignal;
  own(cleanup: () => void): () => void;
  dispose(): void;
  frame(callback: () => void): number;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
}

/** The shared question card operations consumed by plugin pages. */
export interface UiPageInteraction {
  read(): Record<string, unknown>;
  showErrors(errors: Record<string, string>, options?: { focus?: boolean }): void;
  focusField(fieldId: string): void;
  destroy(): void;
}

/** The public client factory input. DOM types are supplied by browser consumers, never imported by this package. */
export interface UiPluginClientHost<Element = unknown, Dialog = Element, Media = Element> extends UiPageFiles<Media>, UiPageDialogs, UiPageActions {
  readonly root: Element;
  readonly scope: UiClientScope;
  readonly translate: UiClientTranslate;
  /** From the owning Manifest; presentation only, never accepted as authority by the parent. */
  readonly pluginId: string;
  projectId(): string;
  projectTitle(): string;
  /** A platform path in the current project (or Home). */
  route(path: string): string;
  /** A relative path under this plugin's Manifest identity and current project (or Home). */
  pluginRoute(path: string): string;
  /**
   * The surface that opens objects of this kind, as the plugins declare it (their search sources), or `null` when no surface
   * does or several do. A page links an object it holds only by `kind` and `id` through it, and shows plain text when it is `null`.
   */
  surfaceFor(kind: string): string | null;
  readRefusal(status: number, code: unknown): string;
  confirmBox(dialog: Dialog, ok: Element, run?: () => Promise<unknown>): Promise<boolean>;
  interaction(card: Element, options: { onSubmit?: () => void }): UiPageInteraction;
  readonly drafts: UiPageDrafts;
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
  /**
   * A file sent as the raw body, in place of `body`, with its own type (`application/octet-stream` when it has none): an upload of
   * any size that is never read into a string. Its name goes in a header the route names.
   */
  readonly file?: Blob;
  /** How an answer is read: `json` (default; an empty answer is `null`), `text`, or the untouched `response` for any status. */
  readonly as?: "json" | "text" | "response";
  /** Statuses outside 2xx that still are an answer to read (a 404 that carries a result fragment, say). */
  readonly accept?: readonly number[];
  /** The one-time key. Give the same key when the same intent is sent again; without one every request gets a new key. */
  readonly key?: string;
  /** Extra request headers. They cannot add or replace the control token, the one-time key or the content type. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  /** Allow the browser to finish a small request while the document closes. Authority is still checked by the Host. */
  readonly keepalive?: boolean;
  /** The view's lifetime: leaving the page cancels the request, and an answer that arrives after that is dropped. */
  readonly scope?: UiRequestScope;
  /** Shown when the answer carries no explanation of its own. */
  readonly fallback?: string;
}

/** A POST to a declared NDJSON route. Progress is a preview; only its final result confirms completion. */
export interface UiStreamRequestInit extends Omit<UiRequestInit, "method" | "as" | "accept"> {
  readonly onProgress?: (event: import("./actions.js").ActionProgressEvent) => void;
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
  /** Uses the same origin/control headers and refuses an incomplete or malformed stream. */
  stream<T = unknown>(url: string, init?: UiStreamRequestInit): Promise<T>;
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

/** The shared request helper installed once per page. */
export type UiRequest = UiRequestCall & UiFailureView;
