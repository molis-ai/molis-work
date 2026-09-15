import type { FeedApplication } from "./application.js";
import type { RelayImportData, RelayImportPorts, RelayImportResult } from "./relay-import-types.js";
import { sourceKindOpensAttention } from "./projection.js";
import { stableId } from "./source-input.js";
import { text, optionalText, parsedJson, parsedTags } from "./relay-import-values.js";
import { importRelaySources } from "./relay-import-sources.js";

export function prepareRelayFeedImport(target: FeedApplication, boardId: string, data: RelayImportData): (ports: RelayImportPorts) => RelayImportResult {
  const { items, materials, sourceRuns } = data;
  const currentSnapshot = target.snapshot(boardId);
  const existingSources = new Map(
    currentSnapshot.sources.map((source) => [source.source_id, source]),
  );
  const existingSourceIds = new Set(existingSources.keys());
  const isRepeatOwnershipImport = currentSnapshot.import_receipts.length > 0;
  const existingItemIds = new Set(currentSnapshot.feed_items.map((item) => item.item_id));
  const existingMaterialIds = new Set(
    currentSnapshot.feed_items.flatMap((item) => item.materials.map((material) => material.material_id)),
  );
  const existingRunIds = new Set(currentSnapshot.runs.map((run) => run.run_id));
  return (ports) => {
    const { migrateOwnership } = ports;
    const result: RelayImportResult = {
      path: ports.path,
      receipt_id: stableId("feed-import", `${boardId}\u0000${ports.path}`),
      sources: { created: 0, updated: 0 },
      items: { created: 0, updated: 0 },
      materials: { created: 0, updated: 0 },
      runs: { created: 0, updated: 0 },
      cursors: { migrated: 0 },
      credentials: ports.credentials,
      content: {
        status: !migrateOwnership ? "not_requested" : "migrated",
        migrated: 0,
        missing: 0,
      },
    };

    return target.importOwnershipBatch(() => {
      const now = new Date().toISOString();
      const { sourceById, sourceIdForItem } = importRelaySources(target, boardId, data, ports, existingSources, existingSourceIds, isRepeatOwnershipImport, result, now);
      for (const row of items) {
        const tags = parsedTags(row.tags_json);
        const sourceKind = text(row.source) || "manual";
        const sourceId = sourceIdForItem(row, tags);
        const disposition = tags.includes("role:reference")
          ? "saved"
          : text(row.status) === "archived"
            ? "archived"
            : "inbox";
        const itemId = text(row.id);
        target.upsertImportedItem({
          project_id: boardId,
          item_id: itemId,
          source_id: sourceId,
          kind: text(row.kind),
          title: text(row.title),
          summary: text(row.summary),
          body: optionalText(row.body),
          source_kind: sourceKind,
          source_label: text(row.source_label) || sourceKind,
          external_id: optionalText(row.external_id),
          url: optionalText(row.url),
          origin_status: text(row.status),
          priority: text(row.priority) || "medium",
          tags,
          author: optionalText(row.author),
          disposition,
          source_created_at: text(row.created_at) || now,
          source_updated_at: text(row.updated_at) || now,
          imported_at: now,
          updated_at: now,
        });
        if (sourceKindOpensAttention(sourceKind)) {
          target.ensureInboxEntryForFeedItem(boardId, itemId, "source_rule", {
            source_id: sourceId,
            imported_from: "relay",
          });
        }
        if (existingItemIds.has(itemId)) result.items.updated += 1;
        else result.items.created += 1;
      }

      for (const row of materials) {
        const itemId = text(row.item_id);
        if (!itemId || !items.some((item) => text(item.id) === itemId)) continue;
        const migrated = ports.migrateContent(optionalText(row.content_ref));
        if (migrated.available) result.content.migrated += 1;
        else if (optionalText(row.content_ref)) result.content.missing += 1;
        const materialId = text(row.id);
        target.upsertMaterial({
          board_id: boardId,
          material_id: materialId,
          item_id: itemId,
          canonical_url: optionalText(row.canonical_url),
          title: text(row.title),
          source_name: text(row.source_name),
          published_at: optionalText(row.published_at),
          preview: text(row.preview),
          content_hash: optionalText(row.content_hash),
          content_ref: migrated.contentRef,
          content_available: migrated.available,
          content_type: optionalText(row.content_type),
          character_count: row.character_count == null ? null : Number(row.character_count),
          captured_at: optionalText(row.captured_at) ?? optionalText(row.last_seen_at),
          provenance: parsedJson(row.provenance_json, {}),
          selected_for_context: Number(row.selected_for_context ?? 0) === 1,
          imported_at: now,
          updated_at: text(row.last_seen_at) || now,
        });
        if (existingMaterialIds.has(materialId)) result.materials.updated += 1;
        else result.materials.created += 1;
      }

      for (const row of sourceRuns) {
        const runId = text(row.id);
        const sourceId = text(row.inbox_source_id);
        if (!sourceById.has(sourceId)) continue;
        target.upsertSourceRun({
          board_id: boardId,
          run_id: runId,
          operation_id: text(row.operation_id),
          source_id: sourceId,
          phase: normalizeRunPhase(row.phase),
          outcome: optionalText(row.outcome),
          empty: Number(row.empty ?? 0) === 1,
          error_code: optionalText(row.error_code),
          receipt: parsedJson(row.collection_receipt_json, null),
          created_count: 0,
          deduped_count: 0,
          recovery_count: Number(row.recovery_count ?? 0),
          started_at: text(row.started_at) || now,
          completed_at: optionalText(row.completed_at),
          updated_at: text(row.updated_at) || now,
        });
        if (existingRunIds.has(runId)) result.runs.updated += 1;
        else result.runs.created += 1;
      }

      if (result.content.missing > 0) {
        result.content.status = result.content.migrated > 0 ? "partial" : "unavailable";
      } else if (!migrateOwnership) {
        result.content.status = "not_requested";
      }

      return { result, receipt: {
        board_id: boardId,
        receipt_id: result.receipt_id,
        source_fingerprint: ports.sourceFingerprint(),
        summary: {
          sources: result.sources,
          items: result.items,
          materials: result.materials,
          runs: result.runs,
          cursors: result.cursors,
          credentials: result.credentials,
          content: result.content,
        },
        credentials_status: result.credentials.status,
        content_status: result.content.status,
        completed_at: now,
      } };
    });
  };
}

function normalizeRunPhase(value: unknown): "running" | "terminal" | "interrupted" {
  return value === "terminal" ? "terminal" : value === "running" ? "interrupted" : "interrupted";
}
