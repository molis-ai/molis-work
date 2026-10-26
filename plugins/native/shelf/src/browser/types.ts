import type {
  ShelfAiStatus,
  ShelfClipboardRecord,
  ShelfDeviceSettings,
  ShelfFolderChild,
  ShelfItemRecord,
  ShelfJobRecord,
  ShelfRecipeAvailability,
  ShelfRecipeId,
  ShelfRuntimeStatus,
  ShelfSettingsPatch,
  ShelfShortcutAction,
} from "@molis-ai/molis-work-contracts/modules/shelf";
import type { UiClientTranslate, UiPluginClientHost, UiRequestScope } from "@molis-ai/molis-work-contracts/platform/ui";

export type Translate = UiClientTranslate;
export type Item = ShelfItemRecord;
export type Child = ShelfFolderChild;
export type Clip = ShelfClipboardRecord;
export type Recipe = ShelfRecipeAvailability;
export type Shortcut = ShelfShortcutAction;

/** The mounted root's lifetime (packages/ui-host client-lifecycle): what this page uses of it. */
export interface ShelfLifetime extends UiRequestScope {
  readonly alive: boolean;
  readonly signal: AbortSignal;
  listen(target: EventTarget | null | undefined, name: string, callback: (event: Event) => void | Promise<void>, options?: boolean | AddEventListenerOptions): () => void;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
  poll(read: (signal: AbortSignal) => Promise<void>, delay: number, onError?: (error: unknown) => void): () => void;
  observe(observer: ResizeObserver, target: Element): ResizeObserver;
  timeout(callback: () => void, delay: number): number;
  clearTimeout(id: number): void;
  frame(callback: () => void): number;
}

/** What the page hands Shelf's client: the shared host fields it uses, and the root's lifetime. */
export interface ShelfHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement, HTMLElement>, "translate" | "pluginRoute" | "pluginId" | "copyText" | "nativeFiles" | "loadMedia"> {
  mountPluginClient(root: Element): ShelfLifetime | null;
}

/** The terminal bridge terminal.ts leaves on the page while the root lives. */
export interface ShelfTui { open(): void; send(text: string): boolean; isLive(): boolean }

/** The page's drop-zone program (workbench): says when a file drag is over the zone and when it has left. */
type DropZone = (zone: string | Element, mark: (on: boolean) => void, accepts?: (types: readonly string[]) => boolean) => void;

declare global {
  // `molisWorkShelfTui` is terminal.ts's own bridge (tests stand in for it); `molisDropZone` is left by the page, Shelf only asks.
  var molisWorkShelfTui: ShelfTui | undefined;
  interface Window { molisDropZone?: DropZone }
}

/** What the page shows: Shelf's snapshot, with what a page that has not loaded yet lacks. */
export interface Snapshot {
  materials: readonly Item[];
  results: readonly Item[];
  clipboard: readonly Clip[];
  recipes: readonly Recipe[];
  current_clip_id: string | null;
  runtime: ShelfRuntimeStatus | null;
  ai?: ShelfAiStatus;
  settings?: ShelfDeviceSettings;
  running_jobs?: readonly ShelfJobRecord[];
  root?: string;
}

/** The runtime the page speaks of: the installed one, or the empty words before any is found. */
export type RuntimeView = Pick<ShelfRuntimeStatus, "runtime_key" | "title" | "can_run_job" | "isolation" | "isolation_fact"> & Partial<Pick<ShelfRuntimeStatus, "executable" | "image_text">>;

/** Where the action bar is: nothing shelved, nothing chosen, a kind of material, or a result or clipboard entry. */
export type BarKind = "empty" | "none" | "result" | "clipboard" | Item["kind"];

/** An action waiting for the person's confirmation. */
export interface Pending { recipe: ShelfRecipeId; option: string | null; shortcut: Shortcut | null }

/** What the confirmation drawer asks of a recipe; a shortcut action gets one made up of its own words. */
export type ConfirmRecipe = Pick<Recipe, "recipe" | "short_title" | "label" | "blurb" | "tone" | "accepts" | "output_file" | "needs_network" | "requires_agent" | "minimum_count" | "choices" | "default_choice"> & Partial<Pick<Recipe, "available" | "reason" | "choice_label" | "choice_hint">>;

export interface ChildRef { readonly item_id: string; readonly relative: string }

/** A partial add: the files that did not go in, with the words they were reported with. */
export interface AdmitRetry { readonly files: readonly File[]; readonly hint: string }

export interface MaterialPreview { readonly id: string; readonly fingerprint: string }

/** A request failure the Host or this plugin's routes explained: the code and, for a job, the snapshot taken after it. */
export interface ShelfFailure extends Error { readonly code: string; readonly status: number; readonly body: unknown; retryFiles?: readonly File[] }

export type SettingsPatch = ShelfSettingsPatch;

export interface Reading {
  render(item: { name?: string; kind?: string }, text: string): string;
  markdown(text: string): string;
}

/** The page: its parts, what it knows, and what the person has chosen so far. One per mounted root. */
export interface ShelfPage {
  readonly host: ShelfHost;
  readonly L: Translate;
  readonly lifetime: ShelfLifetime;
  readonly directory: HTMLElement;
  readonly bench: HTMLElement;
  readonly stage: HTMLElement;
  readonly preview: HTMLElement;
  readonly bar: HTMLElement;
  readonly stageWorkspace: HTMLElement | null;
  readonly fileInput: HTMLInputElement | null;
  readonly search: HTMLInputElement | null;
  readonly projectPrefix: string;
  readonly api: string;
  readonly hintDefault: string;
  readonly reading: Reading;
  snapshot: Snapshot;
  selected: Item | null;
  selection: Set<string>;
  pending: Pending | null;
  choices: Record<string, string>;
  runningJob: string | null;
  selectedChild: ChildRef | null;
  openFolders: Set<string>;
  runWatch: (() => void) | null;
  selClip: Clip | null;
  clipSelection: Set<string>;
  clipExpanded: boolean;
  compare: boolean;
  compareSourceId: string | null;
  editing: boolean;
  editLoading: boolean;
  editDraft: string;
  textCache: Map<string, string>;
  textVersion: number;
  editTimer: number;
  arranging: boolean;
  lastBarKind: BarKind;
  stickyHint: string;
  admitRetry: AdmitRetry | null;
  materialPreview: MaterialPreview | null;
  materialTicket: number;
  editWrites: Promise<unknown>;
  multiMode: boolean;
  composingAction: boolean;
  loadVersion: number;
  wantedId: string | null;
  findTimer: number;
  dragSlot: string;
  dragOrder: string[] | null;
}

/** What Shelf's routes answer to a write that changes the shelf: the new snapshot, and the item or clip it made. */
export interface SnapshotAnswer { snapshot: Snapshot; item?: Item; clip?: Clip }
