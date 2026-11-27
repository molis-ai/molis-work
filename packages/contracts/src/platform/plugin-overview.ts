import type { TextRef } from "./ui-text.js";
import type { StateRingState } from "./ui-state-rings.js";
import type { PluginDatabaseTransaction } from "./plugin-database.js";

/**
 * The platform's overview table (specs/unified-partition-plugins §6.1, U4/V11, batch 106): a table of a format the platform fixes, which a
 * plugin keeps in its own partition library and updates in the same transaction as the business write it sums up (the SDK's
 * `overviewRows`). The platform reads it on a read-only connection, never by running the plugin, stamps each row with the partition and
 * installation it read it from, and keeps the result in the Home's rebuildable overview index (`horizontal/search`). Its reminder column
 * feeds the due registry (`horizontal/scheduler`), so a reminder synced from another device rings too. The Manifest only names the kinds.
 */
export const OVERVIEW_KINDS = ["task", "event", "notification", "brief", "background_task", "scheduled_run"] as const;
export type OverviewKind = (typeof OVERVIEW_KINDS)[number];

/** The table's name in a partition library; one table holds every kind the plugin declares. */
export const OVERVIEW_TABLE = "molis_overview_rows";
/**
 * The platform's own table in each partition's main database (`molis-work.db`), for the plugins that keep their data there (U3; V17, batch
 * 108): the same columns plus the writing installation, which the platform stamps from the instance's trusted identity
 * (`services.overview.join`). A plugin never names it and reaches only its own rows.
 */
export const OVERVIEW_MAIN_TABLE = "plugin_overview_rows";
/** The most rows one installation keeps of one kind in one partition; a recurring event counts each occurrence in the window. */
export const OVERVIEW_ROW_LIMIT = 500;
/** How far ahead a recurring event is laid out as occurrences; the plugin rolls the window forward before it ends. */
export const OVERVIEW_EVENT_WINDOW_DAYS = 90;
/** The longest title, summary and source, in UTF-16 code units. */
export const OVERVIEW_TEXT_LIMITS = Object.freeze({ title: 500, summary: 2_000, source: 200, row_id: 200, tag: 64, tags: 16 });

export const OVERVIEW_TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type OverviewTaskStatus = (typeof OVERVIEW_TASK_STATUSES)[number];
export const OVERVIEW_NOTIFICATION_LEVELS = ["info", "warning", "urgent"] as const;
export type OverviewNotificationLevel = (typeof OVERVIEW_NOTIFICATION_LEVELS)[number];
/** What a scheduled run needs besides Molis Work running (the same words as `RunNeed`). */
export const OVERVIEW_RUN_NEEDS = ["network", "model"] as const;
export type OverviewRunNeed = (typeof OVERVIEW_RUN_NEEDS)[number];

const OVERVIEW_COLUMNS_SQL = `kind TEXT NOT NULL CHECK (kind IN ('task', 'event', 'notification', 'brief', 'background_task', 'scheduled_run')),
  row_id TEXT NOT NULL CHECK (length(row_id) BETWEEN 1 AND ${OVERVIEW_TEXT_LIMITS.row_id}),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND ${OVERVIEW_TEXT_LIMITS.title}),
  status TEXT CHECK (status IS NULL OR status IN ('open', 'done', 'cancelled')),
  due_at TEXT,
  remind_at TEXT,
  priority INTEGER CHECK (priority IS NULL OR priority BETWEEN 0 AND 3),
  tags_json TEXT,
  starts_at TEXT,
  ends_at TEXT,
  all_day INTEGER CHECK (all_day IS NULL OR all_day IN (0, 1)),
  time_zone TEXT,
  level TEXT CHECK (level IS NULL OR level IN ('info', 'warning', 'urgent')),
  source TEXT,
  occurred_at TEXT,
  summary TEXT,
  state TEXT,
  waiting INTEGER CHECK (waiting IS NULL OR waiting IN (0, 1)),
  started_at TEXT,
  reports_to TEXT CHECK (reports_to IS NULL OR reports_to = 'assistant'),
  missed_at TEXT,
  needs_json TEXT,
  open_surface TEXT,
  open_id TEXT,
  updated_at TEXT NOT NULL`;

/**
 * The table, written into the plugin's own partition library schema as it is. Its columns are the kinds' fields; a column a kind does
 * not use stays null. Times are ISO-8601 instants.
 */
