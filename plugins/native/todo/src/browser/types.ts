import type { TodoBatch, TodoCandidate, TodoChange, TodoItem } from "@molis-ai/molis-work-contracts/modules/todo";

export type { UiClientTranslate as Translate } from "@molis-ai/molis-work-contracts/platform/ui";
import type { UiClientTranslate as Translate, UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type TodoClientHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "translate" | "route" | "pluginRoute" | "pluginId" | "projectId" | "projectTitle" | "readRefusal" | "confirmBox" | "surfaceFor">;

/** One request to the Todo routes; `path` is relative to the current plugin, or is a full `/api/…` path. */
export type TodoRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<T>;

export type TodoFlag = "overdue" | "due_today" | "planned_past" | "planned_today" | "stale";
export interface TodoRow extends TodoItem { readonly flags: readonly TodoFlag[] }

export interface ListPayload {
  readonly today: string;
  readonly counts: Record<string, number>;
  readonly items: TodoRow[];
}
export interface ItemPayload { readonly item: TodoItem; readonly change_id?: string | null }
export interface DetailPayload {
  readonly item: TodoItem;
  readonly history: TodoChange[];
  readonly backlinks: Backlink[];
}
export interface Backlink { readonly item_id: string; readonly title: string; readonly relation: string | null }
export interface ReminderEntry { readonly item: TodoItem; readonly late: boolean }
export interface RevertPayload { readonly items: TodoItem[]; readonly removed_ids: string[] }

/** A work of the resident Assistant that relates to a todo, as the Assistant reports it. */
export interface AssistantWork {
  readonly work_id: string;
  readonly title: string;
  readonly state: string;
  readonly results?: readonly {
    readonly title: string;
    readonly state?: string;
    readonly open?: { readonly surface: string; readonly id: string } | null;
    readonly moved_to?: { readonly title?: string } | null;
  }[];
}

/** What a button remembers to undo the last change (one change, or a whole batch). */
export type UndoTarget = { change_id: string } | { batch_id: string };
/** Where `todo.note.view` goes after a todo was written down in a view the person is not looking at. */
export interface NoteView { readonly key: string; readonly id: string }
export interface NoteOptions { error?: boolean; undo?: UndoTarget | null; view?: NoteView }

/** The person's choices on one organizing candidate, kept until the batch is applied. */
export interface CandidateChoice {
  picked: boolean;
  editing: boolean;
  edits: Record<string, string | null | undefined>;
  accept: Set<string>;
}
export interface CandidateDecision {
  candidate_id: string;
  action: string;
  edits?: Record<string, string | null | undefined>;
  accept_protected?: string[];
}
export interface ApplyPayload { readonly change_batch_id: string; readonly results: readonly { readonly item_id: string | null }[] }

/** The Todo page's elements, found once; each is on the page the server drew. */
export interface TodoElements {
  readonly bench: HTMLElement;
  readonly list: HTMLElement;
  readonly rowsEl: HTMLElement;
  readonly empty: HTMLElement;
  readonly loading: HTMLElement;
  readonly summary: HTMLElement;
  readonly remindersBox: HTMLElement;
  readonly note: HTMLElement;
  readonly noteText: HTMLElement;
  readonly undoButton: HTMLButtonElement;
  readonly viewButton: HTMLButtonElement;
  readonly quick: HTMLFormElement;
  readonly quickInput: HTMLInputElement;
  readonly quickParts: HTMLElement;
  readonly quickPlacement: HTMLElement;
  readonly quickSubmit: HTMLButtonElement;
  readonly search: HTMLInputElement;
  readonly scopeButton: HTMLButtonElement;
  readonly batchBar: HTMLElement;
  readonly workspace: HTMLElement;
  readonly heading: HTMLElement;
  readonly saveStatus: HTMLElement;
  readonly detailNote: HTMLElement;
  readonly confirmBox: HTMLDialogElement;
  readonly reviewEl: HTMLElement;
  readonly reviewToggle: HTMLButtonElement;
}

export interface TodoState {
  view: string;
  query: string;
  everything: boolean;
  items: TodoRow[];
  counts: Record<string, number>;
  today: string;
  listSeq: number;
  selected: TodoItem | null;
  works: AssistantWork[];
  worksTimer: number;
  /** Just after handing a todo over, its work may not have started yet: keep looking until then. */
  watchWorksUntil: number;
  history: TodoChange[];
  backlinks: Backlink[];
  linkPool: TodoRow[];
  picked: Set<string>;
  undo: UndoTarget | null;
  noteView: NoteView | null;
  noteTimer: number;
  saveTimer: number;
  saving: Promise<void> | null;
  dirtyKeys: Set<string>;
  busy: boolean;
  quickAttempt: { fingerprint: string; request_id: string } | null;
  dropped: Set<string>;
  placeChoice: string;
  /** Only the latest opening paints: picking another item, or closing, before it answers keeps what came last. */
  detailTicket: number;
  reminders: ReminderEntry[];
  reminderSeq: number;
  batchSeq: number;
  batches: TodoBatch[];
  focusBatch: string;
  choices: Map<string, CandidateChoice>;
}

/**
 * The page: its elements, state and the operations the parts call on each other. A part installs its own operations when the
 * client starts (list.ts, reminders.ts, review.ts, detail.ts, quick.ts); until then they are not callable, and every part is
 * installed before the first read goes out.
 */
export interface TodoPage {
  readonly host: TodoClientHost;
  readonly L: Translate;
  readonly el: TodoElements;
  readonly state: TodoState;
  readonly request: TodoRequest;
  $<T extends Element = HTMLElement>(selector: string): T;
  field(name: string): HTMLInputElement | HTMLTextAreaElement;
  projectId(): string;
  hereName(): string;
  placeName(value: string): string;
  statusName(status: string): string;
  dayDiff(date: string): number;
  dayLabel(date: string): string;
  timeLabel(iso: string): string;
  showNote(text: string, options?: NoteOptions): void;
  detailHint(text: string, error?: boolean): void;
  ask(message: string, okLabel: string, run?: () => Promise<unknown>): Promise<boolean>;
  paintPlaces(container: Element, current: string, attribute: string): void;
  tellAssistant(purpose: string, item: TodoItem, extra?: Record<string, unknown>): void;
  publishContext(): void;
  load(): Promise<void>;
  renderList(): void;
  renderBatch(): void;
  loadReminders(): Promise<void>;
  loadBatches(): Promise<void>;
  renderReview(): void;
  openDetail(id: string, keepEdits?: boolean): Promise<void>;
  closeDetail(): Promise<void>;
  flush(): Promise<void>;
  setStatus(id: string, status: string, revision: number): Promise<void>;
  setBusy(value: boolean): void;
  renderQuick(): void;
  quickDefaultPlacement(): string;
  paintSave(): void;
  watchWorks(): void;
  loadWorks(item: TodoItem): Promise<void>;
  post<T = ItemPayload>(item: TodoItem, tail: string, body?: Record<string, unknown>): Promise<T>;
  candidateOf(id: string): { batch: TodoBatch; candidate: TodoCandidate } | null;
  queueSave(name: string): void;
  material(item: TodoItem): { title: string; text: string };
  runBatch(change: Record<string, unknown>, doneText: (count: number) => string): Promise<void>;
}
