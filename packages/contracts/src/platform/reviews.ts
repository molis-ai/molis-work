import type { ActionSubject } from "./action-subjects.js";
import type { ActionProvider, ActionUserAction, StageSceneMetadataAuthority } from "./actions.js";
import type { OwnedTextRef } from "./ui-text.js";

/** The owner's current availability of an individual decision option. */
export type ReviewDecisionAvailability = { readonly available: true } | {
  readonly available: false;
  readonly code: string;
  readonly reason: OwnedTextRef;
};

type AgentReviewOwner = {
  readonly kind: "agent-review" | "goal-acceptance";
  readonly project_id: string;
  readonly plugin_id: string;
  readonly install_id: string;
};

/** The installation that owns a request, pinned by the platform once for the life of that request. */
export type ReviewOwner = AgentReviewOwner | {
  readonly kind: "trusted-decision";
  readonly project_id: string;
} & StageSceneMetadataAuthority["owner"];

/** A reference routes a review to its fact owner; it is never permission to decide or execute. */
export interface ReviewReference<Owner extends ReviewOwner = AgentReviewOwner> {
  readonly owner: Owner;
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
export interface ReviewDecisionRecord<Choice extends string = "approve" | "reject", Source extends ReviewDecisionSource = ReviewDecisionSource,
  Ref extends ReviewReference<ReviewOwner> = ReviewReference> {
  readonly reference: Ref;
  readonly decision: Choice;
  readonly actor_id: string;
  readonly decided_at: string;
  readonly note: string | null;
  readonly source: Source;
}

/** Each decision reference points to an immutable record owned by the original review. */
export interface ReviewDecisionReference {
  readonly reference: ReviewReference<ReviewOwner>;
  readonly decision_id: string;
}

/** The platform requires the original protected entry on every new trusted decision. */
export interface TrustedReviewDecisionRecord extends ReviewDecisionRecord<string,
  Extract<ReviewDecisionSource, { kind: "person" }> & {
    readonly entry: ActionUserAction & { readonly source: "web" | "management" };
  },
  ReviewReference<Extract<ReviewOwner, { kind: "trusted-decision" }>>> {
  readonly decision_id: string;
}

type ReviewTargetPartition = { readonly scope: "project"; readonly project_id: string } |
  { readonly scope: "home"; readonly project_id: string | null };

type ReviewTargetOwner = Pick<ActionProvider, "provider_id"> & ReviewTargetPartition & (
  | { readonly kind: "system" }
  | { readonly kind: "plugin" } & Omit<StageSceneMetadataAuthority["owner"], "scope">
);

/** Objective identity and visibility are independently established by the object's owner. */
export interface ReviewTarget {
  readonly owner: ReviewTargetOwner;
  readonly subject: Readonly<ActionSubject>;
  readonly version: string;
}

export type ReviewEvidence = { readonly target: ReviewTarget } & (
  | { readonly tier: "self_reported" | "machine_checked" }
  | { readonly tier: "person_accepted"; readonly decision: ReviewDecisionReference }
);

export interface ReviewRequirement {
  readonly id: string;
  readonly version: string;
  readonly target: ReviewTarget;
  readonly statement: string;
  readonly requires_person: boolean;
  readonly evidence: readonly ReviewEvidence[];
}

/** Owner projection of an original frozen request. Options and their availability carry no authority. */
export interface ReviewRequest {
  readonly reference: ReviewReference<ReviewOwner>;
  readonly target: ReviewTarget;
  readonly summary: string;
  readonly requirements: readonly ReviewRequirement[];
  readonly approver: { readonly kind: "person"; readonly actor_id?: string };
  readonly choices: readonly {
    readonly id: string;
    readonly label: OwnedTextRef;
    readonly availability: ReviewDecisionAvailability;
    readonly accepts: readonly string[];
    readonly returns: readonly string[];
  }[];
  readonly expires_at: string | null;
  readonly decision?: ReviewDecisionReference;
}
