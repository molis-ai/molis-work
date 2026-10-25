import type {} from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { PptRecord, PptSlide } from "@molis-ai/molis-work-contracts/modules/ppt";
import type { UiClientTranslate as Translate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type { Translate };
export type Ppt = PptRecord;
export type Slide = PptSlide;

/** What the workbench hands PPT's client: the shared host fields it uses. */
export type PptHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "download" | "printDocument" | "pluginId" | "projectId" | "pluginRoute" | "confirmBox">;

/** A failed request: the Host's plain Error with its `code`. */
export type Failure = Error & { code?: string };

/** One request to PPT's routes; `path` is under the plugin (`/ppt`, `/ppt/<id>/pptx?expected_version=3`). */
export type PptRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>, signal?: AbortSignal) => Promise<T>;

/** What the person has typed into the editor: the deck's title, description, colors and slides as the fields hold them. */
export interface Draft {
  title: string;
  description: string;
  color_primary: string;
  color_background: string;
  color_text: string;
  slides: Slide[];
}

/** The parts of the page the server drew. Those that may be missing are `null`: the page works without them. */
export interface Elements {
  readonly bench: HTMLElement;
  readonly list: HTMLElement;
  readonly rowsEl: HTMLElement;
  readonly empty: HTMLElement;
  readonly workspace: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly statusEl: HTMLElement;
  readonly titleInput: HTMLInputElement;
  readonly descriptionInput: HTMLInputElement;
  readonly colorPrimary: HTMLElement;
  readonly colorBackground: HTMLElement;
  readonly colorText: HTMLElement;
  readonly slideList: HTMLElement;
  readonly slideTitle: HTMLInputElement;
  readonly slideBullets: HTMLTextAreaElement;
  readonly slideNotes: HTMLTextAreaElement;
  readonly previewEl: HTMLElement;
  readonly note: HTMLElement | null;
  readonly confirmDialog: HTMLDialogElement | null;
  readonly pendingNote: HTMLElement;
  readonly artifactBar: HTMLElement | null;
  readonly outBox: HTMLDialogElement | null;
  readonly outlineForm: HTMLFormElement | null;
}

export type OutlineMode = "local" | "ai";
export type OutlineKind = "text" | "page";

/** The outline request in flight: what it was started with, so an answer that arrives after the dialog moved on is dropped. */
export interface OutlineAttempt {
  readonly controller: AbortController;
  readonly submit: HTMLButtonElement;
  readonly label: string;
  readonly id: string;
  readonly revision: number;
  readonly mode: OutlineMode;
  readonly source: OutlineKind;
  readonly text: string;
}

export interface PptState {
  records: Ppt[];
  /** The deck open in the editor, as the Host last gave it, with what has been typed since drawn over it. */
  selected: Ppt | null;
  slideKey: string;
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Edits made, and the edits a save has taken: a deck is unsaved while the first is ahead of the second. */
  editRev: number;
  savedRev: number;
  saveRun: Promise<Ppt | null> | null;
  saveError: unknown;
  busy: boolean;
  aiAvailable: boolean;
  aiUnavailableReason: string;
  listSeq: number;
  outlineMode: OutlineMode;
  outlineKind: OutlineKind;
  outline: OutlineAttempt | null;
}

/**
 * The page the parts share. The parts that draw, load and save install their operations on it (`installStatus`, `installSlides`,
 * `installList`, `installEditor`, `installOutline`, `installPresent`) before the page is used.
 */
export interface PptPage {
  readonly host: PptHost;
  readonly L: Translate;
  readonly el: Elements;
  readonly s: PptState;
  readonly request: PptRequest;
  /** The deck routes under this plugin. */
  readonly api: string;
  showNote(text: string, isError?: boolean): void;
  arrive<T extends HTMLElement | null | undefined>(node: T): T;
  /** Tells the placement bar what happened and where the result is. */
  placed(detail: Record<string, unknown>): void;
  /** The shared confirmation box; with `run` the request goes out inside it and a refusal is said there. */
  ask(message: string, okLabel: string, run?: () => Promise<unknown>): Promise<boolean>;
  /** The deck in the editor; it is a mistake to ask for it when none is open. */
  open(): Ppt;
  // Installed by the status part.
  publishContext(): void;
  paintStatus(record: Ppt): void;
  setBusy(value: boolean): void;
  // Installed by the slides part.
  currentSlide(): Slide | undefined;
  slidesFromEditor(): Slide[];
  setColor(root: Element | null, value: string): void;
  liveRecord(): Ppt;
  draftFromDom(): Draft;
  paintView(record: Ppt): void;
  renderSlideList(record: Ppt): void;
  syncSlideLabel(): void;
  fillSlideFields(slide: Slide | undefined): void;
  // Installed by the list part.
  renderList(): void;
  markSelected(id: string): void;
  remember(record: Ppt, redraw: boolean): void;
  loadList(): Promise<void>;
  listFailed(error: unknown): void;
  // Installed by the editor part.
  fillEditor(record: Ppt): void;
  closeEditor(): void;
  save(): Promise<Ppt | null>;
  queueSave(): void;
  // Installed by the outline part.
  openOutline(): void;
  paintOutlineModes(): void;
  // Installed by the present part.
  present(record: Ppt, start: number): void;
  printDeck(record: Ppt): void;
}
