import type { ActionSubject } from "../platform/action-subjects.js";
import type { ReviewOwner, ReviewReference, TrustedReviewDecisionRecord } from "../platform/reviews.js";
import type { ContractDescriptor } from "../platform/package.js";

export const servicesProjectApprovalsContract = {
  contractId: /* @version contract.io.molis.work.service.project-approvals "io.molis.work.service.project-approvals.v{version}" */ "io.molis.work.service.project-approvals.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.project-approvals */ 1,
  maturity: "partial",
  ssot: "specs/agent-approval/spec.md",
} as const satisfies ContractDescriptor;

export type TrustedReviewReference = ReviewReference<Extract<ReviewOwner, { kind: "trusted-decision" }>>;

/** Exact saved request and option. A request body cannot supply the decision's actor, provenance, or target. */
export interface TrustedReviewCommand {
  readonly reference: TrustedReviewReference;
  readonly choice_id: string;
  readonly request_key: string;
  readonly note?: string;
}

/** A historical rule follows the object owner's publisher, across reinstall by that same publisher. */
export type ApprovalRuleOwner =
  | { readonly kind: "system"; readonly provider_id: string }
  | { readonly kind: "plugin"; readonly plugin_id: string; readonly publisher_signature: string };

export type ProjectApprovalRuleScope = { readonly kind: "project_default" } | {
  readonly kind: "ancestor_minimum" | "object";
  readonly owner: ApprovalRuleOwner;
  readonly subject: ActionSubject;
};

export interface ProjectApprovalRule {
  readonly id: string;
  readonly project_id: string;
  readonly scope: ProjectApprovalRuleScope;
  /** null preserves a binding that left this choice to the other applicable rules. */
  readonly requires_person: boolean | null;
  /** Project-default precedence is explicit so it survives export and restore. */
  readonly order: number;
  readonly revision: number;
  readonly state: "active" | "replaced" | "withdrawn";
  readonly created_by: string;
  readonly created_at: string;
  readonly reason: string;
  readonly changed_by: string | null;
  readonly changed_at: string | null;
  readonly change_reason: string | null;
}

export interface ProjectApprovalRules {
  readonly revision: string;
  readonly rules: readonly ProjectApprovalRule[];
}

export type ProjectTrustedDecision = TrustedReviewDecisionRecord & {
  readonly request_key: string;
  readonly choice_fingerprint: string;
};

/** Original pre-transfer facts have their own provenance. They cannot become a new protected request. */
export interface ProjectDecisionHistory {
  readonly kind: "history";
  readonly decision_id: string;
  readonly project_id: string;
  readonly owner: Extract<ApprovalRuleOwner, { kind: "plugin" }>;
  readonly subject: "event" | "proposal-item";
  readonly recorded_at: string;
  readonly original: Readonly<Record<string, string | number | null>>;
}