export const OVERVIEW_TABLE_SQL = `CREATE TABLE ${OVERVIEW_TABLE} (
  ${OVERVIEW_COLUMNS_SQL},
  PRIMARY KEY (kind, row_id)
);
CREATE INDEX ${OVERVIEW_TABLE}_remind ON ${OVERVIEW_TABLE}(remind_at) WHERE remind_at IS NOT NULL;`;

/** The platform's table in each partition's main database: the same columns, kept apart by the writing installation the platform stamps. */
export const OVERVIEW_MAIN_TABLE_SQL = `CREATE TABLE ${OVERVIEW_MAIN_TABLE} (
  install_id TEXT NOT NULL CHECK (length(install_id) BETWEEN 1 AND 200),
  ${OVERVIEW_COLUMNS_SQL},
  PRIMARY KEY (install_id, kind, row_id)
);
CREATE INDEX ${OVERVIEW_MAIN_TABLE}_remind ON ${OVERVIEW_MAIN_TABLE}(remind_at) WHERE remind_at IS NOT NULL;`;

interface OverviewRowBase {
  /** The plugin's own id for the row, stable across writes: the object's id, or the object's id and the occurrence for an event. */
  readonly row_id: string;
  readonly title: string;
  readonly updated_at: string;
}
/** A to-do: title, state, due, reminder, priority (0 none to 3 high) and tags. */
export interface OverviewTaskRow extends OverviewRowBase {
  readonly status: OverviewTaskStatus;
  readonly due_at?: string | null;
  readonly remind_at?: string | null;
  readonly priority?: 0 | 1 | 2 | 3 | null;
  readonly tags?: readonly string[];
}
/** One occurrence of a calendar entry: start, end, whether it is all day, its time zone and its reminder. */
export interface OverviewEventRow extends OverviewRowBase {
  readonly starts_at: string;
  readonly ends_at?: string | null;
  readonly all_day?: boolean;
  readonly time_zone?: string | null;
  readonly remind_at?: string | null;
}
/** A notice: title, level, where it came from and when. */
export interface OverviewNotificationRow extends OverviewRowBase {
  readonly level: OverviewNotificationLevel;
  readonly source?: string | null;
  readonly occurred_at: string;
}
/** A brief: title and summary. */
export interface OverviewBriefRow extends OverviewRowBase {
  readonly summary?: string | null;
}
/** Where the person opens a row's object: the owner's surface and the object's id there. */
export interface OverviewOpen { readonly surface: string; readonly id: string }
/**
 * Work under way or waiting on the person (a background task, specs/work-line §6), as the overview keeps it: the state ring's value, whether
 * it waits on the person, and where it opens. Its step-by-step words, commands and questions are read in its partition when it is opened.
 */
export interface OverviewBackgroundTaskRow extends OverviewRowBase {
  readonly state: StateRingState;
  readonly waiting: boolean;
  readonly started_at?: string | null;
  /** It reports to the personal assistant once it is seen to end (`BackgroundTask.reports_to`). */
  readonly reports_to?: "assistant" | null;
  readonly open?: OverviewOpen | null;
}
/** A run its owner makes on its own at a set time (`ScheduledRun`): when it is due, when it was missed if it was, what it needs and where it opens. */
export interface OverviewScheduledRunRow extends OverviewRowBase {
  readonly due_at: string;
  readonly missed_at?: string | null;
  readonly needs?: readonly OverviewRunNeed[];
  readonly open?: OverviewOpen | null;
}
export interface OverviewRowByKind {
  task: OverviewTaskRow;
  event: OverviewEventRow;
  notification: OverviewNotificationRow;
  brief: OverviewBriefRow;
  background_task: OverviewBackgroundTaskRow;
  scheduled_run: OverviewScheduledRunRow;
}

/** `overview_projection` in the Manifest: which kinds the plugin keeps, and an optional static one-line label for the overview. No columns, no SQL. */
export interface PluginOverviewProjectionDeclaration {
  readonly kinds: readonly OverviewKind[];
  /** Optional static one-line label shown in the overview (checked with the same TextRef rules as other Manifest directory titles). */
  readonly title_text?: TextRef;
}

/** The fields a row of the overview index may show beyond its identity; a reader granted fewer gets only those (`overview-readers`). */
export const OVERVIEW_SUMMARY_FIELDS = ["title", "status", "due_at", "remind_at", "priority", "tags", "starts_at", "ends_at", "all_day", "time_zone",
  "level", "source", "occurred_at", "summary", "state", "waiting", "started_at", "reports_to", "missed_at", "needs", "open", "updated_at"] as const;
