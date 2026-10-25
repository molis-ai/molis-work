import type { LingguangConversation, LingguangMessage, LingguangSpark } from "@molis-ai/molis-work-contracts/modules/lingguang";
import type { UiClientScope, UiClientTranslate as Translate, UiPageView, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
// The type brings `window.molisCopy` and `window.molisFit`, which the workbench page provides; nothing of the package is bundled.
import type {} from "@molis-ai/molis-work-plugin-sdk/page-globals";

export type { Translate };
export type Spark = LingguangSpark;
export type Conversation = LingguangConversation;
export type Message = LingguangMessage;
/** The view's lifetime, from the browser Host's mount scope: what is started with it ends with it. */
export type Scope = UiClientScope;

/** What the workbench hands 灵光's client: the shared host fields it uses, the mount scope and the closing registration. */
export interface LingguangHost extends Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "route" | "pluginRoute" | "pluginId" | "readRefusal"> {
  mountPluginClient(root: HTMLElement): Scope | null;
  readonly view: Pick<UiPageView<HTMLElement>, "onClosing">;
}

/** A failed request: the Host's plain Error with its `code`, HTTP `status` and parsed `body` (the extra detail a refusal carries). */
export type Failure = Error & { status?: number; code?: string; body?: { details?: { approximate_bytes?: unknown } } | null };

/** One request to 灵光's routes (`path` is under the plugin: `/sparks`) or to a platform route (a path that starts with `/api/`). */
export type LingguangRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<T>;

/** What reading a file or a page returned: the text, and anything it could not read. */
export interface Reading { text: string; title?: string; partial?: boolean; issues?: readonly string[] }
export interface ConversationPayload { conversation: Conversation; sparks?: readonly Spark[]; messages?: readonly Message[] }

export type SaveState = "saved" | "unsaved" | "saving" | "failed";

/** The parts of the page the server drew that every module works with. */
export interface Elements {
  readonly workbench: HTMLElement;
  readonly list: HTMLElement;
  readonly rowsEl: HTMLElement;
  readonly empty: HTMLElement;
  readonly workspace: HTMLElement;
  readonly titleEl: HTMLElement;
  readonly titleInput: HTMLInputElement;
  readonly bodyInput: HTMLTextAreaElement;
  readonly editorPane: HTMLElement;
  readonly chatPane: HTMLElement;
  readonly selectionBar: HTMLElement;
  readonly selectedCountEl: HTMLElement;
  readonly note: HTMLElement;
  readonly confirmDialog: HTMLDialogElement;
  readonly saveStatus: HTMLElement;
  readonly saveRetry: HTMLElement;
  readonly todoButton: HTMLElement;
  readonly contextEl: HTMLElement;
  readonly messagesEl: HTMLElement;
  readonly chatForm: HTMLFormElement;
  readonly chatInput: HTMLTextAreaElement;
  readonly readingDialog: HTMLDialogElement;
  readonly linkDialog: HTMLDialogElement;
  readonly fileInput: HTMLInputElement;
  readonly askForm: HTMLFormElement;
  readonly askInput: HTMLInputElement;
}

export interface LingguangState {
  records: Spark[];
  picks: Set<string>;
  /** The spark open in the editor, and the copy the Host last gave for it (what a save is judged against). */
  selected: Spark | null;
  editorBase: { record: Spark } | null;
  conversation: Conversation | null;
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  listSeq: number;
  saveQueue: Promise<unknown>;
  sending: boolean;
  /** Sparks 「记下」 made blank, with the title the Host gave them (W2-18 decision 6). */
  fresh: Map<string, string>;
  /** Where each spark went (a document, a Goal, a todo), filled after paint from the placement ledger. */
  fates: Map<string, string>;
  shownMessages: Message[];
  loadingFor: string | null;
  /** A spark asked for by link, a tab or a workflow step, and whether the workbench said so quietly. */
  wantedId: string | null;
  wantedByLink: boolean | "quiet";
}

/**
 * The page the parts share. The parts that draw and load install their operations on it (`installEditor`, `installList`,
 * `installMaterial`, `installChat`) before the page is used.
 */
export interface LingguangPage {
  readonly host: LingguangHost;
  readonly L: Translate;
  readonly life: Scope;
  readonly el: Elements;
  readonly s: LingguangState;
  readonly request: LingguangRequest;
  /** The spark routes under this plugin. */
  readonly api: string;
  showNote(text: string, isError?: boolean): void;
  /** Shows the brainstorm pane in place of the editor, or the editor in place of the brainstorm. */
  showChat(on: boolean): void;
  ask(message: string, okLabel: string): Promise<boolean>;
  /** Tells the placement bar a spark was made. */
  placed(detail: { verb: string; title: string; object: { kind: string; id: string } }): void;
  // Installed by the editor part.
  showSave(state: SaveState): void;
  publishContext(unsaved: boolean): void;
  closingBlank(): void;
  fillEditor(record: Spark): void;
  closeWorkspace(): void;
  save(): Promise<Spark | null>;
  queueSave(): void;
  syncTodo(): void;
  dropBlank(id: string | undefined): Promise<void>;
  leaveBlank(): Promise<void>;
  leaveOnFold(): void;
  // Installed by the list part.
  loadList(): Promise<void>;
  renderList(): void;
  /** Puts a spark the Host returned into the list (first when new) and refreshes its row; `base` is the editor it was saved from. */
  remember(record: Spark, base: { record: Spark } | null): void;
  markSelected(id: string): void;
  syncSelectionBar(): void;
  openWanted(): Promise<void>;
  listFailed(error: unknown): void;
  selectedRecords(): Spark[];
  // Installed by the material part.
  readMaterial(path: string, payload: Record<string, unknown>): Promise<Reading | null>;
  askLink(): Promise<string | null>;
  keepReading(reading: Reading, fallbackTitle: string, origin: string): Promise<void>;
  // Installed by the chat part.
  openBrainstorm(): Promise<void>;
  handOver(purpose: string, text: string): void;
  copyDispatch(button: Element): Promise<void>;
}
