import { AttentionError } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { randomUUID } from "node:crypto";

import type {
  AttentionApi,
  AttentionEntryRecord,
  AttentionEvent,
  AttentionReason,
  AttentionStatus,
  AttentionSubjectResolver,
  AttentionSubjectType,
  CreateAttentionEntryInput,
  LegacyAttentionEntryInput,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-attention-resumption",
  packagePath: "modules/attention-resumption",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/attention-resumption",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["attention.query.v1", "attention.command.v1"],
} as const;

type Row = Record<string, unknown>;
type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
export interface AttentionSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export interface AttentionLegacyEvent {
  project_id: string;
  entry_id: string;
  type: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface AttentionModuleOptions {
  now?: () => Date;
  eventSink?: (event: AttentionLegacyEvent) => void;
}

export const ATTENTION_STATUS_TRANSITIONS: Readonly<
  Record<AttentionStatus, readonly AttentionStatus[]>
> = {
  open: ["in_progress", "done", "dismissed"],
  in_progress: ["open", "done", "dismissed"],
  done: ["open"],
  dismissed: ["open"],
};

export { AttentionError } from "@molis-ai/molis-work-contracts/modules/attention-resumption";

const INBOX_ENTRIES_COLUMNS = `
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault', 'artifact_out_failed')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (board_id, entry_id),
      UNIQUE (board_id, subject_type, subject_id, reason)
`;

function inboxEntriesTableSql(tableName: string, ifNotExists: boolean): string {
  return `CREATE TABLE ${ifNotExists ? "IF NOT EXISTS " : ""}${tableName} (${INBOX_ENTRIES_COLUMNS});`;
}

function inboxEntriesIndexesSql(): string {
  return `
    CREATE INDEX IF NOT EXISTS inbox_entries_board_status_idx
      ON inbox_entries(board_id, status, updated_at DESC, entry_id);
    CREATE INDEX IF NOT EXISTS inbox_entries_board_subject_idx
      ON inbox_entries(board_id, subject_type, subject_id);
  `;
}

export function migrateAttention(db: AttentionSqliteDatabase): void {
  db.exec(`
    ${inboxEntriesTableSql("inbox_entries", true)}
    ${inboxEntriesIndexesSql()}

    CREATE TABLE IF NOT EXISTS attention_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attention_events_project_entry_idx
      ON attention_events(project_id, entry_id, at, event_id);
  `);
  rebuildInboxEntriesReasonCheck(db);
}

function rebuildInboxEntriesReasonCheck(db: AttentionSqliteDatabase): void {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inbox_entries'",
  ).get() as { sql?: string } | undefined;
  if (!row?.sql || row.sql.includes("artifact_out_failed")) return;
  db.exec(`
    ${inboxEntriesTableSql("inbox_entries__reason_v2", false)}
    INSERT INTO inbox_entries__reason_v2 (
      board_id, entry_id, subject_type, subject_id, reason, status,
      detail_json, revision, created_at, updated_at, completed_at
    )
    SELECT
      board_id, entry_id, subject_type, subject_id, reason, status,
      detail_json, revision, created_at, updated_at, completed_at
    FROM inbox_entries;
    DROP TABLE inbox_entries;
    ALTER TABLE inbox_entries__reason_v2 RENAME TO inbox_entries;
    ${inboxEntriesIndexesSql()}
  `);
}

export class AttentionModule implements AttentionApi {
  readonly query = {
    list: (projectId: string) => this.list(projectId),
    get: (projectId: string, entryId: string) => this.get(projectId, entryId),
    findActiveForSubject: (
      projectId: string,
      subjectType: AttentionSubjectType,
      subjectId: string,
    ) => this.findActiveForSubject(projectId, subjectType, subjectId),
    findForSubject: (
      projectId: string,
      subjectType: AttentionSubjectType,
      subjectId: string,
    ) => this.findForSubject(projectId, subjectType, subjectId),
  };

