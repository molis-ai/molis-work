import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";
import type { JellyCategory, JellyItem, JellyNote, JellyOccurrence, JellySeries } from "../contract.js";

export type { JellyCategory, JellyItem, JellyNote, JellyOccurrence, JellySeries };
/** What the workbench hands the Jelly page: its own actions, the shared toast (with 「撤销」), and how a refused read is said. */
export type JellyHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>, "invokeAction" | "showToast" | "readRefusal">;
/** A failed action: the Host's Error with its `code`, HTTP `status` and, for a conflict, which row and its revision now. */
export type Failure = Error & { status?: number; code?: string; details?: { id?: string; revision?: number } };
export type NoteSummary = Pick<JellyNote, "id" | "title" | "day" | "revision" | "updated_at"> & { excerpt: string };
export type Rows = { categories?: JellyCategory[]; items?: JellyItem[]; series?: JellySeries[]; notes?: JellyNote[] };
export type Scope = "onlyThis" | "thisAndFuture" | "all";

/** The entry being written in the side panel: a new one, a one-off entry, or one occurrence of a series. */
export interface Draft {
  occurrence: JellyOccurrence | null;
  title: string; kind: "task" | "event"; allDay: boolean;
  start_date: string; end_date: string; start_time: string; end_time: string;
  originalRule?: { weekdays: number[]; until: string };
  repeat: boolean; weekdays: number[]; until: string;
  category_id: string; notes: string; scope: Scope;
  /** Set when the save met a newer version of this entry: the page says so and offers the latest. */
  conflict: boolean; error: string; busy: boolean;
}

/** A note open for writing, in the day rail or on the notes tab. Saved a moment after typing stops. */
/** `open`: a new note is being written (its editor shows before anything is typed). */
export interface NoteEditor { note: JellyNote | null; day: string | null; body: string; dirty: boolean; saving: boolean; conflict: boolean; timer: number; open?: boolean }

export interface JellyState {
  tab: "calendar" | "notes"; mode: "month" | "week" | "list";
  /** The day the period is drawn around and the day the rail shows. */
  anchor: string; selected: string;
  categories: JellyCategory[]; occurrences: JellyOccurrence[]; loaded: { start: string; end: string } | null;
  filter: Set<string>; query: string;
  load: "loading" | "ready" | "failed"; error: string;
  draft: Draft | null;
  /** The rail's note for the selected day and the notes tab's open note. */
  dayNote: NoteEditor; note: NoteEditor;
  notes: NoteSummary[]; noteQuery: string; noteRead: boolean;
  categoriesOpen: boolean;
  /** Words the page says where the asked-for item would have been (a gone entry or note), until the next click. */
  /** Words that stay at the top until the next click: a text key of Jelly's, or what the platform said about a refused read. */
  notice: { key: string } | { text: string } | null;
}
