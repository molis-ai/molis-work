import type { ActionSubject } from "../platform/action-subjects.js";
import type { ActionReference } from "../platform/actions.js";
import type { ReviewOwner, ReviewReference, ReviewRequest, ReviewRequirement, ReviewTarget, TrustedReviewDecisionRecord } from "../platform/reviews.js";
import type { ContractDescriptor } from "../platform/package.js";

export const servicesProjectApprovalsContract = {
  contractId: /* @version contract.io.molis.work.service.project-approvals "io.molis.work.service.project-approvals.v{version}" */ "io.molis.work.service.project-approvals.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.project-approvals */ 1,
  maturity: "partial",
  ssot: "specs/agent-approval/spec.md",
} as const satisfies ContractDescriptor;

export type TrustedReviewReference = ReviewReference<Extract<ReviewOwner, { kind: "trusted-decision" }> & { readonly scope: "project" }>;

export type { TrustedReviewRow } from "./trusted-review-row.js";

/** Exact saved request and option. A request body cannot supply the decision's actor, provenance, or target. */
export interface TrustedReviewCommand {
  readonly reference: TrustedReviewReference;
  readonly choice_id: string;
  readonly request_key: string;
  readonly note?: string;
}

/** Locate the owner's current, read-only review. The Host attaches its actual installation and project. */
export interface TrustedReviewLookup {
  readonly action: Required<ActionReference>;
  readonly request_id: string;
  /** An owner may inspect the person's unsaved choice. It is neither a receipt nor an approval. */
  readonly draft?: Readonly<Record<string, unknown>>;
}

export type TrustedReviewRead = TrustedReviewLookup | { readonly reference: TrustedReviewReference };

/** Output of the original command owner's declared review query. Option inputs remain within Host dispatch. */
export interface TrustedReviewOffer {
  readonly request: Omit<ReviewRequest, "reference" | "decision" | "target">;
  readonly target: { readonly subject: ActionSubject; readonly version: string };
  readonly commands: Readonly<Record<string, unknown>>;
  /** For objects with several distinct decision rounds, the owner gives each round its own immutable request ID. */
  readonly round_id?: string;
  /** Explicit whole-object choices shown by this offer. The Host pins the subject on the original person's entry. */
  readonly whole_choices?: readonly string[];
}

const id = { type: "string", minLength: 1, maxLength: 240, pattern: "\\S" } as const;
const projectOwner = {
  oneOf: [
    { type: "object", properties: { kind: { const: "trusted-decision" }, project_id: id,
      scope: { const: "project" }, plugin_id: id, install_id: id, installation_generation: id },
      required: ["kind", "project_id", "scope", "plugin_id", "install_id", "installation_generation"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "trusted-decision" }, project_id: id,
      scope: { const: "project" }, provider_id: id },
      required: ["kind", "project_id", "scope", "provider_id"], additionalProperties: false },
  ],
} as const;
const reference = { type: "object", properties: { owner: projectOwner, id: { ...id, maxLength: 2800 }, version: id },
  required: ["owner", "id", "version"], additionalProperties: false } as const;
export const TRUSTED_REVIEW_COMMAND_SCHEMA = { type: "object", properties: {
  reference,
  choice_id: id, request_key: id, note: { type: "string", maxLength: 2000 },
}, required: ["reference", "choice_id", "request_key"], additionalProperties: false } as const;
export const TRUSTED_REVIEW_LOOKUP_SCHEMA = { type: "object", properties: {
  action: { type: "object", properties: { capability_id: id, version: { type: "integer", minimum: 1 }, provider_id: id },
    required: ["capability_id", "version", "provider_id"], additionalProperties: false }, request_id: id, draft: { type: "object" },
}, required: ["action", "request_id"], additionalProperties: false } as const;
export const TRUSTED_REVIEW_READ_SCHEMA = { type: "object", properties: { ...TRUSTED_REVIEW_LOOKUP_SCHEMA.properties, reference },
  oneOf: [
    { required: ["action", "request_id"], not: { required: ["reference"] } },
    { required: ["reference"], not: { anyOf: [{ required: ["action"] }, { required: ["request_id"] }, { required: ["draft"] }] } },
  ], additionalProperties: false,
} as const;
export const TRUSTED_REVIEW_OWNER_INPUT_SCHEMA = { type: "object", properties: { request_id: { type: "string", minLength: 1, maxLength: 240 } },
  required: ["request_id"], additionalProperties: false } as const;
