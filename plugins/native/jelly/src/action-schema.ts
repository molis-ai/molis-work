import type { ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";

export const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
export const array = (items: ActionSchema): ActionSchema => ({ type: "array", items });
export const nullable = (schema: ActionSchema): ActionSchema => ({ anyOf: [schema, { type: "null" }] });
export const text = { type: "string" };
export const id = { type: "string", minLength: 1 };
export const boolean = { type: "boolean" };
export const revision = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
export const ids = { ...array(id), uniqueItems: true };
export const priority = { enum: ["P0", "P1", "P2", "none"] };
export const scheduleFields = { start_date: date, end_date: date, start_time: nullable({ type: "integer", minimum: 0, maximum: 1439 }), end_time: nullable({ type: "integer", minimum: 0, maximum: 1439 }) };
export const schedule = object(scheduleFields);
export const mutableItemFields = { kind: { enum: ["task", "event"] }, title: { ...id, pattern: "\\S" }, category_id: id, priority, pinned: boolean, ...scheduleFields, completion_description: text, notes: text, untimed_rank: { type: "number" } };
export const itemFields = { id, ...mutableItemFields, kind: { enum: ["task", "event"] }, completed_at: nullable(text), created_at: text, updated_at: text, time_zone: text };
export const item = object(itemFields);
// Creation owns generated timestamps; updates cannot change identity or completion state.
export const createItemFields = { id, ...mutableItemFields, completed_at: nullable(text), time_zone: text };
export const itemInput = object(createItemFields, ["title", "start_date"]);
export const itemPatch = object(mutableItemFields, []);
export const seriesFields = { weekdays: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 }, uniqueItems: true, minItems: 1 }, until: nullable(date) };
export const seriesInput = object({ ...createItemFields, ...seriesFields }, ["title", "start_date", "weekdays"]);
export const seriesPatch = object({ ...mutableItemFields, ...seriesFields }, []);
export const series = object({ ...itemFields, ...seriesFields,
  exceptions: { type: "object", additionalProperties: object({ deleted: boolean, patch: object(itemFields, []) }, []) },
  completions: { type: "object", additionalProperties: object({ completed_at: nullable(text), completion_description: text }) },
});
export const occurrence = object({ ...itemFields, series_id: nullable(id), original_date: nullable(date) });
export const categoryFields = { id, name: id, color: text, sort_index: revision };
export const category = object(categoryFields);
const blockFields = { id, kind: { enum: ["paragraph", "heading1", "heading2", "heading3", "bullet", "numbered", "task", "quote", "code", "divider", "link"] }, text,
  indent: { type: "integer", minimum: 0 }, completed_at: nullable(text), completion_description: text, language: text,
  inline_spans: array(object({ text, marks: array({ enum: ["bold", "italic", "code"] }), link_url: text }, ["text", "marks"])),
};
export const block = object(blockFields, ["id", "kind", "text", "indent", "completed_at", "completion_description"]);
export const blockInput = object(blockFields, []);
export const note = object({ id, title: text, category_id: id, blocks: array(block), pinned: boolean, archived_at: nullable(text), revision, created_at: text, updated_at: text });
export const noteInputFields = { title: text, category_id: id, blocks: array(blockInput), html: text, markdown: text };
const locator = { anyOf: [object({ kind: { const: "paragraph" }, index: revision }), object({ kind: { const: "page" }, number: { type: "integer", minimum: 1 } }), object({ kind: { const: "image" }, index: revision }), object({ kind: { const: "timestamp" }, start_seconds: { type: "number", minimum: 0 }, end_seconds: { type: "number", minimum: 0 } })] };
const confidence = nullable({ type: "number", minimum: 0, maximum: 1 });
const sha = { type: "string", pattern: "^[a-f0-9]{64}$" };
const coverageStatus = { enum: ["sufficient", "partial", "insufficient"] };
const coverage = object({ status: coverageStatus, processed: revision, expected: revision, issues: array(text) }, ["status", "processed", "issues"]);
export const material = object({ source_hash: sha, content_fingerprint: sha,
  blocks: array(object({ id, role: { enum: ["body", "transcript", "ocr", "metadata"] }, text, locator, confidence }, ["id", "role", "text", "locator"])),
  coverage, provider: text, acquired_at: text, attachment: object({ file_name: id, sha256: sha }),
}, ["source_hash", "content_fingerprint", "blocks", "coverage", "provider", "acquired_at"]);
// Original source adapters return different page/time locators; the material owner normalizes them.
export const extraction = object({ text, file_name: text, source_sha256: sha, extractor: text, provider: text,
  title: text, source_url: text, duration_seconds: { type: "number", minimum: 0 }, model_required: object({ approximate_bytes: revision, variant: text }, []),
  pages: array(object({ number: revision, page: revision, text, method: text, confidence }, ["text"])),
  segments: array(object({ start_seconds: { type: "number" }, end_seconds: { type: "number" }, startSeconds: { type: "number" }, endSeconds: { type: "number" }, start: { type: "number" }, end: { type: "number" }, text }, ["text"])),
  frames: array(object({ index: revision, seconds: { type: "number" }, start_seconds: { type: "number" }, end_seconds: { type: "number" }, text, confidence }, ["text"])),
  coverage: { anyOf: [coverageStatus, object({ status: coverageStatus, processed_pages: revision, total_pages: revision, processed: revision, expected: revision, issues: array(text) }, ["status"])] },
}, ["text"]);
const claim = object({ text, evidence_block_ids: array(id) });
export const structuredDigest = object({ thesis: claim, takeaways: array(claim), chapters: array(object({ title: text, anchor_block_id: id, points: array(claim) })), quotes: array(object({ text, evidence_block_id: id, speaker: text }, ["text", "evidence_block_id"])), dropped: array(claim) });
export const digest = object({ source_hash: sha, source_text: text, summary: text, snapshot: material, structured: structuredDigest, created_at: text, written_note_ids: ids }, ["source_hash", "source_text", "summary", "created_at", "written_note_ids"]);
export const inspirationInputFields = { input_kind: { enum: ["text", "url", "file"] }, title: text, raw_text: text, url: nullable(text), file_name: nullable(text), category_id: id, material: { anyOf: [material, extraction] } };
export const inspiration = object({ id, input_kind: inspirationInputFields.input_kind, title: text, raw_text: text, url: nullable(text), file_name: nullable(text), category_id: id, archived_at: nullable(text), note_id: nullable(id), digest: nullable(digest), material, created_at: text, updated_at: text }, ["id", "input_kind", "title", "raw_text", "url", "file_name", "category_id", "archived_at", "note_id", "digest", "created_at", "updated_at"]);
export const relationFields = { owner_id: id, original_date: nullable(date), note_id: id, role: { enum: ["primary", "reference"] } };
export const selection = object({ block_ids: ids, text });
export const plan = object({ id, title: text, source_type: { enum: ["note", "inspiration", "text"] }, source_id: nullable(id), source_hash: sha, source_text: text, selection, clarification_questions: array(text),
  actions: array(object({ id, title: id, notes: text, duration_minutes: { enum: [15, 30, 45, 60, 90] }, schedule: nullable(schedule), category_id: id, priority }, ["id", "title", "notes", "schedule", "category_id", "priority"])), created_at: text,
}, ["id", "title", "source_type", "source_id", "source_hash", "source_text", "actions", "created_at"]);
// Native Swift backups and Work exports have different versioned contracts. The import owner
// decodes and validates the complete source; consumers must pass the unchanged preview source.
export const importSource = { anyOf: [{ type: "string" }, { type: "object" }], description: "原 Jelly 或 Work 的完整 JSON 备份；提交时须与预览内容完全相同" };
export const workspace = object({ schema_version: { const: 1 }, revision, categories: array(category), items: array(item), series: array(series), notes: array(note), inspirations: array(inspiration), relations: array(object(relationFields)),
  relation_overrides: array(object({ owner_id: id, original_date: date, primary: text, added_reference_ids: ids, removed_reference_ids: ids })),
  task_links: array(object({ item_id: id, note_id: id, block_id: id })), applied_plan_ids: ids,
  imported_sources: array(object({ sha256: sha, schema_version: { type: "integer", minimum: 1 }, source: { type: "object" }, imported_at: text })),
}, ["schema_version", "revision", "categories", "items", "series", "notes", "inspirations", "relations", "task_links", "applied_plan_ids"]);
export const stateResult = object({ state: workspace });
export const preview = object({ confirmation_token: id, revision, counts: { type: "object", additionalProperties: { type: "integer" } }, warnings: array(text) });