  readonly commands = {
    create: (input: CreateAttentionEntryInput) => this.create(input),
    ensureFeedItem: (
      projectId: string,
      itemId: string,
      reason: Extract<AttentionReason, "manual" | "source_rule">,
      detail?: Record<string, unknown>,
    ) => this.create({
      project_id: projectId,
      subject_type: "feed_item",
      subject_id: itemId,
      reason,
      detail,
    }),
    setStatus: (
      projectId: string,
      entryId: string,
      status: AttentionStatus,
      expectedRevision?: number,
    ) => this.setStatus(projectId, entryId, status, expectedRevision),
    deleteSubject: (projectId: string, subjectType: AttentionSubjectType, subjectId: string) =>
      this.deleteSubject(projectId, subjectType, subjectId),
  };

  readonly events = {
    list: (projectId: string, entryId?: string) => this.listEvents(projectId, entryId),
  };

  readonly migrations = {
    countEntries: () => this.countEntries(),
    importLegacy: (entry: LegacyAttentionEntryInput) => this.importLegacy(entry),
    listFeedItemReferences: () => this.listFeedItemReferences(),
  };

  constructor(
    private readonly db: AttentionSqliteDatabase,
    private readonly subjects: AttentionSubjectResolver,
    private readonly options: AttentionModuleOptions = {},
  ) {
    migrateAttention(db);
  }

  private list(projectId: string): AttentionEntryRecord[] {
    return (this.db.prepare(
      "SELECT * FROM inbox_entries WHERE board_id = ? ORDER BY updated_at DESC, entry_id",
    ).all(projectId) as Row[]).map(mapAttentionEntry);
  }

  private get(projectId: string, entryId: string): AttentionEntryRecord {
    const row = this.db.prepare(
      "SELECT * FROM inbox_entries WHERE board_id = ? AND entry_id = ?",
    ).get(projectId, entryId) as Row | undefined;
    if (!row) throw new AttentionError("attention_entry_not_found", "找不到这个 Inbox Entry");
    return mapAttentionEntry(row);
  }

