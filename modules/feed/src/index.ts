import { FeedError } from "@molis-ai/molis-work-contracts/modules/feed";
import { randomUUID } from "node:crypto";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { FeedGoalLinks } from "./goal-links.js";

import type {
  AttentionApi,
  AttentionStatus,
} from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedApi,
  FeedEvent,
  FeedItemDisposition,
  FeedItemRecord,
  FeedMaterialRecord,
  InfoflowContractMigrationReport,
  IngestFeedItemInput,
} from "@molis-ai/molis-work-contracts/modules/feed";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-feed",
  packagePath: "modules/feed",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/feed",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["feed.query.v1", "feed.command.v1"],
} as const;

export const INFOFLOW_SCHEMA_MIGRATION_ID = 29 as const;

type Row = Record<string, unknown>;
type Statement = {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
};
export interface FeedSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  pragma(sql: string): unknown;
  transaction<T>(operation: () => T): (() => T) & { immediate(): T };
}

export interface FeedLegacyEvent {
  project_id: string;
  item_id: string;
  type: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface FeedModuleOptions {
  ledger: ContextLedgerApi;
  now?: () => Date;
  eventSink?: (event: FeedLegacyEvent) => void;
}

export { FeedError } from "@molis-ai/molis-work-contracts/modules/feed";

export function migrateFeed(db: FeedSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_items (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      item_id TEXT NOT NULL,
      source_id TEXT,
      signal_id TEXT,
      signal_revision INTEGER,
      item_type TEXT NOT NULL CHECK (item_type IN ('inbox_message', 'feed')),
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      body TEXT,
      source_kind TEXT NOT NULL,
      source_label TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      origin_status TEXT NOT NULL,
      priority TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author TEXT,
      disposition TEXT NOT NULL CHECK (disposition IN ('inbox', 'saved', 'promoted', 'processing', 'archived')),
      linked_goal_id TEXT,
      read_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      source_created_at TEXT NOT NULL,
      source_updated_at TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS feed_items_board_type_updated_idx
      ON feed_items(board_id, item_type, disposition, source_updated_at DESC);
    CREATE INDEX IF NOT EXISTS feed_items_board_goal_idx
      ON feed_items(board_id, linked_goal_id);
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_board_source_external_idx
      ON feed_items(board_id, source_id, external_id)
      WHERE source_id IS NOT NULL AND external_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS feed_materials (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      material_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      canonical_url TEXT,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      published_at TEXT,
      preview TEXT NOT NULL DEFAULT '',
      content_hash TEXT,
      content_ref TEXT,
      content_available INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      character_count INTEGER,
      captured_at TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}',
      selected_for_context INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, material_id),
      FOREIGN KEY (board_id, item_id) REFERENCES feed_items(board_id, item_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS feed_materials_board_item_idx
      ON feed_materials(board_id, item_id, updated_at DESC, material_id);

    CREATE TABLE IF NOT EXISTS feed_item_events (
      event_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS feed_item_events_project_item_idx
      ON feed_item_events(project_id, item_id, at, event_id);

    CREATE TABLE IF NOT EXISTS feed_contract_migration_receipts (
      receipt_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      preflight_json TEXT NOT NULL,
      postflight_json TEXT NOT NULL,
      rollback_strategy TEXT NOT NULL CHECK (rollback_strategy = 'sqlite_immediate_transaction'),
      applied_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "feed_materials", "content_ref", "TEXT");
  ensureColumn(db, "feed_materials", "content_available", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "feed_materials", "content_type", "TEXT");
  ensureColumn(db, "feed_materials", "character_count", "INTEGER");
  ensureColumn(db, "feed_materials", "captured_at", "TEXT");
  ensureColumn(db, "feed_items", "read_at", "TEXT");
  ensureColumn(db, "feed_items", "signal_id", "TEXT");
  ensureColumn(db, "feed_items", "signal_revision", "INTEGER");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_board_signal_idx
      ON feed_items(board_id, signal_id) WHERE signal_id IS NOT NULL
  `);
}

export class FeedModule implements FeedApi {
  private readonly goalLinks: FeedGoalLinks;
  readonly query = {
    list: (projectId: string) => this.list(projectId),
    get: (projectId: string, itemId: string) => this.get(projectId, itemId),
    exists: (projectId: string, itemId: string) => this.exists(projectId, itemId),
    countBySource: (projectId: string, sourceId: string) => this.countBySource(projectId, sourceId),
    findByLinkedGoal: (projectId: string, goalId: string, itemId?: string) =>
      this.findByLinkedGoal(projectId, goalId, itemId),
  };

  readonly commands = {
    ingest: (input: IngestFeedItemInput) => this.ingest(input),
    upsertMaterial: (material: FeedMaterialRecord) => this.upsertMaterial(material),
    setDisposition: (
      projectId: string,
      itemId: string,
      disposition: FeedItemDisposition,
      expectedRevision?: number,
    ) => this.setDisposition(projectId, itemId, disposition, expectedRevision),
    restore: (projectId: string, itemId: string, expectedRevision?: number) =>
      this.restore(projectId, itemId, expectedRevision),
    markRead: (
      projectId: string,
      itemId: string,
      expectedItemType?: "feed" | "inbox_message",
    ) => this.markRead(projectId, itemId, expectedItemType),
    linkGoal: (
      projectId: string,
      itemId: string,
      goalId: string,
      disposition: "promoted" | "processing",
    ) => this.linkGoal(projectId, itemId, goalId, disposition),
    deleteBySource: (projectId: string, sourceId: string) => this.deleteBySource(projectId, sourceId),
  };

  readonly events = {
    list: (projectId: string, itemId?: string) => this.listEvents(projectId, itemId),
  };

  constructor(
    private readonly db: FeedSqliteDatabase,
    private readonly attention: AttentionApi,
    private readonly options: FeedModuleOptions,
  ) {
    migrateFeed(db);
    this.goalLinks = new FeedGoalLinks(options.ledger);
    this.migrateGoalLinks();
  }

  private migrateGoalLinks(): void {
    this.db.transaction(() => {
      const rows = this.db.prepare(`SELECT board_id, item_id, linked_goal_id, updated_at
        FROM feed_items WHERE linked_goal_id IS NOT NULL`).all() as Row[];
      for (const row of rows) {
        this.goalLinks.set(text(row.board_id), text(row.item_id), text(row.linked_goal_id), text(row.updated_at), true);
        this.db.prepare("UPDATE feed_items SET linked_goal_id = NULL WHERE board_id = ? AND item_id = ?")
          .run(row.board_id, row.item_id);
      }
    }).immediate();
  }

  private list(projectId: string): FeedItemRecord[] {
    const links = this.goalLinks.list(projectId);
    const materials = (this.db.prepare(
      "SELECT * FROM feed_materials WHERE board_id = ? ORDER BY updated_at DESC, material_id",
    ).all(projectId) as Row[]).map(mapFeedMaterial);
    const byItem = new Map<string, FeedMaterialRecord[]>();
    for (const material of materials) {
      byItem.set(material.item_id, [...(byItem.get(material.item_id) ?? []), material]);
    }
    return (this.db.prepare(
      "SELECT * FROM feed_items WHERE board_id = ? ORDER BY source_updated_at DESC, item_id",
    ).all(projectId) as Row[]).map((row) => mapFeedItem(row, byItem.get(text(row.item_id)) ?? [],
      links.get(text(row.item_id)) ?? null));
  }

  private get(projectId: string, itemId: string): FeedItemRecord {
    const row = this.db.prepare(
      "SELECT * FROM feed_items WHERE board_id = ? AND item_id = ?",
    ).get(projectId, itemId) as Row | undefined;
    if (!row) throw new FeedError("feed_item_not_found", "找不到这个 Feed Item");
    const materials = (this.db.prepare(`
      SELECT * FROM feed_materials
      WHERE board_id = ? AND item_id = ? ORDER BY updated_at DESC, material_id
    `).all(projectId, itemId) as Row[]).map(mapFeedMaterial);
    return mapFeedItem(row, materials, this.goalLinks.get(projectId, itemId));
  }

  private exists(projectId: string, itemId: string): boolean {
    return Boolean(this.db.prepare(
      "SELECT 1 FROM feed_items WHERE board_id = ? AND item_id = ?",
    ).get(projectId, itemId));
  }

  private countBySource(projectId: string, sourceId: string): number {
    return Number((this.db.prepare(`
      SELECT COUNT(*) AS count FROM feed_items WHERE board_id = ? AND source_id = ?
    `).get(projectId, sourceId) as { count?: number } | undefined)?.count ?? 0);
  }

  private findByLinkedGoal(projectId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const linked = this.goalLinks.find(projectId, goalId).filter((id) => itemId == null || id === itemId);
    if (!linked.length) return null;
    const found = this.db.prepare(`SELECT item_id FROM feed_items
      WHERE board_id = ? AND item_id IN (SELECT value FROM json_each(?))
      ORDER BY updated_at DESC, item_id LIMIT 1`).get(projectId, JSON.stringify(linked)) as { item_id: string } | undefined;
    return found ? this.get(projectId, found.item_id) : null;
  }

  private ingest(input: IngestFeedItemInput): {
    item: FeedItemRecord;
    created: boolean;
    updated: boolean;
  } {
    return this.db.transaction(() => {
      const existingRow = this.db.prepare(`
        SELECT * FROM feed_items
        WHERE board_id = ? AND source_id = ? AND external_id = ?
      `).get(input.project_id, input.source_id, input.external_id) as Row | undefined;
      const attention = input.attention === false ? null : input.attention ?? null;
      if (existingRow) {
        const existing = mapFeedItem(existingRow, []);
        const shouldUpdate = input.signal != null
          && (existing.signal_id !== input.signal.signal_id
            || existing.signal_revision == null
            || input.signal.revision > existing.signal_revision);
        if (shouldUpdate) {
          const at = this.now().toISOString();
          this.db.prepare(`
            UPDATE feed_items SET
              signal_id = ?, signal_revision = ?, kind = ?, title = ?, summary = ?, body = ?,
              source_kind = ?, source_label = ?, url = ?, priority = ?, tags_json = ?, author = ?,
              revision = revision + 1, source_updated_at = ?, updated_at = ?
            WHERE board_id = ? AND item_id = ?
          `).run(
            input.signal!.signal_id,
            input.signal!.revision,
            input.kind ?? "update",
            normalizeTitle(input.title),
            normalizeSummary(input.summary),
            input.body ?? null,
            input.source_kind,
            input.source_label,
            input.url ?? null,
            input.priority ?? "medium",
            JSON.stringify(input.tags ?? [input.source_kind]),
            input.author ?? null,
            input.occurred_at,
            at,
            input.project_id,
            existing.item_id,
          );
          this.appendEvent(
            input.project_id,
            existing.item_id,
            "feed_item.updated",
            "feed_item.updated",
            "Signal 新版本已更新 Feed Item",
            { signal_id: input.signal!.signal_id, signal_revision: input.signal!.revision },
            at,
          );
        }
        if (input.material) {
          this.upsertMaterial({
            ...input.material,
            project_id: input.project_id,
            item_id: existing.item_id,
            imported_at: this.now().toISOString(),
            updated_at: this.now().toISOString(),
          });
        }
        if (attention) {
          this.attention.commands.ensureFeedItem(
            input.project_id,
            existing.item_id,
            attention.reason,
            attention.detail,
          );
        }
        return { item: this.get(input.project_id, existing.item_id), created: false, updated: shouldUpdate };
      }

      const at = this.now().toISOString();
      const itemId = `feeditem-${randomUUID()}`;
      this.db.prepare(`
        INSERT INTO feed_items (
          board_id, item_id, source_id, signal_id, signal_revision, item_type,
          kind, title, summary, body, source_kind, source_label, external_id,
          url, origin_status, priority, tags_json, author, disposition,
          linked_goal_id, read_at, revision, source_created_at, source_updated_at,
          imported_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'feed', ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, 'inbox', NULL, NULL, 1, ?, ?, ?, ?)
      `).run(
        input.project_id,
        itemId,
        input.source_id,
        input.signal?.signal_id ?? null,
        input.signal?.revision ?? null,
        input.kind ?? "update",
        normalizeTitle(input.title),
        normalizeSummary(input.summary),
        input.body ?? null,
        input.source_kind,
        input.source_label,
        input.external_id,
        input.url ?? null,
        input.priority ?? "medium",
        JSON.stringify(input.tags ?? [input.source_kind]),
        input.author ?? null,
        input.occurred_at,
        input.occurred_at,
        at,
        at,
      );
      if (input.material) {
        this.upsertMaterial({
          ...input.material,
          project_id: input.project_id,
          item_id: itemId,
          imported_at: at,
          updated_at: at,
        });
      }
      if (attention) {
        this.attention.commands.ensureFeedItem(
          input.project_id,
          itemId,
          attention.reason,
          attention.detail,
        );
      }
      this.appendEvent(
        input.project_id,
        itemId,
        "feed_item.created",
        "feed_source.item_ingested",
        `从 ${input.source_label} 导入 Feed Item`,
        { source_id: input.source_id, signal_id: input.signal?.signal_id ?? null },
        at,
      );
      return { item: this.get(input.project_id, itemId), created: true, updated: false };
    }).immediate();
  }

  private upsertMaterial(material: FeedMaterialRecord): FeedMaterialRecord {
    this.get(material.project_id, material.item_id);
    this.db.prepare(`
      INSERT INTO feed_materials (
        board_id, material_id, item_id, canonical_url, title, source_name,
        published_at, preview, content_hash, content_ref, content_available,
        content_type, character_count, captured_at, provenance_json,
        selected_for_context, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(board_id, material_id) DO UPDATE SET
        item_id = excluded.item_id,
        canonical_url = excluded.canonical_url,
        title = excluded.title,
        source_name = excluded.source_name,
        published_at = excluded.published_at,
        preview = excluded.preview,
        content_hash = excluded.content_hash,
        content_ref = CASE
          WHEN excluded.content_available = 1 THEN excluded.content_ref
          ELSE feed_materials.content_ref
        END,
        content_available = MAX(feed_materials.content_available, excluded.content_available),
        content_type = excluded.content_type,
        character_count = excluded.character_count,
        captured_at = excluded.captured_at,
        provenance_json = excluded.provenance_json,
        selected_for_context = excluded.selected_for_context,
        imported_at = excluded.imported_at,
        updated_at = excluded.updated_at
    `).run(
      material.project_id,
      material.material_id,
      material.item_id,
      material.canonical_url,
      material.title,
      material.source_name,
      material.published_at,
      material.preview,
      material.content_hash,
      material.content_ref,
      material.content_available ? 1 : 0,
      material.content_type,
      material.character_count,
      material.captured_at,
      JSON.stringify(material.provenance),
      material.selected_for_context ? 1 : 0,
      material.imported_at,
      material.updated_at,
    );
    return this.get(material.project_id, material.item_id).materials.find(
      (candidate) => candidate.material_id === material.material_id,
    )!;
  }

  private setDisposition(
    projectId: string,
    itemId: string,
    disposition: FeedItemDisposition,
    expectedRevision?: number,
  ): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.get(projectId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw new FeedError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition === disposition) {
        if (disposition === "inbox") this.openManualAttention(projectId, itemId);
        return this.get(projectId, itemId);
      }
      if (disposition === "inbox") {
        this.openManualAttention(projectId, itemId);
        return this.get(projectId, itemId);
      }
      if (current.disposition === "archived") {
        throw new FeedError("feed_invalid_transition", "请先恢复这条已忽略的 Feed Item");
      }
      const at = this.now().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET disposition = ?, revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(disposition, at, projectId, itemId);
      const inbox = this.attention.query.findActiveForSubject(projectId, "feed_item", itemId);
      if (inbox) {
        const nextStatus: AttentionStatus = disposition === "processing"
          ? "in_progress"
          : disposition === "archived"
            ? "dismissed"
            : "done";
        this.attention.commands.setStatus(projectId, inbox.entry_id, nextStatus, inbox.revision);
      }
      this.appendEvent(
        projectId,
        itemId,
        `feed_item.${disposition}`,
        `feed_item.${disposition}`,
        `Feed Item 已标记为 ${disposition}`,
        {},
        at,
      );
      return this.get(projectId, itemId);
    }).immediate();
  }

  private restore(projectId: string, itemId: string, expectedRevision?: number): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.get(projectId, itemId);
      if (expectedRevision != null && expectedRevision !== current.revision) {
        throw new FeedError("feed_revision_conflict", "这条 Item 已经变化，请刷新后重试");
      }
      if (current.disposition !== "archived") return current;
      const at = this.now().toISOString();
      this.db.prepare(`
        UPDATE feed_items
        SET disposition = 'inbox', revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(at, projectId, itemId);
      const inbox = this.attention.query.findActiveForSubject(projectId, "feed_item", itemId);
      if (inbox) this.attention.commands.setStatus(projectId, inbox.entry_id, "dismissed", inbox.revision);
      this.appendEvent(
        projectId,
        itemId,
        "feed_item.restored",
        "feed_item.restored",
        "用户把 Feed Item 恢复为仅保留在 Feed",
        {},
        at,
      );
      return this.get(projectId, itemId);
    }).immediate();
  }

  private markRead(
    projectId: string,
    itemId: string,
    expectedItemType: "feed" | "inbox_message" = "feed",
  ): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.get(projectId, itemId);
      if (expectedItemType !== "feed") {
        throw new FeedError(
          "feed_read_not_supported",
          "Inbox Message 使用处理状态，不记录已读状态",
        );
      }
      if (current.read_at) return current;
      const at = this.now().toISOString();
      this.db.prepare(`
        UPDATE feed_items SET read_at = ?, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(at, at, projectId, itemId);
      this.appendEvent(
        projectId,
        itemId,
        "feed_item.read",
        "feed_item.read",
        "用户打开 Feed Item 详情",
        {},
        at,
      );
      return this.get(projectId, itemId);
    }).immediate();
  }

  private linkGoal(
    projectId: string,
    itemId: string,
    goalId: string,
    disposition: "promoted" | "processing",
  ): FeedItemRecord {
    return this.db.transaction(() => {
      const current = this.get(projectId, itemId);
      if (current.disposition === "archived") {
        throw new FeedError("feed_invalid_transition", "请先恢复这条已忽略的 Feed Item");
      }
      if (current.linked_goal_id === goalId && current.disposition === disposition) return current;
      const at = this.now().toISOString();
      this.goalLinks.set(projectId, itemId, goalId, at);
      this.db.prepare(`
        UPDATE feed_items
        SET disposition = ?, revision = revision + 1, updated_at = ?
        WHERE board_id = ? AND item_id = ?
      `).run(disposition, at, projectId, itemId);
      const inbox = this.attention.query.findActiveForSubject(projectId, "feed_item", itemId);
      if (inbox) {
        this.attention.commands.setStatus(
          projectId,
          inbox.entry_id,
          disposition === "processing" ? "in_progress" : "done",
          inbox.revision,
        );
      }
      this.appendEvent(
        projectId,
        itemId,
        disposition === "processing" ? "feed_item.processing" : "feed_item.promoted",
        disposition === "processing" ? "feed_item.processing_started" : "feed_item.promoted",
        disposition === "processing" ? "用户从 Feed Item 开始处理" : "用户把 Feed Item 升格为 Goal",
        { goal_id: goalId },
        at,
      );
      return this.get(projectId, itemId);
    }).immediate();
  }

  private deleteBySource(projectId: string, sourceId: string): string[] {
    const itemIds = (this.db.prepare(
      "SELECT item_id FROM feed_items WHERE board_id = ? AND source_id = ? ORDER BY item_id",
    ).all(projectId, sourceId) as Array<{ item_id: string }>).map((row) => row.item_id);
    if (itemIds.length === 0) return [];
    return this.db.transaction(() => {
      const at = this.now().toISOString();
      for (const itemId of itemIds) {
        this.goalLinks.remove(projectId, itemId);
        this.attention.commands.deleteSubject(projectId, "feed_item", itemId);
      }
      this.db.prepare("DELETE FROM feed_items WHERE board_id = ? AND source_id = ?")
        .run(projectId, sourceId);
      for (const itemId of itemIds) {
        this.appendEvent(
          projectId,
          itemId,
          "feed_item.deleted",
          "feed_item.deleted",
          "来源本地历史已删除",
          { source_id: sourceId },
          at,
        );
      }
      return itemIds;
    }).immediate();
  }

  private openManualAttention(projectId: string, itemId: string): void {
    const stored = this.attention.commands.ensureFeedItem(
      projectId,
      itemId,
      "manual",
      { added_by: "web_user" },
    );
    if (stored.entry.status === "done" || stored.entry.status === "dismissed") {
      this.attention.commands.setStatus(projectId, stored.entry.entry_id, "open", stored.entry.revision);
    }
  }

  private listEvents(projectId: string, itemId?: string): FeedEvent[] {
    const rows = itemId == null
      ? this.db.prepare(
          "SELECT * FROM feed_item_events WHERE project_id = ? ORDER BY at, rowid",
        ).all(projectId)
      : this.db.prepare(`
          SELECT * FROM feed_item_events
          WHERE project_id = ? AND item_id = ? ORDER BY at, rowid
        `).all(projectId, itemId);
    return (rows as Row[]).map((row) => ({
      event_id: text(row.event_id),
      project_id: text(row.project_id),
      item_id: text(row.item_id),
      type: text(row.type) as FeedEvent["type"],
      payload: json<Record<string, unknown>>(row.payload_json, {}),
      at: text(row.at),
    }));
  }

  private appendEvent(
    projectId: string,
    itemId: string,
    type: FeedEvent["type"],
    legacyType: string,
    reason: string,
    payload: Record<string, unknown>,
    at: string,
  ): void {
    this.db.prepare(`
      INSERT INTO feed_item_events (
        event_id, project_id, item_id, type, payload_json, at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      `feed-event-${randomUUID()}`,
      projectId,
      itemId,
      type,
      JSON.stringify(payload),
      at,
    );
    this.options.eventSink?.({ project_id: projectId, item_id: itemId, type: legacyType, reason, payload, at });
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/**
 * Compatibility migration from the former stored inbox_message type. Feed owns
 * the old Feed rows; Attention is updated only through its public migration API.
 */
export function migrateInfoflowContractV2(
  db: FeedSqliteDatabase,
  attention: AttentionApi,
  now: () => Date = () => new Date(),
): InfoflowContractMigrationReport {
  migrateFeed(db);
  const legacyRows = db.prepare(`
    SELECT board_id, item_id, source_kind, disposition, imported_at, updated_at
    FROM feed_items
    WHERE item_type = 'inbox_message'
    ORDER BY board_id, item_id
  `).all() as Array<{
    board_id: string;
    item_id: string;
    source_kind: string;
    disposition: FeedItemDisposition;
    imported_at: string;
    updated_at: string;
  }>;
  const preflight = {
    feed_items: scalarCount(db, "SELECT COUNT(*) AS count FROM feed_items"),
    legacy_inbox_messages: legacyRows.length,
    inbox_entries: attention.migrations.countEntries(),
  };
  for (const row of legacyRows) {
    const reason = row.source_kind === "github" || row.source_kind === "gmail"
      ? "source_rule" as const
      : "manual" as const;
    const status: AttentionStatus = row.disposition === "processing"
      ? "in_progress"
      : row.disposition === "archived"
        ? "dismissed"
        : row.disposition === "saved" || row.disposition === "promoted"
          ? "done"
          : "open";
    attention.migrations.importLegacy({
      project_id: row.board_id,
      entry_id: `inboxentry-legacy-${row.item_id}`,
      subject_type: "feed_item",
      subject_id: row.item_id,
      reason,
      status,
      detail: { migrated_from: "feed_items.item_type", migration_id: INFOFLOW_SCHEMA_MIGRATION_ID },
      revision: 1,
      created_at: row.imported_at,
      updated_at: row.updated_at,
      completed_at: status === "done" || status === "dismissed" ? row.updated_at : null,
    });
  }
  db.prepare("UPDATE feed_items SET item_type = 'feed' WHERE item_type = 'inbox_message'").run();
  db.exec("DROP INDEX IF EXISTS feed_items_board_external_idx");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS feed_items_board_source_external_idx
    ON feed_items(board_id, source_id, external_id)
    WHERE source_id IS NOT NULL AND external_id IS NOT NULL
  `);

  for (const row of legacyRows) {
    if (attention.query.findForSubject(row.board_id, "feed_item", row.item_id).length === 0) {
      throw new Error(`feed_contract_migration_missing_inbox_reference:${row.item_id}`);
    }
  }
  const orphanFeedItemEntries = attention.migrations.listFeedItemReferences()
    .filter((entry) => !existsFeedItem(db, entry.project_id, entry.subject_id)).length;
  const postflight = {
    feed_items: scalarCount(db, "SELECT COUNT(*) AS count FROM feed_items"),
    legacy_inbox_messages: scalarCount(
      db,
      "SELECT COUNT(*) AS count FROM feed_items WHERE item_type = 'inbox_message'",
    ),
    inbox_entries: attention.migrations.countEntries(),
    orphan_feed_item_entries: orphanFeedItemEntries,
  };
  if (postflight.feed_items !== preflight.feed_items) {
    throw new Error("feed_contract_migration_item_count_mismatch");
  }
  if (postflight.legacy_inbox_messages !== 0) {
    throw new Error("feed_contract_migration_legacy_rows_remain");
  }
  if (postflight.orphan_feed_item_entries !== 0) {
    throw new Error("feed_contract_migration_orphan_inbox_reference");
  }
  const report: InfoflowContractMigrationReport = {
    receipt_id: "infoflow-contract-v1",
    schema_version: INFOFLOW_SCHEMA_MIGRATION_ID,
    preflight,
    postflight,
    rollback_strategy: "sqlite_immediate_transaction",
    applied_at: now().toISOString(),
  };
  db.prepare(`
    INSERT INTO feed_contract_migration_receipts (
      receipt_id, schema_version, preflight_json, postflight_json,
      rollback_strategy, applied_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(receipt_id) DO UPDATE SET
      schema_version = excluded.schema_version,
      preflight_json = excluded.preflight_json,
      postflight_json = excluded.postflight_json,
      rollback_strategy = excluded.rollback_strategy,
      applied_at = excluded.applied_at
  `).run(
    report.receipt_id,
    report.schema_version,
    JSON.stringify(report.preflight),
    JSON.stringify(report.postflight),
    report.rollback_strategy,
    report.applied_at,
  );
  return report;
}

function ensureColumn(
  db: FeedSqliteDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function scalarCount(db: FeedSqliteDatabase, sql: string): number {
  return Number((db.prepare(sql).get() as { count?: number } | undefined)?.count ?? 0);
}

function existsFeedItem(db: FeedSqliteDatabase, projectId: string, itemId: string): boolean {
  return Boolean(db.prepare(
    "SELECT 1 FROM feed_items WHERE board_id = ? AND item_id = ?",
  ).get(projectId, itemId));
}

function normalizeTitle(value: string): string {
  return value.trim().slice(0, 300) || "未命名更新";
}

function normalizeSummary(value: string): string {
  return value.trim().slice(0, 2_000);
}

function mapFeedMaterial(row: Row): FeedMaterialRecord {
  return {
    project_id: text(row.board_id),
    material_id: text(row.material_id),
    item_id: text(row.item_id),
    canonical_url: optionalText(row.canonical_url),
    title: text(row.title),
    source_name: text(row.source_name),
    published_at: optionalText(row.published_at),
    preview: text(row.preview),
    content_hash: optionalText(row.content_hash),
    content_ref: optionalText(row.content_ref),
    content_available: Number(row.content_available ?? 0) === 1,
    content_type: optionalText(row.content_type),
    character_count: row.character_count == null ? null : Number(row.character_count),
    captured_at: optionalText(row.captured_at),
    provenance: json<Record<string, unknown>>(row.provenance_json, {}),
    selected_for_context: Number(row.selected_for_context ?? 0) === 1,
    imported_at: text(row.imported_at),
    updated_at: text(row.updated_at),
  };
}

function mapFeedItem(row: Row, materials: FeedMaterialRecord[], linkedGoalId: string | null = null): FeedItemRecord {
  return {
    project_id: text(row.board_id),
    item_id: text(row.item_id),
    source_id: optionalText(row.source_id),
    signal_id: optionalText(row.signal_id),
    signal_revision: row.signal_revision == null ? null : Number(row.signal_revision),
    kind: text(row.kind),
    title: text(row.title),
    summary: text(row.summary),
    body: optionalText(row.body),
    source_kind: text(row.source_kind),
    source_label: text(row.source_label),
    external_id: optionalText(row.external_id),
    url: optionalText(row.url),
    origin_status: text(row.origin_status),
    priority: text(row.priority),
    tags: json<string[]>(row.tags_json, []),
    author: optionalText(row.author),
    disposition: text(row.disposition) as FeedItemDisposition,
    linked_goal_id: linkedGoalId,
    read_at: optionalText(row.read_at),
    revision: Number(row.revision ?? 0),
    source_created_at: text(row.source_created_at),
    source_updated_at: text(row.source_updated_at),
    imported_at: text(row.imported_at),
    updated_at: text(row.updated_at),
    materials,
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

export { FeedReceiptStore } from "./contract-receipts.js";

export { type FeedEvidenceContentStore, createFeedEvidenceContentStore } from "./content-store.js";