export const TRUSTED_REVIEW_OWNER_DRAFT_INPUT_SCHEMA = { ...TRUSTED_REVIEW_OWNER_INPUT_SCHEMA, properties: {
  ...TRUSTED_REVIEW_OWNER_INPUT_SCHEMA.properties, draft: { type: "object" },
} } as const;

export const trustedReviewActions = {
  read: { capability_id: "project.approvals.request.read", version: /* @version action.project.approvals.request.read */ 1 },
  decide: { capability_id: "project.approvals.request.decide", version: /* @version action.project.approvals.request.decide */ 1 },
} as const;

/** A historical rule follows the object owner's publisher, across reinstall by that same publisher. */
export type ApprovalRuleOwner =
  | { readonly kind: "system"; readonly provider_id: string }
  | { readonly kind: "plugin"; readonly plugin_id: string; readonly publisher_signature: string };

export type ProjectApprovalRuleScope = { readonly kind: "project_default"; readonly owner?: ApprovalRuleOwner } | {
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

export interface ProjectApprovalRulePage extends ProjectApprovalRules {
  readonly project_default_requires_person: boolean;
  readonly next_cursor: { readonly order: number; readonly id: string } | null;
}

export type ProjectApprovalRuleChange = { readonly expected_revision: string; readonly reason: string } & (
  | { readonly kind: "set"; readonly scope: { readonly kind: "project_default" }; readonly requires_person: boolean }
  | { readonly kind: "withdraw"; readonly id: string }
);

export const PROJECT_APPROVAL_RULE_FILTER_SCHEMA = { type: "object", properties: {
  cursor: { type: "object", properties: { order: { type: "integer", minimum: 1 }, id }, required: ["order", "id"], additionalProperties: false },
}, additionalProperties: false } as const;
const ruleReason = { type: "string", minLength: 1, maxLength: 2000, pattern: "\\S" } as const;
export const PROJECT_APPROVAL_RULE_CHANGE_SCHEMA = {
  type: "object", properties: {
    expected_revision: id, reason: ruleReason, kind: { enum: ["set", "withdraw"] }, id,
    requires_person: { type: "boolean" },
    scope: { type: "object", properties: { kind: { const: "project_default" } }, required: ["kind"], additionalProperties: false },
  },
  required: ["expected_revision", "reason", "kind"], additionalProperties: false,
  oneOf: [
    { properties: { kind: { const: "set" } }, required: ["scope", "requires_person"], not: { required: ["id"] } },
    { properties: { kind: { const: "withdraw" } }, required: ["id"], not: { anyOf: [{ required: ["scope"] }, { required: ["requires_person"] }] } },
  ],
} as const;

export const projectApprovalRuleActions = {
  read: { capability_id: "project.approvals.rules.read", version: /* @version action.project.approvals.rules.read */ 1 },
  change: { capability_id: "project.approvals.rules.change", version: /* @version action.project.approvals.rules.change */ 1 },
} as const;

export type ProjectTrustedDecision = TrustedReviewDecisionRecord & {
  readonly request_key: string;
  readonly choice_fingerprint: string;
  /** Digest of the original owner's applied facts, when its sync stream carries them separately. */
  readonly outcome_digest?: string;
  readonly publisher_signature: string;
  readonly review: ProjectReviewCoverage;
  /** The reviewed facts and labels the person saw, for reopening the exact decision after the owner's current state moves. */
  readonly presentation?: TrustedReviewOffer["request"];
};

/** The selected option's exact targets and evidence. Command payloads stay with the original business owner. */
export interface ProjectReviewCoverage {
  readonly target: ReviewTarget;
  readonly requirements: readonly (Pick<ReviewRequirement, "id" | "version" | "target" | "evidence"> &
    { readonly disposition: "accepted" | "returned" })[];
}
