/** Jelly's private, local workspace. Calendar days are YYYY-MM-DD civil dates. */
export const JELLY_PLUGIN_ID = "io.molis.work.jelly";
export const JELLY_PROJECT_PLUGIN_ID = "jelly";
export type JellyPriority = "P0" | "P1" | "P2" | "none";
export interface JellyCategory { id: string; name: string; color: string; sort_index: number }
export interface JellySchedule { start_date: string; end_date: string; start_time: number | null; end_time: number | null }
export interface JellyItem extends JellySchedule {
  id: string; title: string; kind: "task" | "event"; category_id: string;
  priority: JellyPriority; pinned: boolean; completed_at: string | null;
  completion_description: string; notes: string; untimed_rank: number;
  created_at: string; updated_at: string; time_zone: string;
}
export interface JellySeries extends JellyItem {
  weekdays: number[]; until: string | null;
  exceptions: Record<string, { deleted?: boolean; patch?: Partial<JellyItem> }>;
  completions: Record<string, { completed_at: string | null; completion_description: string }>;
}
export interface JellyOccurrence extends JellyItem { series_id: string | null; original_date: string | null }
export type JellyBlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "bullet" | "numbered" | "task" | "quote" | "code" | "divider" | "link";
export interface JellyBlock { id: string; kind: JellyBlockKind; text: string; indent: number; completed_at: string | null; completion_description: string; language?: string; inline_spans?: { text: string; marks: ("bold" | "italic" | "code")[]; link_url?: string }[] }
export interface JellyNote {
  id: string; title: string; category_id: string; blocks: JellyBlock[];
  pinned: boolean; archived_at: string | null; revision: number; created_at: string; updated_at: string;
}
export interface JellyInspiration {
  id: string; input_kind: "text" | "url" | "file"; title: string; raw_text: string; url: string | null;
  file_name: string | null; category_id: string; archived_at: string | null;
  note_id: string | null; digest: JellyDigest | null; material?: JellyMaterialSnapshot; created_at: string; updated_at: string;
}
export type JellyMaterialLocator = { kind: "paragraph"; index: number } | { kind: "page"; number: number } | { kind: "image"; index: number } | { kind: "timestamp"; start_seconds: number; end_seconds: number };
export interface JellyMaterialBlock { id: string; role: "body" | "transcript" | "ocr" | "metadata"; text: string; locator: JellyMaterialLocator; confidence?: number | null }
export interface JellyMaterialCoverage { status: "sufficient" | "partial" | "insufficient"; processed: number; expected?: number; issues: string[] }
export interface JellyMaterialSnapshot { source_hash: string; content_fingerprint: string; blocks: JellyMaterialBlock[]; coverage: JellyMaterialCoverage; provider: string; acquired_at: string; attachment?: { file_name: string; sha256: string } }
export interface JellyDigestClaim { text: string; evidence_block_ids: string[] }
export interface JellyStructuredDigest {
  thesis: JellyDigestClaim; takeaways: JellyDigestClaim[];
  chapters: { title: string; anchor_block_id: string; points: JellyDigestClaim[] }[];
  quotes: { text: string; evidence_block_id: string; speaker?: string }[];
  dropped: JellyDigestClaim[];
}
export interface JellyDigest { source_hash: string; source_text: string; summary: string; snapshot?: JellyMaterialSnapshot; structured?: JellyStructuredDigest; created_at: string; written_note_ids: string[] }
export interface JellyRelation { owner_id: string; original_date: string | null; note_id: string; role: "primary" | "reference" }
export interface JellyTaskLink { item_id: string; note_id: string; block_id: string }
export interface JellyWorkspace {
  schema_version: 1; revision: number; categories: JellyCategory[];
  items: JellyItem[]; series: JellySeries[]; notes: JellyNote[]; inspirations: JellyInspiration[];
  relations: JellyRelation[]; relation_overrides?: { owner_id: string; original_date: string; primary: "inherit" | "clear" | string; added_reference_ids: string[]; removed_reference_ids: string[] }[]; task_links: JellyTaskLink[]; applied_plan_ids: string[];
  imported_sources?: { sha256: string; schema_version: number; source: unknown; imported_at: string }[];
}
/** Commands are validated by the plugin before its atomic revisioned write. */
export interface JellyCommand { type: string; [key: string]: unknown }
export interface JellyPlanAction { id: string; title: string; notes: string; duration_minutes?: 15 | 30 | 45 | 60 | 90; schedule: JellySchedule | null; category_id: string; priority: JellyPriority }
export interface JellyPlan { id: string; title: string; source_type: "note" | "inspiration" | "text"; source_id: string | null; source_hash: string; source_text: string; selection?: { block_ids: string[]; text: string }; clarification_questions?: string[]; actions: JellyPlanAction[]; created_at: string }
