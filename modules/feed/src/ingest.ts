import { randomUUID } from "node:crypto";
import type { AttentionApi } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type {
  FeedItemRecord,
  FeedMaterialRecord,
  IngestFeedItemInput,
} from "@molis-ai/molis-work-contracts/modules/feed";
import type { FeedRecords } from "./records.js";
import { mapFeedItem, normalizeSummary, normalizeTitle, type Row } from "./rows.js";

/** Writes that bring an item or its material into the Feed: ingest, and the material upsert it shares. */
export class FeedIngest {
  constructor(private readonly records: FeedRecords, private readonly attention: AttentionApi) {}

  ingest(input: IngestFeedItemInput): {
    item: FeedItemRecord;
    created: boolean;
    updated: boolean;
  } {
    const { db } = this.records;
    return db.transaction(() => {
      const existingRow = db.prepare(`
        SELECT * FROM feed_items
        WHERE project_id = ? AND source_id = ? AND external_id = ?
      `).get(input.project_id, input.source_id, input.external_id) as Row | undefined;
      const attention = input.attention === false ? null : input.attention ?? null;
      if (existingRow) {
        const existing = mapFeedItem(existingRow, []);
        // A newer Signal revision updates the item. A source without Signals (a package republished under the same
        // id) says so with `refresh`, and the item then changes together with the material it carries.
        const shouldUpdate = input.refresh === true || (input.signal != null
          && (existing.signal_id !== input.signal.signal_id
            || existing.signal_revision == null
            || input.signal.revision > existing.signal_revision));
        if (shouldUpdate) {
          const at = this.records.now().toISOString();
          db.prepare(`
            UPDATE feed_items SET
              signal_id = ?, signal_revision = ?, kind = ?, title = ?, summary = ?, body = ?,
              source_kind = ?, source_label = ?, url = ?, priority = ?, tags_json = ?, author = ?,
              revision = revision + 1, source_updated_at = ?, updated_at = ?
            WHERE project_id = ? AND item_id = ?
          `).run(
            input.signal?.signal_id ?? existing.signal_id,
            input.signal?.revision ?? existing.signal_revision,
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
          this.records.appendEvent(
            input.project_id,
            existing.item_id,
            "feed_item.updated",
            "feed_item.updated",
            input.signal ? "Signal 新版本已更新 Feed Item" : "来源内容新版本已更新 Feed Item",
            input.signal ? { signal_id: input.signal.signal_id, signal_revision: input.signal.revision } : { refreshed: true },
            at,
          );
        }
        if (input.material) {
          this.upsertMaterial({
            ...input.material,
            project_id: input.project_id,
            item_id: existing.item_id,
            imported_at: this.records.now().toISOString(),
            updated_at: this.records.now().toISOString(),
          });
        }
        // A source seeing an ignored item again does not bring it back to the Inbox; the person restores it.
        if (attention && existing.disposition !== "archived") {
          this.attention.commands.ensureFeedItem(
            input.project_id,
            existing.item_id,
            attention.reason,
            attention.detail,
          );
        }
        return { item: this.records.get(input.project_id, existing.item_id), created: false, updated: shouldUpdate };
      }

      const at = this.records.now().toISOString();
      const itemId = `feeditem-${randomUUID()}`;
      db.prepare(`
        INSERT INTO feed_items (
          project_id, item_id, source_id, signal_id, signal_revision,
          kind, title, summary, body, source_kind, source_label, external_id,
          url, origin_status, priority, tags_json, author, disposition,
          read_at, revision, source_created_at, source_updated_at,
          imported_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'inbox', ?, ?, ?, 'inbox', NULL, 1, ?, ?, ?, ?)
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
      this.records.appendEvent(
        input.project_id,
        itemId,
        "feed_item.created",
        "feed_source.item_ingested",
        `从 ${input.source_label} 导入 Feed Item`,
        { source_id: input.source_id, signal_id: input.signal?.signal_id ?? null },
        at,
      );
      return { item: this.records.get(input.project_id, itemId), created: true, updated: false };
    }).immediate();
  }

  upsertMaterial(material: FeedMaterialRecord): FeedMaterialRecord {
    this.records.get(material.project_id, material.item_id);
    this.records.db.prepare(`
      INSERT INTO feed_materials (
        project_id, material_id, item_id, canonical_url, title, source_name,
        published_at, preview, content_hash, content_ref, content_available,
        content_type, character_count, captured_at, provenance_json,
        selected_for_context, imported_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, material_id) DO UPDATE SET
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
    return this.records.get(material.project_id, material.item_id).materials.find(
      (candidate) => candidate.material_id === material.material_id,
    )!;
  }
}
