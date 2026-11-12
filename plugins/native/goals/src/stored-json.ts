import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

/** The one raiser of `goals.storage.record_unreadable`, shared by the project's Module and Governance reads and the Home's. */
export const storedRecordErrors = defineErrorCodes("goals.storage", { record_unreadable: "internal" });

/**
 * Every read that decodes stored JSON projects the table's own SQLite rowid under this name (`SELECT *, rowid AS stored_row`, or
 * `t.rowid AS stored_row` in a join), so a broken cell can be pointed at without naming its business key.
 */
export const STORED_ROW = "stored_row";

export type StoredRow = Readonly<Record<string, unknown>>;

const unreadableMessage = "Goals 存的一条记录读不出来（JSON 已损坏），读取已停止，没有按空值处理";

/**
 * Decodes `row[column]` of `table`. SQL NULL is `fallback`; text that is not JSON raises `goals.storage.record_unreadable` with
 * `details.storage = { table, column, row_ref }` and nothing else: no stored text, parser message, business key or path (BL-821).
 * `row_ref` is the rowid in decimal, good for this database as it is now, not across a rebuild. A row read without the projection
 * is a mistake in the read, refused even when the cell is fine, so a missing projection shows on the first read rather than the first
 * broken row.
 */
export function storedJson<T>(row: StoredRow, table: string, column: string, fallback: T): T {
  const ref = row[STORED_ROW];
  if (typeof ref !== "number" && typeof ref !== "bigint") throw new TypeError(`读 ${table}.${column} 的语句没有带 rowid AS ${STORED_ROW}`);
  const value = row[column];
  if (value == null) return fallback;
  if (typeof value === "string" && value.length > 0) {
    try { return JSON.parse(value) as T; } catch {
      // Not JSON: reported below, without the parser's message (it quotes the text).
    }
  }
  throw storedRecordErrors.record_unreadable(unreadableMessage, { storage: { table, column, row_ref: String(ref) } });
}