  private findActiveForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
  ): AttentionEntryRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM inbox_entries
      WHERE board_id = ? AND subject_type = ? AND subject_id = ?
        AND status IN ('open', 'in_progress')
      ORDER BY CASE reason WHEN 'manual' THEN 0 ELSE 1 END, updated_at DESC, entry_id
      LIMIT 1
    `).get(projectId, subjectType, subjectId) as Row | undefined;
    return row ? mapAttentionEntry(row) : null;
  }

  private findForSubject(
    projectId: string,
    subjectType: AttentionSubjectType,
    subjectId: string,
  ): AttentionEntryRecord[] {
    return (this.db.prepare(`
      SELECT * FROM inbox_entries
      WHERE board_id = ? AND subject_type = ? AND subject_id = ?
      ORDER BY updated_at DESC, entry_id
    `).all(projectId, subjectType, subjectId) as Row[]).map(mapAttentionEntry);
  }

  private create(input: CreateAttentionEntryInput): { entry: AttentionEntryRecord; created: boolean } {
    assertReference(input.subject_type, input.subject_id);
    assertReason(input.subject_type, input.reason);
    if (!this.subjects.exists(input.project_id, input.subject_type, input.subject_id)) {
      throw new AttentionError("attention_invalid_reference", referenceMessage(input.subject_type));
    }
    const existing = this.db.prepare(`
      SELECT * FROM inbox_entries
      WHERE board_id = ? AND subject_type = ? AND subject_id = ? AND reason = ?
    `).get(input.project_id, input.subject_type, input.subject_id, input.reason) as Row | undefined;
    if (existing) return { entry: mapAttentionEntry(existing), created: false };
    const at = input.at ?? this.now().toISOString();
    const entry: AttentionEntryRecord = {
      project_id: input.project_id,
      entry_id: input.entry_id ?? `inboxentry-${randomUUID()}`,
      subject_type: input.subject_type,
      subject_id: input.subject_id,
      reason: input.reason,
      status: "open",
      detail: input.detail ?? {},
      revision: 1,
      created_at: at,
      updated_at: at,
      completed_at: null,
    };
    assertShape(entry);
    this.db.prepare(`
      INSERT INTO inbox_entries (
        board_id, entry_id, subject_type, subject_id, reason, status,
        detail_json, revision, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.project_id,
      entry.entry_id,
      entry.subject_type,
      entry.subject_id,
      entry.reason,
      entry.status,
      JSON.stringify(entry.detail),
      entry.revision,
      entry.created_at,
      entry.updated_at,
      entry.completed_at,
    );
    this.appendEvent(entry, "inbox_entry.created", at, "对象已加入 Inbox");
    return { entry, created: true };
  }

  private setStatus(
    projectId: string,
    entryId: string,
    status: AttentionStatus,
    expectedRevision?: number,
  ): AttentionEntryRecord {
    return this.db.transaction(() => {
      const current = this.get(projectId, entryId);
      if (expectedRevision != null && current.revision !== expectedRevision) {
        throw new AttentionError("attention_revision_conflict", "这条 Inbox Entry 已经变化，请刷新后重试");
      }
      assertTransition(current.status, status);
      if (current.status === status) return current;
      const at = this.now().toISOString();
      const completedAt = status === "done" || status === "dismissed" ? at : null;
      this.db.prepare(`
        UPDATE inbox_entries
        SET status = ?, revision = revision + 1, updated_at = ?, completed_at = ?
        WHERE board_id = ? AND entry_id = ?
      `).run(status, at, completedAt, projectId, entryId);
      const updated = this.get(projectId, entryId);
      this.appendEvent(updated, `inbox_entry.${status}`, at, `Inbox Entry 已标记为 ${status}`);
      return updated;
    }).immediate();
  }

  private deleteSubject(projectId: string, subjectType: AttentionSubjectType, subjectId: string): number {
    const entries = this.findForSubject(projectId, subjectType, subjectId);
    if (entries.length === 0) return 0;
    const at = this.now().toISOString();
    this.db.prepare(
      "DELETE FROM inbox_entries WHERE board_id = ? AND subject_type = ? AND subject_id = ?",
    ).run(projectId, subjectType, subjectId);
    for (const entry of entries) this.appendEvent(entry, "inbox_entry.deleted", at, "Inbox 引用已删除");
    return entries.length;
  }

  private listEvents(projectId: string, entryId?: string): AttentionEvent[] {
    const rows = entryId == null
      ? this.db.prepare(
          "SELECT * FROM attention_events WHERE project_id = ? ORDER BY at, event_id",
        ).all(projectId)
      : this.db.prepare(`
          SELECT * FROM attention_events
          WHERE project_id = ? AND entry_id = ? ORDER BY at, event_id
        `).all(projectId, entryId);
    return (rows as Row[]).map(mapAttentionEvent);
  }

  private countEntries(): number {
    return Number((this.db.prepare(
      "SELECT COUNT(*) AS count FROM inbox_entries",
    ).get() as { count?: number } | undefined)?.count ?? 0);
  }

  private importLegacy(entry: LegacyAttentionEntryInput): AttentionEntryRecord {
    assertShape(entry);
    this.db.prepare(`
      INSERT OR IGNORE INTO inbox_entries (
        board_id, entry_id, subject_type, subject_id, reason, status,
        detail_json, revision, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.project_id,
      entry.entry_id,
      entry.subject_type,
      entry.subject_id,
      entry.reason,
      entry.status,
      JSON.stringify(entry.detail),
      entry.revision,
      entry.created_at,
      entry.updated_at,
      entry.completed_at,
    );
    return this.findForSubject(
      entry.project_id,
      entry.subject_type,
      entry.subject_id,
    ).find((candidate) => candidate.reason === entry.reason)!;
  }

  private listFeedItemReferences(): Array<{ project_id: string; subject_id: string }> {
    return (this.db.prepare(`
      SELECT board_id, subject_id FROM inbox_entries
      WHERE subject_type = 'feed_item'
      ORDER BY board_id, subject_id
    `).all() as Array<{ board_id: string; subject_id: string }>).map((row) => ({
      project_id: row.board_id,
      subject_id: row.subject_id,
    }));
  }

  private appendEvent(
    entry: AttentionEntryRecord,
    type: AttentionEvent["type"],
    at: string,
    reason: string,
  ): void {
    this.db.prepare(`
      INSERT INTO attention_events (
        event_id, project_id, entry_id, type, subject_type, subject_id, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `attention-event-${randomUUID()}`,
      entry.project_id,
      entry.entry_id,
      type,
      entry.subject_type,
      entry.subject_id,
      at,
    );
    this.options.eventSink?.({
      project_id: entry.project_id,
      entry_id: entry.entry_id,
      type,
      reason,
      payload: { subject_type: entry.subject_type, subject_id: entry.subject_id, reason: entry.reason },
      at,
    });
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

export function assertAttentionTransition(from: AttentionStatus, to: AttentionStatus): void {
  assertTransition(from, to);
}

export function assertAttentionEntryShape(entry: AttentionEntryRecord): void {
  assertShape(entry);
}

function assertReference(subjectType: AttentionSubjectType, subjectId: string): void {
  if (!subjectId.trim() || !["feed_item", "goal_decision", "source_fault"].includes(subjectType)) {
    throw new AttentionError("attention_invalid_reference", "Inbox Entry 必须引用一个有效对象");
  }
}

function assertReason(subjectType: AttentionSubjectType, reason: AttentionReason): void {
  const valid = subjectType === "feed_item"
    ? reason === "manual" || reason === "source_rule" || reason === "artifact_out_failed"
    : subjectType === "source_fault"
      ? reason === "source_fault"
      : reason === "goal_decision";
  if (!valid) throw new AttentionError("attention_invalid_transition", referenceMessage(subjectType));
}

function assertShape(entry: AttentionEntryRecord): void {
  assertReference(entry.subject_type, entry.subject_id);
  const forbidden = ["title", "summary", "body", "message", "content", "credential", "cursor"];
  for (const key of forbidden) {
    if (Object.hasOwn(entry, key)) {
      throw new AttentionError("attention_invalid_reference", `Inbox Entry 不能复制 ${key}`);
    }
  }
  for (const key of Object.keys(entry.detail)) {
    const normalized = key.toLowerCase();
    if (forbidden.some((token) => normalized.includes(token))) {
      throw new AttentionError("attention_invalid_reference", `Inbox Entry detail 不能复制 ${key}`);
    }
  }
}

function assertTransition(from: AttentionStatus, to: AttentionStatus): void {
  if (from === to) return;
  if (!ATTENTION_STATUS_TRANSITIONS[from].includes(to)) {
    throw new AttentionError(
      "attention_invalid_transition",
      `feed_contract_invalid_inbox_transition:${from}:${to}`,
    );
  }
}

function referenceMessage(subjectType: AttentionSubjectType): string {
  if (subjectType === "feed_item") return "Feed Item 只能由手工标记或来源规则进入 Inbox";
  if (subjectType === "source_fault") return "来源故障必须使用 source_fault 原因";
  return "Goal 决定必须引用当前项目内的 Goal";
}

function mapAttentionEntry(row: Row): AttentionEntryRecord {
  const entry: AttentionEntryRecord = {
    project_id: text(row.board_id),
    entry_id: text(row.entry_id),
    subject_type: text(row.subject_type) as AttentionSubjectType,
    subject_id: text(row.subject_id),
    reason: text(row.reason) as AttentionReason,
    status: text(row.status) as AttentionStatus,
    detail: json<Record<string, unknown>>(row.detail_json, {}),
    revision: Number(row.revision ?? 0),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at),
    completed_at: optionalText(row.completed_at),
  };
  assertShape(entry);
  return entry;
}

function mapAttentionEvent(row: Row): AttentionEvent {
  return {
    event_id: text(row.event_id),
    project_id: text(row.project_id),
    entry_id: text(row.entry_id),
    type: text(row.type) as AttentionEvent["type"],
    subject_type: text(row.subject_type) as AttentionSubjectType,
    subject_id: text(row.subject_id),
    at: text(row.at),
  };
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
