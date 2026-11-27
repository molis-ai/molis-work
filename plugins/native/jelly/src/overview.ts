import { createHash } from "node:crypto";
import { jellyAddDays, jellyOccurrences } from "./calendar.js";
import { OVERVIEW_EVENT_WINDOW_DAYS, OVERVIEW_REFRESH_ENTRY_KEY, OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, type OverviewEventRow, type PluginDueClient, type PluginDueOutcome } from "@molis-ai/molis-work-contracts/platform/plugin";
import { instantIn, overviewRows, type OverviewRowsWriter } from "@molis-ai/molis-work-plugin-sdk";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { JELLY_PROJECT_PLUGIN_ID, type JellyItem, type JellySeries } from "./contract.js";

/** Shorten only keys whose native id and delivery prefix together exceed the platform limit. User ids cannot contain @. */
function overviewId(id: string): string {
  return id.length <= 175 ? id : "@" + createHash("sha256").update(id).digest("hex");
}
const seriesPrefix = (id: string) => overviewId(id) + "@";

export function jellyOverviewRow(item: JellyItem, rowId = overviewId(item.id)): OverviewEventRow | null {
  if (item.completed_at !== null) return null;
  const starts_at = instant(item.start_date, item.start_time ?? 0, item.time_zone);
  return { row_id: rowId, title: cutCharacters(item.title.trim() || item.id, 500), updated_at: item.updated_at,
    starts_at, ends_at: instant(item.end_date, item.end_time ?? 1439, item.time_zone),
    all_day: item.start_time === null, time_zone: item.time_zone || null, remind_at: item.reminder_minutes == null ? null : new Date(Date.parse(starts_at) - item.reminder_minutes * 60_000).toISOString() };
}

/** A day and a minute of it in the entry's zone, as an instant; a time the zone's clock skips is read as the process's local time. */
function instant(date: string, minute: number, zone: string): string {
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return instantIn(date, time, zone || undefined) ?? new Date(`${date}T${time}:00`).toISOString();
}

/** Writes (or removes) the overview row of `item` in the transaction `db` belongs to. */
export function writeJellyOverview(db: OverviewRowsWriter, item: JellyItem, id = overviewId(item.id)): void {
  const rows = overviewRows(db), row = jellyOverviewRow(item, id);
  if (row === null) {
    rows.remove("event", id);
    return;
  }
  if (!db.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = 'event' AND row_id = ?`, [id])
    && Number((db.get(`SELECT count(*) AS total FROM ${OVERVIEW_TABLE} WHERE kind = 'event'`) as { total: number }).total) >= OVERVIEW_ROW_LIMIT) {
    // Keep ongoing and upcoming events first, nearest first. When the library is full an old one-off cannot displace them.
    const now = new Date().toISOString();
    const last = db.get(`SELECT row_id FROM (
      SELECT row_id, starts_at, ends_at FROM ${OVERVIEW_TABLE} WHERE kind = 'event'
      UNION ALL SELECT ?, ?, ?
    ) ORDER BY (ends_at >= ?) ASC, CASE WHEN ends_at >= ? THEN starts_at END DESC, starts_at ASC, row_id DESC LIMIT 1`,
      [id, row.starts_at, row.ends_at ?? row.starts_at, now, now]) as { row_id: string };
    if (last.row_id === id) return;
    rows.remove("event", last.row_id);
  }
  rows.upsert("event", row);
}

export function removeJellyOverview(db: OverviewRowsWriter, id: string): void {
  overviewRows(db).remove("event", overviewId(id));
}

/** A series rolls with civil time. At capacity, tomorrow may also bring a previously omitted one-off into view. */
export function jellyWindowNeeded(database: Pick<OverviewRowsWriter, "get">, today: string): boolean {
  return Boolean(database.get("SELECT 1 FROM jelly_series WHERE until IS NULL OR until >= ? LIMIT 1", [today])
    || database.get(`SELECT 1 FROM jelly_items WHERE completed_at IS NULL AND end_date >= ?
      AND (SELECT count(*) FROM ${OVERVIEW_TABLE} WHERE kind = 'event') >= ? LIMIT 1`, [today, OVERVIEW_ROW_LIMIT]));
}
/** Re-arm on committed calendar writes, including a first series received while the partition sleeps. Keep overdue work until its delivery. */
export function armJellyWindow(database: Pick<OverviewRowsWriter, "get">, due: PluginDueClient | undefined, advancing = false): void {
  if (!due) return;
  const now = new Date(), today = now.toISOString().slice(0, 10);
  const pending = due.list().find(entry => entry.entry_key === OVERVIEW_REFRESH_ENTRY_KEY);
  if (!jellyWindowNeeded(database, today)) {
    if (pending) due.cancel(OVERVIEW_REFRESH_ENTRY_KEY);
    return;
  }
  if (pending && !advancing) return;
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  due.register({ entry_key: OVERVIEW_REFRESH_ENTRY_KEY, due_at: next.toISOString() });
}

export function removeJellySeriesOverview(db: OverviewRowsWriter, id: string): void {
  overviewRows(db).removePrefix("event", seriesPrefix(id));
}

/** Expand in civil dates; the calendar owner already handles deleted, moved, completed and multi-day occurrences. */
export function writeJellySeriesOverview(db: OverviewRowsWriter, series: JellySeries, now = new Date()): void {
  const localDay = new Intl.DateTimeFormat(undefined, { calendar: "iso8601", numberingSystem: "latn", timeZone: series.time_zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(localDay.formatToParts(now).map(part => [part.type, part.value]));
  const start = [parts.year, parts.month, parts.day].join("-");
  const prefix = seriesPrefix(series.id);
  // Keep already-projected occurrences within the platform's missed-reminder period during rollover and a retry after midnight.
  const occurrences = jellyOccurrences([], [series], jellyAddDays(start, -7), jellyAddDays(start, OVERVIEW_EVENT_WINDOW_DAYS - 1))
    .filter(item => item.end_date >= start || db.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = 'event' AND row_id = ?`, [prefix + item.original_date]));
  removeJellySeriesOverview(db, series.id);
  for (const item of occurrences) writeJellyOverview(db, item, prefix + item.original_date);
}

export function jellyDue(db: OverviewRowsWriter, key: string, dueAt: string): PluginDueOutcome {
  if (!key.startsWith("event:")) return { reminder: null };
  const id = key.slice(6);
  const row = db.get(`SELECT title, remind_at FROM ${OVERVIEW_TABLE} WHERE kind = 'event' AND row_id = ?`, [id]) as { title: string; remind_at: string | null } | undefined;
  if (typeof row?.title !== "string" || Date.parse(String(row.remind_at)) !== Date.parse(dueAt)) return { reminder: null };
  return { reminder: { title: cutCharacters(row.title, 300), ...(id.startsWith("@") ? {} : { open: { surface: JELLY_PROJECT_PLUGIN_ID, id } }) } };
}
