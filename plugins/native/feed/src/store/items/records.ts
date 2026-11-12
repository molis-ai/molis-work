import { feedPageSelection, type FeedItemPage } from "./page.js";
import { randomUUID } from "node:crypto";
import { feedErrors } from "../../contract/feed.js";
import type {
  FeedEvent,
  FeedItemRecord,
  FeedMaterialRecord,
} from "../../contract/feed.js";
import { FeedGoalLinks } from "./goal-links.js";
import { parseJson } from "@molis-ai/molis-work-plugin-sdk";
import { mapFeedItem, mapFeedMaterial, text, type Row } from "./rows.js";
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

  list(projectId: string, page: FeedItemPage): FeedItemRecord[] {
    const selected = feedPageSelection(page);
    // Lists never need article bodies; select their metadata before material hydration.
    const columns = "project_id,item_id,source_id,signal_id,signal_revision,kind,title,summary,source_kind,source_label,external_id,url,origin_status,priority,tags_json,author,disposition,read_at,revision,source_created_at,source_updated_at,imported_at,updated_at";
    const items = this.db.all(`SELECT ${columns} FROM feed_items WHERE project_id = ?${selected.where} ORDER BY ${selected.order} LIMIT ? OFFSET ?`, projectId,
      ...selected.values, Math.min(200, Math.max(1, page.limit)), Math.max(0, page.offset)) as Row[];
    if (!items.length) return [];
    // One owner query for this page: no full ledger scan and no per-item authorization/query loop.
    const links = this.goalLinks.list(projectId, items.map(row => text(row.item_id)));
    return items.map(row => mapFeedItem(row, [], links.get(text(row.item_id)) ?? null));
  }

  get(projectId: string, itemId: string, page?: { offset: number; limit: number }): FeedItemRecord {
    const row = this.db.get("SELECT * FROM feed_items WHERE project_id = ? AND item_id = ?", projectId, itemId) as Row | undefined;
    if (!row) throw feedErrors.item_not_found("找不到这个 Feed Item");
    const materials = page ? this.materials(projectId, itemId, page.offset, page.limit) : (this.db.all(`
      SELECT * FROM feed_materials
      WHERE project_id = ? AND item_id = ? ORDER BY updated_at DESC, material_id
    `, projectId, itemId) as Row[]).map(mapFeedMaterial);
    return mapFeedItem(row, materials, this.goalLinks.get(projectId, itemId));
  }

  materials(projectId: string, itemId: string, offset: number, limit: number): FeedMaterialRecord[] {
    return (this.db.all("SELECT * FROM feed_materials WHERE project_id = ? AND item_id = ? ORDER BY material_id LIMIT ? OFFSET ?",
      projectId, itemId, Math.min(200, Math.max(1, limit)), Math.max(0, offset)) as Row[]).map(mapFeedMaterial);
  }

  hasPackage(projectId: string, sourceId: string, externalId: string, hash: string): boolean {
    return Boolean(this.db.get(`SELECT 1 FROM feed_materials WHERE project_id = ? AND item_id IN
      (SELECT item_id FROM feed_items WHERE project_id = ? AND source_id = ? AND external_id = ?)
      AND json_extract(provenance_json, '$.manifest_sha256') = ? LIMIT 1`, projectId, projectId, sourceId, externalId, hash));
  }

  facets(projectId: string): { source_id: string; label: string; count: number }[] {
    return this.db.all<{ source_id: string; label: string; count: number }>(`SELECT COALESCE(source_id, '') AS source_id,
      COALESCE(NULLIF(source_label, ''), source_kind) AS label, COUNT(*) AS count FROM feed_items
      WHERE project_id = ? GROUP BY source_id, label ORDER BY source_id, label`, projectId);
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
      payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
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
