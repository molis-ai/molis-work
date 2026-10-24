import type { DatasetColumn, DatasetRecord, DatasetRow, DatasetVersionRecord } from "@molis-ai/molis-work-contracts/modules/dataset";
import type { UiClientTranslate as Translate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type { Translate };
export type Dataset = DatasetRecord;
export type Column = DatasetColumn;
export type Row = DatasetRow;
export type Version = DatasetVersionRecord;

/** What the workbench hands Dataset's client: the shared host fields it uses. */
export type DatasetHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "translate" | "download" | "pluginId" | "projectId" | "pluginRoute">;

/** A failed request: the Host's plain Error with its `code`. */
export type Failure = Error & { code?: string };

/** One request to Dataset's routes; `path` is under the plugin (`/datasets`, `/datasets/<id>/versions`). */
export type DatasetRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<T>;

/** What the person has typed into the editor: the title, the description and the table as the cells hold it. */
export interface Draft { title: string; description: string; columns: Column[]; rows: Row[] }

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
  readonly descInput: HTMLInputElement;
  readonly tableEl: HTMLTableElement;
  readonly tableEmpty: HTMLElement | null;
  readonly filterEmpty: HTMLElement | null;
  readonly filterInput: HTMLInputElement;
  readonly toolbar: HTMLElement | null;
  readonly columnName: HTMLInputElement | null;
  readonly columnType: HTMLSelectElement | null;
  readonly aiPrompt: HTMLInputElement;
  readonly csvInput: HTMLTextAreaElement;
  readonly note: HTMLElement | null;
  readonly versionsEl: HTMLElement;
  readonly versionNote: HTMLInputElement;
  readonly confirmBox: HTMLDialogElement | null;
  readonly pendingNote: HTMLElement;
  readonly artifactBar: HTMLElement | null;
  readonly generateAi: HTMLButtonElement;
  readonly aiReason: HTMLElement;
  readonly importInput: HTMLInputElement | null;
}

export interface DatasetState {
  records: Dataset[];
  /** The table open in the editor, as the Host last gave it, with what has been typed since drawn over it. */
  selected: Dataset | null;
  saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Edits made, and the edits a save has taken: a table is unsaved while the first is ahead of the second. */
  editRev: number;
  savedRev: number;
  saveRun: Promise<Dataset | null> | null;
  saveError: unknown;
  busy: boolean;
  aiAvailable: boolean;
  aiUnavailableReason: string;
  /** Counts the editors opened and closed, so an answer that arrives after the editor changed is dropped. */
  editorSeq: number;
  listSeq: number;
  /** The filter the rows on screen were drawn with (not a newer one being typed). */
  filterSeen: string;
}

/**
 * The page the parts share. The parts that draw, load and save install their operations on it (`installStatus`, `installTable`,
 * `installList`, `installEditor`) before the page is used.
 */
export interface DatasetPage {
  readonly host: DatasetHost;
  readonly L: Translate;
  readonly el: Elements;
  readonly s: DatasetState;
  readonly request: DatasetRequest;
  /** The table routes under this plugin. */
  readonly api: string;
  showNote(text: string, isError?: boolean): void;
  arrive<T extends HTMLElement | null | undefined>(node: T): T;
  /** Tells the placement bar what happened and where the result is. */
  placed(detail: Record<string, unknown>): void;
  ask(message: string, okLabel: string): Promise<boolean>;
  // Installed by the status part.
  publishContext(): void;
  paintStatus(record: Dataset): void;
  setBusy(value: boolean): void;
  // Installed by the table part.
  columnsFromDom(): Column[];
  rowsFromDom(): Row[];
  readDraft(): Draft;
  renderTable(record: Dataset): void;
  renderVersions(versions: readonly Version[]): void;
  // Installed by the list part.
  renderList(): void;
  markSelected(id: string): void;
  remember(record: Dataset, redraw: boolean): void;
  loadList(): Promise<void>;
  listFailed(error: unknown): void;
  // Installed by the editor part.
  fillEditor(record: Dataset): Promise<void>;
  closeEditor(): void;
  save(): Promise<Dataset | null>;
  queueSave(): void;
}
