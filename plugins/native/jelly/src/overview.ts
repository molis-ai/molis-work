import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, type OverviewEventRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { instantIn, overviewRows, type OverviewRowsWriter } from "@molis-ai/molis-work-plugin-sdk";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import type { JellyItem } from "./contract.js";

/**
 * Jelly's rows in the platform's overview table (specs/unified-partition-plugins §6.1, batch 108): one `event` row per one-off calendar
 * entry still open, written in the same transaction as the entry. Jelly moved as it is (user 2026-11-26): its calendar has no reminder time,
 * so no row carries one and nothing falls due; repeating series are not laid out here. A done or deleted entry has no row.
 *
 * A kind holds at most {@link OVERVIEW_ROW_LIMIT} rows. When a new entry would pass it, the row that starts last makes room if the new entry
 * starts sooner; otherwise the new entry is left out of the overview (its page still has it).
 */
export function jellyOverviewRow(item: JellyItem): OverviewEventRow | null {
  if (item.completed_at !== null) return null;
  return { row_id: item.id, title: cutCharacters(item.title.trim() || item.id, 500), updated_at: item.updated_at,
    starts_at: instant(item.start_date, item.start_time ?? 0, item.time_zone), ends_at: instant(item.end_date, item.end_time ?? 1439, item.time_zone),
    all_day: item.start_time === null, time_zone: item.time_zone || null, remind_at: null };
}

/** A day and a minute of it in the entry's zone, as an instant; a time the zone's clock skips is read as the process's local time. */
function instant(date: string, minute: number, zone: string): string {
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return instantIn(date, time, zone || undefined) ?? new Date(`${date}T${time}:00`).toISOString();
}

/** Writes (or removes) the overview row of `item` in the transaction `db` belongs to. */
export function writeJellyOverview(db: OverviewRowsWriter, item: JellyItem): void {
  const rows = overviewRows(db), row = jellyOverviewRow(item);
  if (row === null) {
    rows.remove("event", item.id);
    return;
  }
  if (!db.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = 'event' AND row_id = ?`, [item.id])
    && Number((db.get(`SELECT count(*) AS total FROM ${OVERVIEW_TABLE} WHERE kind = 'event'`) as { total: number }).total) >= OVERVIEW_ROW_LIMIT) {
    const last = db.get(`SELECT row_id, starts_at FROM ${OVERVIEW_TABLE} WHERE kind = 'event' ORDER BY starts_at DESC, row_id DESC LIMIT 1`) as { row_id: string; starts_at: string } | undefined;
    if (!last || last.starts_at <= row.starts_at) return;
    rows.remove("event", last.row_id);
  }
  rows.upsert("event", row);
}

export function removeJellyOverview(db: OverviewRowsWriter, id: string): void {
  overviewRows(db).remove("event", id);
}
