import {
  type ActionProposal,
  type Annotation,
  type AnnotationTarget,
  applyActionProposal,
  assertValidAnnotation,
  resolveAnnotation,
} from "../../domain/calibration/calibration.js";
import type { SqliteDatabase } from "./open-database.js";

interface AnnotationRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  target_kind: AnnotationTarget["kind"];
  object_id: string;
  target_revision: number;
  block_id: string;
  quoted_snapshot: string;
  comment: string;
  status: Annotation["status"];
  created_at: string;
  resolved_at: string | null;
}

interface ProposalRow {
  id: string;
  workspace_id: string;
  actor_id: string;
  source_kind: ActionProposal["source"]["kind"];
  source_id: string;
  action_kind: ActionProposal["action"];
  target_json: string;
  summary: string;
  diff_json: string;
  version_impact: string;
  cost_impact: string;
  memory_impact: string;
  payload_json: string;
  status: ActionProposal["status"];
  created_at: string;
  applied_at: string | null;
  rejected_at: string | null;
}

export class SqliteCalibrationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createAnnotation(annotation: Annotation): Annotation {
    assertValidAnnotation(annotation);
    this.database
      .prepare(
        `INSERT INTO annotations
         (id, workspace_id, actor_id, target_kind, object_id, target_revision, block_id,
          quoted_snapshot, comment, status, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        annotation.id,
        annotation.workspaceId,
        annotation.actorId,
        annotation.target.kind,
        annotation.target.objectId,
        annotation.target.revision,
        annotation.target.blockId,
        annotation.quotedSnapshot,
        annotation.comment,
        annotation.status,
        annotation.createdAt,
        annotation.resolvedAt ?? null,
      );
    return annotation;
  }

  getAnnotation(id: string): Annotation | undefined {
    const row = this.database.prepare("SELECT * FROM annotations WHERE id = ?").get(id) as
      | AnnotationRow
      | undefined;
    return row ? mapAnnotation(row) : undefined;
  }

  listAnnotations(target: AnnotationTarget): Annotation[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM annotations
         WHERE target_kind = ? AND object_id = ? AND target_revision = ?
         ORDER BY created_at, id`,
      )
      .all(target.kind, target.objectId, target.revision) as AnnotationRow[];
    return rows.map(mapAnnotation);
  }

  markAnnotationResolved(id: string, now: string): Annotation {
    const annotation = this.getAnnotation(id);
    if (!annotation) throw new Error("ANNOTATION_NOT_FOUND");
    const resolved = resolveAnnotation(annotation, now);
    const result = this.database
      .prepare("UPDATE annotations SET status = 'resolved', resolved_at = ? WHERE id = ? AND status = 'open'")
      .run(now, id);
    if (result.changes !== 1) throw new Error("ANNOTATION_ALREADY_RESOLVED");
    return resolved;
  }

  createProposal(proposal: ActionProposal, payload: unknown): ActionProposal {
    this.database
      .prepare(
        `INSERT INTO action_proposals
         (id, workspace_id, actor_id, source_kind, source_id, action_kind, target_json,
          summary, diff_json, version_impact, cost_impact, memory_impact, payload_json,
          status, created_at, applied_at, rejected_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        proposal.id,
        proposal.workspaceId,
        proposal.actorId,
        proposal.source.kind,
        proposal.source.id,
        proposal.action,
        JSON.stringify(proposal.target),
        proposal.summary,
        JSON.stringify(proposal.diff),
        proposal.versionImpact,
        proposal.costImpact,
        proposal.memoryImpact,
        JSON.stringify(payload),
        proposal.status,
        proposal.createdAt,
        proposal.appliedAt ?? null,
        proposal.rejectedAt ?? null,
      );
    return proposal;
  }

  getProposal(id: string): { proposal: ActionProposal; payload: unknown } | undefined {
    const row = this.database.prepare("SELECT * FROM action_proposals WHERE id = ?").get(id) as
      | ProposalRow
      | undefined;
    return row ? { proposal: mapProposal(row), payload: JSON.parse(row.payload_json) as unknown } : undefined;
  }

  markProposalApplied(id: string, now: string): ActionProposal {
    const stored = this.getProposal(id);
    if (!stored) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
    const applied = applyActionProposal(stored.proposal, now);
    const result = this.database
      .prepare(
        "UPDATE action_proposals SET status = 'applied', applied_at = ? WHERE id = ? AND status = 'pending'",
      )
      .run(now, id);
    if (result.changes !== 1) throw new Error("ACTION_PROPOSAL_NOT_PENDING");
    return applied;
  }
}

function mapAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    target: {
      kind: row.target_kind,
      objectId: row.object_id,
      revision: row.target_revision,
      blockId: row.block_id,
    },
    quotedSnapshot: row.quoted_snapshot,
    comment: row.comment,
    status: row.status,
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
  } as Annotation;
}

function mapProposal(row: ProposalRow): ActionProposal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actorId: row.actor_id,
    source: { kind: row.source_kind, id: row.source_id },
    action: row.action_kind,
    target: JSON.parse(row.target_json) as AnnotationTarget,
    summary: row.summary,
    diff: JSON.parse(row.diff_json) as ActionProposal["diff"],
    versionImpact: row.version_impact,
    costImpact: row.cost_impact,
    memoryImpact: row.memory_impact,
    status: row.status,
    createdAt: row.created_at,
    ...(row.applied_at ? { appliedAt: row.applied_at } : {}),
    ...(row.rejected_at ? { rejectedAt: row.rejected_at } : {}),
  };
}
