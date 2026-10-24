import type {
  FeedItemDisposition,
  FeedItemRecord,
  FeedMaterialRecord,
} from "@molis-ai/molis-work-contracts/modules/feed";

export type Row = Record<string, unknown>;

export function normalizeTitle(value: string): string {
  return value.trim().slice(0, 300) || "未命名更新";
}

export function normalizeSummary(value: string): string {
  return value.trim().slice(0, 2_000);
}

export function mapFeedMaterial(row: Row): FeedMaterialRecord {
  return {
    project_id: text(row.project_id),
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

export function mapFeedItem(row: Row, materials: FeedMaterialRecord[], linkedGoalId: string | null = null): FeedItemRecord {
  return {
    project_id: text(row.project_id),
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

export function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function optionalText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

export function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
