/** Jelly's personal calendar and notes, one row per entry. Calendar days are YYYY-MM-DD civil dates; times are minutes after midnight. */
export const JELLY_PLUGIN_ID = "io.molis.work.jelly";
export const JELLY_PROJECT_PLUGIN_ID = "jelly";
export interface JellyCategory { id: string; name: string; color: string; sort_index: number; revision: number }
/** An all-day entry has no times. `time_zone` is where its times were meant (an IANA name). */
export interface JellySchedule { start_date: string; end_date: string; start_time: number | null; end_time: number | null; time_zone: string; reminder_minutes?: number | null }
/** One calendar entry. Every write bumps `revision`; a change names the revision it was made on, so two edits of one entry never overwrite each other silently. */
export interface JellyItem extends JellySchedule {
  id: string; title: string; kind: "task" | "event"; category_id: string; notes: string;
  completed_at: string | null; revision: number; created_at: string; updated_at: string;
}
/** What one occurrence of a series may change: everything but its identity and its repeat rule. */
export type JellyOccurrencePatch = Partial<Pick<JellyItem, "title" | "kind" | "category_id" | "notes" | "start_date" | "end_date" | "start_time" | "end_time" | "reminder_minutes">>;
/** A weekly repeating entry. Weekdays are 1 (Monday) to 7; `exceptions` and `completions` are keyed by an occurrence's original date. */
export interface JellySeries extends Omit<JellyItem, "completed_at"> {
  weekdays: number[]; until: string | null;
  exceptions: Record<string, { deleted?: true; patch?: JellyOccurrencePatch }>;
  completions: Record<string, string>;
}
/** One day's entry as the calendar shows it: a one-off item, or a series' occurrence (`series_id` and `original_date` set). */
export interface JellyOccurrence extends JellyItem { series_id: string | null; original_date: string | null }
/** A plain-text or Markdown note, kept for a day or on its own. */
export interface JellyNote { id: string; title: string; body: string; day: string | null; revision: number; created_at: string; updated_at: string }
