import type { DatabaseSync } from "node:sqlite";
import { contentHash, metadata } from "./content.js";
import type { Draft, Material, Source } from "./types.js";

/** The source every saved draft belongs to. */
export const KNOWLEDGE_SOURCE: Source = { id: "knowledge", name: "知识库", kind: "markdown", locator: "knowledge", domain_id: null };

/** A draft row: the draft, plus the materials it was adopted as before that have since been deleted. */
export interface StoredDraft extends Draft { earlier_ids?: string[] }

/** The drafts people see: a draft counts as saved only while the material it was adopted as still exists. */
export function viewDrafts(db: DatabaseSync): Draft[] {
  const kept = new Set((db.prepare("SELECT id FROM cognia_materials").all() as Array<{ id: string }>).map(m => m.id));
  return db.prepare("SELECT body FROM cognia_drafts WHERE archived=0 ORDER BY rowid DESC").all().map(row => {
    const { earlier_ids: _earlier, ...draft } = JSON.parse((row as { body: string }).body) as StoredDraft;
    return draft.saved_id && !kept.has(draft.saved_id) ? { ...draft, saved_id: null } : draft;
  });
}

/** Whether the material (any version of it, deleted or not) was adopted from this draft, so the draft's sources are its sources. */
export const adoptedFrom = (draft: StoredDraft, materialId: string): boolean => draft.saved_id === materialId || draft.earlier_ids?.includes(materialId) === true;

/** The knowledge material a draft becomes when it is saved. */
export function adoptedMaterial(draft: Draft, id: string): Material {
  return { ...metadata(draft.body, draft.title), title: draft.title, id, source_id: KNOWLEDGE_SOURCE.id, path: id + ".md", domain_id: draft.domain_id, role: "wiki", revision: 1, hash: contentHash(draft.body), bytes: Buffer.byteLength(draft.body), body: draft.body, mime: "text/plain; charset=utf-8", updated_at: new Date().toISOString() };
}

/** The draft after it was adopted as a new material; the material it was adopted as before (deleted since) is remembered. */
export const adopted = (draft: StoredDraft, materialId: string): StoredDraft => ({ ...draft, saved_id: materialId, ...(draft.saved_id ? { earlier_ids: [...(draft.earlier_ids ?? []), draft.saved_id] } : {}) });
