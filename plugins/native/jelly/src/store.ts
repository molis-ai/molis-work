import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseTransaction, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { JellyCategory, JellyItem, JellyNote, JellySeries } from "./contract.js";
import { JELLY_UNCATEGORIZED_ID, jellyDate, validateJellyEntry, validateJellySeries, type JellyCategoryIds } from "./calendar.js";
import { jellyAssert, jellyErrors } from "./error.js";
import { JELLY_DATABASE } from "./database.js";
import { removeJellyOverview, removeJellySeriesOverview, writeJellyOverview, writeJellySeriesOverview } from "./overview.js";
export { JELLY_DATABASE };

/** The one category every calendar has. It is a row only once someone changes its colour; until then it is this. */
export const JELLY_UNCATEGORIZED: JellyCategory = { id: JELLY_UNCATEGORIZED_ID, name: "未分类", color: "#8E8E93", sort_index: 0, revision: 0 };
export const JELLY_TABLES = { category: "jelly_categories", item: "jelly_items", series: "jelly_series", note: "jelly_notes" } as const;
export type JellyRowKind = keyof typeof JELLY_TABLES;
export interface JellyRows { category: JellyCategory; item: JellyItem; series: JellySeries; note: JellyNote }
const COLUMNS = {
  category: ["id", "name", "color", "sort_index", "revision"],
  item: ["id", "title", "kind", "category_id", "start_date", "end_date", "start_time", "end_time", "time_zone", "reminder_minutes", "notes", "completed_at", "revision", "created_at", "updated_at"],
  series: ["id", "title", "kind", "category_id", "start_date", "end_date", "start_time", "end_time", "time_zone", "reminder_minutes", "notes", "weekdays", "until", "exceptions", "completions", "revision", "created_at", "updated_at"],
  note: ["id", "title", "body", "day", "revision", "created_at", "updated_at"],
} as const satisfies Record<JellyRowKind, readonly string[]>;
const JSON_COLUMNS = new Set(["weekdays", "exceptions", "completions"]);

