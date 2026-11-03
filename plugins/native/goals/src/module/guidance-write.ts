import { createHash, randomUUID } from "node:crypto";

import type {
  ProjectGuidanceKind,
  ProjectGuidanceRevisionRecord,
} from "../contract/goals.js";

import { sqliteJson, type GoalsRepository } from "./repository.js";

export interface GuidanceRevisionWrite {
  projectId: string;
  actorId: string;
  guidanceId: string;
  revision: number;
  kind: ProjectGuidanceKind;
  content: string;
  contentHash: string;
  sourceRefs: string[];
  active: boolean;
  changeKind: ProjectGuidanceRevisionRecord["change_kind"];
  confirmationSummary: string;
  reason: string;
  at: string;
  eventType: string;
  eventPayload: Record<string, unknown>;
}

export function guidanceContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * The tail every guidance write shares, inside the caller's transaction: the revision row, the board's `updated_at`, and the journal
 * event. The entry row itself is written by the caller (an insert for `add`, an update for `update`).
 */
export function writeGuidanceRevision(
  repository: GoalsRepository,
  write: GuidanceRevisionWrite,
): { revisionId: string; cursor: number } {
  const revisionId = randomUUID();
  repository.db.prepare(`
    INSERT INTO project_guidance_revisions (
      revision_id, guidance_id, project_id, revision, kind, content, content_hash,
      source_refs_json, active, changed_by, change_kind, confirmation_summary, reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    revisionId,
    write.guidanceId,
    write.projectId,
    write.revision,
    write.kind,
    write.content,
    write.contentHash,
    sqliteJson(write.sourceRefs),
    write.active ? 1 : 0,
    write.actorId,
    write.changeKind,
    write.confirmationSummary,
    write.reason,
    write.at,
  );
  repository.db.prepare("UPDATE boards SET updated_at = ? WHERE project_id = ?")
    .run(write.at, write.projectId);
  const cursor = repository.appendEvent({
    eventId: randomUUID(),
    projectId: write.projectId,
    actorId: write.actorId,
    type: write.eventType,
    objectType: "project_guidance",
    objectId: write.guidanceId,
    reason: write.reason,
    payload: write.eventPayload,
    at: write.at,
  });
  return { revisionId, cursor };
}
