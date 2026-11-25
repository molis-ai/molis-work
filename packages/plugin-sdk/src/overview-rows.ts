import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OVERVIEW_EVENT_WINDOW_DAYS, OVERVIEW_KINDS, OVERVIEW_NOTIFICATION_LEVELS, OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, OVERVIEW_TASK_STATUSES, OVERVIEW_TEXT_LIMITS,
  type OverviewKind, type OverviewRowByKind, type PluginDatabaseTransaction, type PluginSqlValue,
} from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Keeps the platform's overview table (`OVERVIEW_TABLE_SQL`, which the plugin writes into its partition library schema) in the same
 * transaction as the business write it sums up (specs/unified-partition-plugins §6.1). Every row is checked against the kind's format
 * before it is written, and a kind may hold at most {@link OVERVIEW_ROW_LIMIT} rows; a write past it is refused, so the plugin decides what
 * to drop. The platform reads the table read-only and stamps partition and installation itself, so nothing here names either.
 *
 * ```ts
 * await services.database.transaction(tx => {
 *   tx.run("UPDATE todos SET done = 1 WHERE id = ?", [id]);
 *   overviewRows(tx).upsert("task", { row_id: id, title, status: "done", updated_at: now });
 * });
 * ```
 */
export function overviewRows(tx: PluginDatabaseTransaction) {
  return {
    upsert<K extends OverviewKind>(kind: K, row: OverviewRowByKind[K]): void {
      const values = overviewColumns(kind, row);
      const exists = tx.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = ? AND row_id = ?`, [kind, row.row_id]);
      if (!exists) {
        const count = Number((tx.get(`SELECT count(*) AS total FROM ${OVERVIEW_TABLE} WHERE kind = ?`, [kind]) as { total: number }).total);
        if (count >= OVERVIEW_ROW_LIMIT) throw overviewInvalid(`总览表的 ${kind} 至多 ${OVERVIEW_ROW_LIMIT} 行，先删掉不再需要的行`);
      }
      const columns = Object.keys(values);
      tx.run(`INSERT INTO ${OVERVIEW_TABLE} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})
        ON CONFLICT (kind, row_id) DO UPDATE SET ${columns.filter(column => column !== "kind" && column !== "row_id").map(column => `${column} = excluded.${column}`).join(", ")}`,
      Object.values(values));
    },
    remove(kind: OverviewKind, rowId: string): void {
      assertKind(kind);
      tx.run(`DELETE FROM ${OVERVIEW_TABLE} WHERE kind = ? AND row_id = ?`, [kind, rowId]);
    },
    /** Removes every row of a kind whose id starts with `prefix`: the occurrences of one recurring event before they are laid out again. */
    removePrefix(kind: OverviewKind, prefix: string): void {
      assertKind(kind);
      if (!prefix) throw overviewInvalid("前缀不能为空");
      tx.run(`DELETE FROM ${OVERVIEW_TABLE} WHERE kind = ? AND substr(row_id, 1, ?) = ?`, [kind, prefix.length, prefix]);
    },
  };
}

/** Where a recurring event's laid-out occurrences end, counted from `now`: occurrences past it are not written yet. */
export function overviewEventWindowEnd(now: Date): Date {
  return new Date(now.getTime() + OVERVIEW_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function overviewInvalid(message: string): ActionError {
  return new ActionError("actions.input_invalid", message);
}
function assertKind(kind: unknown): asserts kind is OverviewKind {
  if (!(OVERVIEW_KINDS as readonly unknown[]).includes(kind)) throw overviewInvalid(`${String(kind)} 不是平台的总览种类`);
}
const text = (value: unknown, limit: number, field: string, required = false): string | null => {
  if (value === undefined || value === null) {
    if (required) throw overviewInvalid(`总览行缺少 ${field}`);
    return null;
  }
  if (typeof value !== "string" || value.length === 0 || value.length > limit) throw overviewInvalid(`总览行的 ${field} 要是 1 到 ${limit} 字的文字`);
  return value;
};
const instant = (value: unknown, field: string, required = false): string | null => {
  if ((value === undefined || value === null) && !required) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || Number.isNaN(Date.parse(value))) {
    throw overviewInvalid(`总览行的 ${field} 要是带时区的时刻（ISO 8601）`);
  }
  return value;
};

/** The columns of one row, checked against its kind's format; a field the kind does not use is not written. */
export function overviewColumns<K extends OverviewKind>(kind: K, row: OverviewRowByKind[K]): Record<string, PluginSqlValue> {
  assertKind(kind);
  const base: Record<string, PluginSqlValue> = {
    kind, row_id: text(row.row_id, OVERVIEW_TEXT_LIMITS.row_id, "row_id", true), title: text(row.title, OVERVIEW_TEXT_LIMITS.title, "title", true),
    updated_at: instant(row.updated_at, "updated_at", true),
  };
  // Read as plain fields: a plugin written in JavaScript may hand over anything, and every value is checked below.
  const fields: Readonly<Record<string, unknown>> = { ...row };
  if (kind === "task") {
    if (!(OVERVIEW_TASK_STATUSES as readonly unknown[]).includes(fields.status)) throw overviewInvalid("待办的 status 只能是 open、done 或 cancelled");
    const priority = fields.priority ?? null;
    if (priority !== null && !(Number.isInteger(priority) && (priority as number) >= 0 && (priority as number) <= 3)) throw overviewInvalid("待办的 priority 是 0 到 3");
    const tags = fields.tags ?? [];
    if (!Array.isArray(tags) || tags.length > OVERVIEW_TEXT_LIMITS.tags || tags.some(tag => typeof tag !== "string" || !tag || tag.length > OVERVIEW_TEXT_LIMITS.tag)) {
      throw overviewInvalid(`待办的 tags 至多 ${OVERVIEW_TEXT_LIMITS.tags} 个，每个 1 到 ${OVERVIEW_TEXT_LIMITS.tag} 字`);
    }
    return { ...base, status: fields.status as string, due_at: instant(fields.due_at, "due_at"), remind_at: instant(fields.remind_at, "remind_at"),
      priority: priority as number | null, tags_json: tags.length ? JSON.stringify(tags) : null };
  }
  if (kind === "event") {
    const startsAt = instant(fields.starts_at, "starts_at", true)!, endsAt = instant(fields.ends_at, "ends_at");
    if (endsAt !== null && Date.parse(endsAt) < Date.parse(startsAt)) throw overviewInvalid("日程的 ends_at 不能早于 starts_at");
    if (fields.all_day !== undefined && typeof fields.all_day !== "boolean") throw overviewInvalid("日程的 all_day 只能是 true 或 false");
    return { ...base, starts_at: startsAt, ends_at: endsAt, all_day: fields.all_day === undefined ? null : fields.all_day ? 1 : 0,
      time_zone: text(fields.time_zone, 64, "time_zone"), remind_at: instant(fields.remind_at, "remind_at") };
  }
  if (kind === "notification") {
    if (!(OVERVIEW_NOTIFICATION_LEVELS as readonly unknown[]).includes(fields.level)) throw overviewInvalid("通知的 level 只能是 info、warning 或 urgent");
    return { ...base, level: fields.level as string, source: text(fields.source, OVERVIEW_TEXT_LIMITS.source, "source"), occurred_at: instant(fields.occurred_at, "occurred_at", true) };
  }
  return { ...base, summary: text(fields.summary, OVERVIEW_TEXT_LIMITS.summary, "summary") };
}
