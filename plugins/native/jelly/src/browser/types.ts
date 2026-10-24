import type {
  JellyBlock, JellyBlockKind, JellyCommand, JellyItem, JellyNote, JellyOccurrence, JellyPlan, JellyPlanAction, JellyPriority, JellyRelation, JellyWorkspace,
} from "@molis-ai/molis-work-contracts/modules/jelly";
import type { Request, Stream } from "./request.js";

export type { JellyBlock, JellyBlockKind, JellyCommand, JellyItem, JellyNote, JellyOccurrence, JellyPlan, JellyPlanAction, JellyPriority, JellyRelation, JellyWorkspace };
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** What the workbench hands the Jelly page's client. */
export interface JellyHost {
  readonly translate?: Translate;
  download(blob: Blob, filename: string): void | Promise<void>;
  readRefusal?(status: number, code: unknown): string | undefined;
}

/** A failed request: the Host's plain Error with its `code` and HTTP `status` (0 when there was no answer). */
export type Failure = Error & { status?: number; code?: string };

export type View = "calendar" | "notes" | "progress";
export type Mode = "month" | "week" | "list";
export type ReviewTab = "completed" | "open" | "overdue" | "priority" | "categories";
export type Scope = "onlyThis" | "thisAndFuture";
export type RelationRole = "primary" | "reference";

export interface ItemOptions { kind: "task" | "event"; category_id: string; priority: JellyPriority; weekdays: number[]; scope: Scope }
/** A task block of a note that is being given a place in the calendar. */
export interface LinkedTask { note_id: string; block_id: string; title: string }
/** What the server says a destructive or importing command would change, with the token that confirms it. */
export interface Preview { counts: Record<string, number>; confirmation_token: string; warnings?: string[] }
export interface Selected { kind: "note"; id: string }

/** One plan candidate as the person is editing it, kept until the plan is applied or dropped. */
export interface PlanUi { create: boolean; arrange: boolean; date: string; time: string; duration: number; locks: Set<string> }
export interface PlanSource { kind: string; id: string }

export interface DialogHooks {
  submit: (() => Promise<unknown>) | null;
  cleanup: (() => void) | null;
  version: number;
}

/** The part of the page the person is on and everything the modules share. */
export interface JellyPage {
  readonly host: JellyHost;
  readonly root: HTMLElement;
  readonly L: Translate;
  readonly request: Request;
  readonly stream: Stream;
  readonly list: HTMLElement;
  readonly content: HTMLElement;
  readonly workspace: HTMLElement;
  readonly documentEl: HTMLElement;
  state: JellyWorkspace | null;
  view: View;
  mode: Mode;
  anchor: string;
  query: string;
  filterCategory: string;
  archived: boolean;
  hideCompleted: boolean;
  occurrences: JellyOccurrence[];
  calendarSeq: number;
  selected: Selected | null;
  dirty: boolean;
  saveTimer: number;
  savePending: Promise<unknown>;
  mutationQueue: Promise<unknown>;
  dialog: DialogHooks;
  noticeTimer: number;
  editingItem: JellyOccurrence | null;
  itemOptions: ItemOptions;
  linkedTask: LinkedTask | null;
  relationRole: RelationRole;
  relationScope: "instance" | "series";
  calendarSelected: Set<string>;
  reviewTab: ReviewTab;
  reviewPeriod: "week" | "month";
  itemContextBefore: { value: string | null } | null;
  editorRevision: number;
  editorVersion: number;
  composing: boolean;
  focusedBlock: string;
  lastRange: Range | null;
  draftBlocks: JellyBlock[];
  savingEditor: boolean;
  currentPlan: JellyPlan | null;
  currentPlanSource: PlanSource | null;
  planUi: Map<string, PlanUi>;
  leftForSettings: boolean;
  /** The workspace; the page only works once it was loaded. */
  ws(): JellyWorkspace;
  $<T extends Element = HTMLElement>(selector: string, scope?: ParentNode): T;
  $$<T extends Element = HTMLElement>(selector: string, scope?: ParentNode): T[];
  tx(key: string): string;
  btn(label: string, attrs?: string, glyphName?: string, primary?: boolean): string;
  categoryDot(id: string): string;
  catName(entry: { id: string; name: string }): string;
}
