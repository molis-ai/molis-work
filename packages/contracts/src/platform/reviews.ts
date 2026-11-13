/** A reference routes a review to its fact owner; it is never permission to decide or execute. */
export interface ReviewReference {
  readonly owner: {
    readonly kind: "agent-review" | "goal-acceptance";
    readonly project_id: string;
    readonly plugin_id: string;
    readonly install_id: string;
  };
  readonly id: string;
  /** The owner's frozen proposal/object version, independent of presentation and current permissions. */
  readonly version: string;
}

/** A finite delegation version and work lifetime, as read by its owner at the decision boundary. */
export interface ReviewDelegationReference {
  readonly id: string;
  readonly revision: number;
  readonly work_epoch: string;
  readonly grantor_id: string;
}

/** Host-produced facts. A page, model or plugin cannot select a source by submitting this shape. */
export type ReviewDecisionSource =
  | { readonly kind: "person"; readonly actor_id: string }
  | { readonly kind: "delegation"; readonly delegation: ReviewDelegationReference }
  | { readonly kind: "ai"; readonly delegation: ReviewDelegationReference;
      readonly assessment: { readonly id: string; readonly version: string; readonly provider_id: string; readonly model_id: string };
      readonly reason: string }
  | { readonly kind: "policy"; readonly owner: string; readonly id: string; readonly revision: number;
      readonly set_by: string; readonly set_at: string };

/** Decision and provenance are one fact. Absence of this fact is not evidence of a person's vote. */
export interface ReviewDecisionRecord {
  readonly reference: ReviewReference;
  readonly decision: "approve" | "reject";
  readonly actor_id: string;
  readonly decided_at: string;
  readonly note: string | null;
  readonly source: ReviewDecisionSource;
}
