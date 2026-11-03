import { text, count, boolean, object, array, enumeration } from "./goal-event-action-schemas.js";

export const guidanceKindSchema = enumeration(["context", "requirement", "constraint", "convention", "workflow", "quality_bar"]);
export const guidanceCommonSchema = { guidance_id: text, project_id: text, revision: count, active: boolean, kind: guidanceKindSchema, content: text,
  content_hash: text, source_refs: array(text), confirmation_summary: text, reason: text, created_at: text };
export const projectGuidanceEntrySchema = object({ ...guidanceCommonSchema, position: count, created_by: text, updated_by: text, updated_at: text });
export const projectGuidanceRevisionSchema = object({ ...guidanceCommonSchema, revision_id: text, changed_by: text,
  change_kind: enumeration(["created", "edited", "deactivated", "restored"]) });