/** Every column of `kind` was read: the row is that kind's shape (its values are checked where they are used). */
function hasColumns<K extends JellyRowKind>(kind: K, record: Record<string, unknown>): record is Record<string, unknown> & JellyRows[K] {
  return COLUMNS[kind].every(column => column in record);
}
/** A row as stored: the series' rule fields are JSON text. */
export function jellyRowColumns(kind: JellyRowKind): readonly string[] { return COLUMNS[kind]; }
export function encodeJellyRow<K extends JellyRowKind>(kind: K, row: JellyRows[K]): (string | number | null)[] {
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(row));
  return COLUMNS[kind].map(column => { const value = record[column] ?? null; return JSON_COLUMNS.has(column) ? JSON.stringify(value) : value as string | number | null; });
}
export function decodeJellyRow<K extends JellyRowKind>(kind: K, row: PluginSqlRow): JellyRows[K] {
  let record: Record<string, unknown>;
  try { record = Object.fromEntries(COLUMNS[kind].map(column => [column, JSON_COLUMNS.has(column) ? JSON.parse(String(row[column])) : row[column] ?? null])); }
  catch { throw jellyErrors.corrupt("Jelly 有一条记录无法读取，原记录已保留"); }
  if (!hasColumns(kind, record)) throw jellyErrors.corrupt("Jelly 有一条记录无法读取，原记录已保留");
  return record;
}
/** The shape every row of `kind` must have. `categories` checks an entry's category; sync passes none, since a category may arrive after its entries. */
export function validateJellyRow<K extends JellyRowKind>(kind: K, row: JellyRows[K], categories?: JellyCategoryIds): void {
  const anyCategory: JellyCategoryIds = { has: () => true };
  if (kind === "item") validateJellyEntry(row as JellyItem, categories ?? anyCategory);
  else if (kind === "series") validateJellySeries(row as JellySeries, categories ?? anyCategory);
  else if (kind === "category") {
    const category = row as JellyCategory;
    jellyAssert(typeof category.id === "string" && category.id.length > 0 && category.id.length <= 200, "分类 ID 无效");
    jellyAssert(typeof category.name === "string" && category.name.trim().length > 0 && category.name.length <= 100, "分类名不能为空，也不能超过 100 字");
    jellyAssert(/^#[\da-fA-F]{6}$/.test(category.color) && Number.isSafeInteger(category.sort_index) && Number.isSafeInteger(category.revision) && category.revision >= 0, "分类颜色或排序无效");
  } else {
    const note = row as JellyNote;
    jellyAssert(typeof note.id === "string" && note.id.length > 0 && note.id.length <= 200, "随手记 ID 无效");
    jellyAssert(typeof note.title === "string" && note.title.length <= 500 && typeof note.body === "string" && note.body.length <= 200_000, "随手记标题或正文过长");
    if (note.day !== null) jellyDate(note.day);
    jellyAssert(Number.isSafeInteger(note.revision) && note.revision >= 1 && Number.isFinite(Date.parse(note.created_at)) && Number.isFinite(Date.parse(note.updated_at)), "随手记版本或时间无效");
  }
}

export interface JellyStores {
  read<T>(run: (store: JellyStore) => T): T;
  /** One transaction per command: every row it changes is written together, or none is. */
  write<T>(caller: ActionExecutionContext, run: (store: JellyStore) => T): Promise<T>;
}

/** Reads and writes rows. A write names the revision it was made on; a row that moved on since is a conflict for that row alone. */
export class JellyStore {
  constructor(private readonly db: PluginDatabaseTransaction) {}
  private one<K extends JellyRowKind>(kind: K, sql: string, parameters: readonly unknown[] = []): JellyRows[K] | null {
    const row = this.db.get(sql, parameters as never);
    return row ? decodeJellyRow(kind, row) : null;
  }
  private many<K extends JellyRowKind>(kind: K, sql: string, parameters: readonly unknown[] = []): JellyRows[K][] {
    return this.db.all(sql, parameters as never).map(row => decodeJellyRow(kind, row));
  }
  get<K extends JellyRowKind>(kind: K, id: string): JellyRows[K] | null {
    if (kind === "category" && id === JELLY_UNCATEGORIZED_ID) return (this.one("category", `SELECT * FROM jelly_categories WHERE id = ?`, [id]) ?? JELLY_UNCATEGORIZED) as JellyRows[K];
    return this.one(kind, `SELECT * FROM ${JELLY_TABLES[kind]} WHERE id = ?`, [id]);
  }
  require<K extends JellyRowKind>(kind: K, id: string, label: string): JellyRows[K] {
    const row = this.get(kind, id);
    jellyAssert(row, `${label}不存在`, jellyErrors.not_found);
    return row;
  }
  categories(): JellyCategory[] {
    const rows = this.many("category", "SELECT * FROM jelly_categories ORDER BY sort_index, id");
    return rows.some(row => row.id === JELLY_UNCATEGORIZED_ID) ? rows : [JELLY_UNCATEGORIZED, ...rows];
  }
  categoryIds(): Set<string> { return new Set(this.categories().map(category => category.id)); }
  /** One-off entries that touch `start`..`end`. */
  items(start: string, end: string): JellyItem[] {
    return this.many("item", "SELECT * FROM jelly_items WHERE start_date <= ? AND end_date >= ? ORDER BY start_date, id", [end, start]);
  }
  /**
   * Every series: one may touch any range, since a single date can be moved anywhere and an occurrence can be long. `jellyOccurrences`
   * then walks only the asked range.
   */
  series(): JellySeries[] {
    return this.many("series", "SELECT * FROM jelly_series ORDER BY start_date, id");
  }
  itemsInCategory(id: string): JellyItem[] { return this.many("item", "SELECT * FROM jelly_items WHERE category_id = ?", [id]); }
  seriesInCategory(id: string): JellySeries[] {
    return this.many("series", "SELECT * FROM jelly_series WHERE category_id = ? OR exceptions LIKE ?", [id, `%${JSON.stringify(id)}%`]);
  }
  noteDays(start: string, end: string): string[] {
    return this.db.all("SELECT DISTINCT day FROM jelly_notes WHERE day BETWEEN ? AND ? ORDER BY day", [start, end]).map(row => String(row.day));
  }
  /** Notes, newest first; `day` keeps one day's, `query` those whose title or text holds it. */
  notes(filter: { day?: string | null; query?: string; limit?: number } = {}): JellyNote[] {
    const where: string[] = [], parameters: unknown[] = [];
    if (filter.day !== undefined) { where.push(filter.day === null ? "day IS NULL" : "day = ?"); if (filter.day !== null) parameters.push(filter.day); }
    if (filter.query?.trim()) { where.push("(instr(lower(title), ?) > 0 OR instr(lower(body), ?) > 0)"); const needle = filter.query.trim().toLowerCase(); parameters.push(needle, needle); }
    return this.many("note", `SELECT * FROM jelly_notes${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY updated_at DESC, id LIMIT ?`, [...parameters, filter.limit ?? 500]);
  }
  /** Every one-off entry and series; for search, which reads the whole calendar. */
  everyEntry(): { items: JellyItem[]; series: JellySeries[] } {
    return { items: this.many("item", "SELECT * FROM jelly_items ORDER BY updated_at DESC LIMIT 2000"), series: this.many("series", "SELECT * FROM jelly_series ORDER BY updated_at DESC LIMIT 500") };
  }

  insert<K extends JellyRowKind>(kind: K, row: JellyRows[K]): JellyRows[K] {
    validateJellyRow(kind, row, kind === "item" || kind === "series" ? this.categoryIds() : undefined);
    jellyAssert(!this.db.get(`SELECT 1 FROM ${JELLY_TABLES[kind]} WHERE id = ?`, [row.id]), "这个 ID 已经有一条记录");
    const columns = COLUMNS[kind];
    this.db.run(`INSERT INTO ${JELLY_TABLES[kind]} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, encodeJellyRow(kind, row));
    this.overview(kind, row);
    return row;
  }
  /** Every write of an entry also writes its overview row, in the same transaction (`overview.ts`). */
  private overview<K extends JellyRowKind>(kind: K, row: JellyRows[K]): void {
    if (kind === "item") writeJellyOverview(this.db, row as JellyItem);
    if (kind === "series") writeJellySeriesOverview(this.db, row as JellySeries);
  }
  /** Writes `row` over the stored one only if that is still at `expected`; `row.revision` is the new revision. */
  replace<K extends JellyRowKind>(kind: K, row: JellyRows[K], expected: number): JellyRows[K] {
    validateJellyRow(kind, row, this.keptCategories(kind, row.id));
    if (kind === "category" && row.id === JELLY_UNCATEGORIZED_ID && expected === 0 && !this.db.get("SELECT 1 FROM jelly_categories WHERE id = ?", [row.id])) return this.insert(kind, row);
    const columns = COLUMNS[kind].filter(column => column !== "id");
    const changed = this.db.run(`UPDATE ${JELLY_TABLES[kind]} SET ${columns.map(column => `${column} = ?`).join(", ")} WHERE id = ? AND revision = ?`,
      [...encodeJellyRow(kind, row).slice(1), row.id, expected]);
    if (changed.changes !== 1) this.conflict(kind, row.id);
    this.overview(kind, row);
    return row;
  }
  /**
   * The categories a changed entry may name: those that exist, and any its stored row already names. A row that arrived by sync before its
   * category, or whose category was deleted meanwhile, can still be edited or ticked without first picking a new one.
   */
  private keptCategories(kind: JellyRowKind, id: string): JellyCategoryIds | undefined {
    if (kind !== "item" && kind !== "series") return undefined;
    const ids = this.categoryIds(), stored = kind === "item" ? this.get("item", id) : this.get("series", id);
    if (stored) ids.add(stored.category_id);
    if (stored && "exceptions" in stored) for (const exception of Object.values(stored.exceptions)) if (exception.patch?.category_id) ids.add(exception.patch.category_id);
    return ids;
  }
  delete(kind: JellyRowKind, id: string, expected: number): void {
    const changed = this.db.run(`DELETE FROM ${JELLY_TABLES[kind]} WHERE id = ? AND revision = ?`, [id, expected]);
    if (changed.changes !== 1) this.conflict(kind, id);
    if (kind === "item") removeJellyOverview(this.db, id);
    if (kind === "series") removeJellySeriesOverview(this.db, id);
  }
  /** The row is gone or moved on: say which, and its revision now, so the page can reload that one row. */
  conflict(kind: JellyRowKind, id: string): never {
    const current = this.db.get(`SELECT revision FROM ${JELLY_TABLES[kind]} WHERE id = ?`, [id]);
    if (!current) throw jellyErrors.not_found("这一条已经不在了，可能在别处删除了");
    throw jellyErrors.conflict("这一条在别处改过，请重新载入这一条后再改", { id, revision: Number(current.revision) });
  }
}
