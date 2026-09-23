export type AnnotationTarget =
  | { kind: "idea_brief"; objectId: string; revision: number; blockId: string }
  | { kind: "lens_report"; objectId: string; revision: number; blockId: string }
  | { kind: "pulse_report"; objectId: string; revision: number; blockId: string };

export interface Annotation {
  id: string;
  workspaceId: string;
  actorId: string;
  target: AnnotationTarget;
  quotedSnapshot: string;
  comment: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

export type ProposalSource = {
  kind: "annotation" | "conversation" | "direct";
  id: string;
};

export interface ProposalDiff {
  field: string;
  before: string;
  after: string;
}

export interface ActionProposal {
  id: string;
  workspaceId: string;
  actorId: string;
  source: ProposalSource;
  action: "create_playbook_rule" | "create_taste_rule" | "revise_idea";
  target: AnnotationTarget;
  summary: string;
  diff: readonly ProposalDiff[];
  versionImpact: string;
  costImpact: string;
  memoryImpact: string;
  status: "pending" | "applied" | "rejected";
  createdAt: string;
  appliedAt?: string;
  rejectedAt?: string;
}

export class CalibrationStateError extends Error {
  readonly name = "CalibrationStateError";
}

export function assertValidAnnotation(annotation: Annotation): Annotation {
  if (!annotation.quotedSnapshot.trim()) throw new CalibrationStateError("ANNOTATION_QUOTE_REQUIRED");
  if (!annotation.comment.trim()) throw new CalibrationStateError("ANNOTATION_COMMENT_REQUIRED");
  if (!Number.isInteger(annotation.target.revision) || annotation.target.revision < 1) {
    throw new CalibrationStateError("ANNOTATION_REVISION_INVALID");
  }
  if (!annotation.target.objectId.trim() || !annotation.target.blockId.trim()) {
    throw new CalibrationStateError("ANNOTATION_TARGET_INVALID");
  }
  return annotation;
}

export function resolveAnnotation(annotation: Annotation, now: string): Annotation {
  if (annotation.status !== "open") {
    throw new CalibrationStateError("ANNOTATION_ALREADY_RESOLVED");
  }
  return { ...annotation, status: "resolved", resolvedAt: now };
}

export function applyActionProposal(proposal: ActionProposal, now: string): ActionProposal {
  if (proposal.status !== "pending") {
    throw new CalibrationStateError("ACTION_PROPOSAL_NOT_PENDING");
  }
  return { ...proposal, status: "applied", appliedAt: now };
}

export function rejectActionProposal(proposal: ActionProposal, now: string): ActionProposal {
  if (proposal.status !== "pending") {
    throw new CalibrationStateError("ACTION_PROPOSAL_NOT_PENDING");
  }
  return { ...proposal, status: "rejected", rejectedAt: now };
}
