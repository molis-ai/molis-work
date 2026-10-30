import { randomUUID } from "node:crypto";
import { feedErrors } from "../../contract/feed.js";
import type {
  FeedEvent,
  FeedItemRecord,
  FeedMaterialRecord,
} from "../../contract/feed.js";
import { FeedGoalLinks } from "./goal-links.js";
import { json, mapFeedItem, mapFeedMaterial, text, type Row } from "./rows.js";
import type { FeedSql } from "../sql.js";
import type { FeedModuleOptions } from "./types.js";

/** Reads of the Feed tables and the one place an item event is written; the write paths build on it. */
export class FeedRecords {
  constructor(
    readonly db: FeedSql,
    readonly goalLinks: FeedGoalLinks,
    private readonly options: FeedModuleOptions,
  ) {}

  now(): Date {
    return this.options.now?.() ?? new Date();
  }

  list(projectId: string): FeedItemRecord[] {
    const links = this.goalLinks.list(projectId);
    const materials = (this.db.all("SELECT * FROM feed_materials WHERE project_id = ? ORDER BY updated_at DESC, material_id", projectId) as Row[]).map(mapFeedMaterial);
    const byItem = new Map<string, FeedMaterialRecord[]>();
    for (const material of materials) {
      byItem.set(material.item_id, [...(byItem.get(material.item_id) ?? []), material]);
    }
    return (this.db.all("SELECT * FROM feed_items WHERE project_id = ? ORDER BY source_updated_at DESC, item_id", projectId) as Row[]).map((row) => mapFeedItem(row, byItem.get(text(row.item_id)) ?? [],
      links.get(text(row.item_id)) ?? null));
  }

  get(projectId: string, itemId: string): FeedItemRecord {
    const row = this.db.get("SELECT * FROM feed_items WHERE project_id = ? AND item_id = ?", projectId, itemId) as Row | undefined;
    if (!row) throw feedErrors.item_not_found("找不到这个 Feed Item");
    const materials = (this.db.all(`
      SELECT * FROM feed_materials
      WHERE project_id = ? AND item_id = ? ORDER BY updated_at DESC, material_id
    `, projectId, itemId) as Row[]).map(mapFeedMaterial);
    return mapFeedItem(row, materials, this.goalLinks.get(projectId, itemId));
  }

  exists(projectId: string, itemId: string): boolean {
    return Boolean(this.db.get("SELECT 1 FROM feed_items WHERE project_id = ? AND item_id = ?", projectId, itemId));
  }

  countBySource(projectId: string, sourceId: string): number {
    return Number((this.db.get(`
      SELECT COUNT(*) AS count FROM feed_items WHERE project_id = ? AND source_id = ?
    `, projectId, sourceId) as { count?: number } | undefined)?.count ?? 0);
  }

  findByLinkedGoal(projectId: string, goalId: string, itemId?: string): FeedItemRecord | null {
    const linked = this.goalLinks.find(projectId, goalId).filter((id) => itemId == null || id === itemId);
    if (!linked.length) return null;
    const found = this.db.get(`SELECT item_id FROM feed_items
      WHERE project_id = ? AND item_id IN (SELECT value FROM json_each(?))
      ORDER BY updated_at DESC, item_id LIMIT 1`, projectId, JSON.stringify(linked)) as { item_id: string } | undefined;
    return found ? this.get(projectId, found.item_id) : null;
  }

  listEvents(projectId: string, itemId?: string): FeedEvent[] {
    const rows = itemId == null
      ? this.db.all("SELECT * FROM feed_item_events WHERE project_id = ? ORDER BY at, rowid", projectId)
      : this.db.all(`
          SELECT * FROM feed_item_events
          WHERE project_id = ? AND item_id = ? ORDER BY at, rowid
        `, projectId, itemId);
    return (rows as Row[]).map((row) => ({
      event_id: text(row.event_id),
      project_id: text(row.project_id),
      item_id: text(row.item_id),
      type: text(row.type) as FeedEvent["type"],
      payload: json<Record<string, unknown>>(row.payload_json, {}),
      at: text(row.at),
    }));
  }

  appendEvent(
    projectId: string,
    itemId: string,
    type: FeedEvent["type"],
    journalType: string,
    reason: string,
    payload: Record<string, unknown>,
    at: string,
  ): void {
    this.db.run(`
      INSERT INTO feed_item_events (
        event_id, project_id, item_id, type, payload_json, at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, `feed-event-${randomUUID()}`, projectId, itemId, type, JSON.stringify(payload), at);
    this.options.eventSink?.({ project_id: projectId, item_id: itemId, type: journalType, reason, payload, at });
  }
}