export type OverviewSummaryField = (typeof OVERVIEW_SUMMARY_FIELDS)[number];

/** A row of the Home's overview index: the partition and installation are the platform's stamp, never the plugin's own word. */
export interface OverviewIndexRow {
  readonly partition_id: string;
  readonly install_id: string;
  readonly plugin_id: string;
  readonly kind: OverviewKind;
  readonly row_id: string;
  readonly fields: Partial<Record<OverviewSummaryField, string | number | boolean | readonly string[] | OverviewOpen | null>>;
}

/** The rows one installation writes in a transaction: the same three changes as the SDK's `overviewRows`, each checked against its kind's format. */
export interface PluginOverviewRows {
  upsert<K extends OverviewKind>(kind: K, row: OverviewRowByKind[K]): void;
  remove(kind: OverviewKind, rowId: string): void;
  /** Removes every row of a kind whose id starts with `prefix` (a recurring event's occurrences, a run's past times). */
  removePrefix(kind: OverviewKind, prefix: string): void;
}

/**
 * `services.overview` (V17, batch 108): the overview rows of a plugin that keeps its data in the partition's main database (`databases.project`).
 * Given to a plugin whose Manifest declares `overview_projection`; the rows join the plugin's own transaction there, so they change with the
 * business write they sum up or not at all. The platform stamps the installation; a plugin reaches only its own rows and only its declared kinds.
 * A plugin with a library in each partition writes its own `molis_overview_rows` with `overviewRows` instead.
 */
export interface PluginOverviewClient {
  join<T>(transaction: PluginDatabaseTransaction, write: (rows: PluginOverviewRows) => T): T;
}

/** The platform's provider of the overview read (`overview.read@1`): the Host's own, not a plugin's. */
export const OVERVIEW_PROVIDER_ID = "system.overview";
/** The most rows one overview read hands over. */
export const OVERVIEW_READ_LIMIT = 2_000;

/** What `overview.read@1` answers: the rows the caller may see now, each with only the fields it may see. */
export interface OverviewReadResult {
  /** Granted sources are still being refreshed. Only current rows are included. */
  readonly updating?: boolean;
  readonly rows: readonly OverviewIndexRow[];
}

/**
 * `overview.read@1` (specs/unified-partition-plugins §6.1, `overview-readers`, batch 108): the partitions' overview index, read as its caller
 * may read it now. The person on this machine reads every partition; the personal assistant only the projects and summary fields the person
 * granted it in 设置 › 个人助理 (`assistant.overview_grants`), checked before the read and again before the answer is handed over. A project
 * Agent, an MCP client, a workflow, a plugin or a delegated call is refused. Reading it opens no dormant partition and runs no plugin.
 */
export const overviewReadAction = {
  capability_id: "overview.read", version: /* @version action.overview.read */ 1, operation: "query",
  action: {
    kind: "query", scope: "home", audiences: ["user", "agent"], permissions: [], subject_kinds: [],
    title: "读取跨项目总览",
    description: "读取各项目与个人空间的总览摘要：待办、日程、通知、简报、后台任务与定时运行。本人可读全部；个人助理只读本人授予的项目与字段。只给摘要，不给原文与附件。",
    input_schema: {
      type: "object", additionalProperties: false,
      properties: {
        kinds: { type: "array", maxItems: OVERVIEW_KINDS.length, uniqueItems: true, items: { type: "string", enum: [...OVERVIEW_KINDS] } },
        limit: { type: "integer", minimum: 1, maximum: OVERVIEW_READ_LIMIT },
      },
    },
    output_schema: {
      type: "object", additionalProperties: false, required: ["rows"],
      properties: {
        updating: { type: "boolean" },
        rows: { type: "array", maxItems: OVERVIEW_READ_LIMIT, items: {
          type: "object", additionalProperties: false, required: ["partition_id", "install_id", "plugin_id", "kind", "row_id", "fields"],
          properties: {
            partition_id: { type: "string" }, install_id: { type: "string" }, plugin_id: { type: "string" },
            kind: { type: "string", enum: [...OVERVIEW_KINDS] }, row_id: { type: "string" }, fields: { type: "object" },
          },
        } },
      },
    },
  },
} as import("./actions.js").ActionDefinition<{ kinds?: OverviewKind[]; limit?: number }, OverviewReadResult>;
