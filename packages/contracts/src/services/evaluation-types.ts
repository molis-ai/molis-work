import type { ModelApiFormat } from "../modules/model-providers.js";
import type {
  ObservationMissingReason,
  ObservationOutcome,
  ObservationOwnerVersionRef,
  ObservationQueryInput,
  ObservationSnapshotRef,
  ObservationSourceClass,
  ObservationSubjectResolutionStatus,
} from "./observation.js";

/** Tuning samples and independent validation samples must stay separable (PWA-54). */
export const EVALUATION_SAMPLE_PURPOSES = ["tuning", "validation"] as const;
export type EvaluationSamplePurpose = (typeof EVALUATION_SAMPLE_PURPOSES)[number];

/** End-to-end evaluation covers direct plugin work, assistant work, workflows, scheduled work, and interleaved combinations (PWA-51). */
export const EVALUATION_WORK_MODES = ["manual_plugin", "assistant", "workflow", "schedule", "mixed"] as const;
export type EvaluationWorkMode = (typeof EVALUATION_WORK_MODES)[number];

/** Six work stages used to localize failures and cross-version differences (PWA-51, PWA-54). */
export const EVALUATION_STAGES = ["understanding", "materials", "skill", "interaction", "execution", "delivery"] as const;
export type EvaluationStage = (typeof EVALUATION_STAGES)[number];

/** Explicit provenance of how a run was produced; one mode never masquerades as another (PWA-53). */
export const EVALUATION_EXECUTION_KINDS = ["evidence_audit", "isolated_replay", "simulated", "live_model"] as const;
export type EvaluationExecutionKind = (typeof EVALUATION_EXECUTION_KINDS)[number];

export const EVALUATION_VERDICTS = ["passed", "failed", "unknown"] as const;
export type EvaluationVerdict = (typeof EVALUATION_VERDICTS)[number];

export const EVALUATION_JUDGMENT_SOURCES = ["deterministic", "evaluator", "human_reference"] as const;
export type EvaluationJudgmentSource = (typeof EVALUATION_JUDGMENT_SOURCES)[number];

/** Structured reasons why an expectation or run is `unknown` rather than `failed` or `passed` (OCL-08, OCL-14, PWA-55, PWA-56). */
export const EVALUATION_UNKNOWN_REASONS = [
  "coverage_gap_expired",
  "coverage_gap_paused",
  "coverage_gap_purged",
  "coverage_gap_lost",
  "no_matching_records",
  "evidence_missing",
  "unexposed",
  "window_incomplete",
  "awaiting_human_review",
] as const;
export type EvaluationUnknownReason = (typeof EVALUATION_UNKNOWN_REASONS)[number];

export const EVALUATION_OPPORTUNITY_POSTURES = ["act", "clarify", "continue", "quiet"] as const;
export type EvaluationOpportunityPosture = (typeof EVALUATION_OPPORTUNITY_POSTURES)[number];

export const EVALUATION_FUNNEL_STAGES = ["presented", "viewed", "selected", "executed", "completed", "adopted"] as const;
export type EvaluationFunnelStage = (typeof EVALUATION_FUNNEL_STAGES)[number];

export interface EvaluationEvidencePointer {
  readonly record_id: string;
  readonly seq: number;
  readonly fact: string;
  readonly occurred_at: string;
  readonly outcome: ObservationOutcome;
  readonly source_class: ObservationSourceClass;
  readonly role?: string;
  readonly snapshot?: ObservationSnapshotRef;
  readonly owner_ref?: ObservationOwnerVersionRef;
  readonly owner_resolvable?: ObservationSubjectResolutionStatus;
  readonly missing_reason?: ObservationMissingReason;
}

export interface EvaluationDeterministicRule {
  readonly check:
    | "record_count"
    | "stage_sequence"
    | "distinct_owner_versions"
    | "evidence_text"
    | "evidence_absent"
    | "parent_invocation_linked"
    | "no_self_certifying_success"
    | "funnel_stage_separation"
    | "source_isolation"
    | "interleaved_isolation";
  readonly fact?: string;
  readonly facts?: readonly string[];
  readonly outcomes?: readonly ObservationOutcome[];
  readonly source_classes?: readonly ObservationSourceClass[];
  readonly actor_id?: string;
  readonly subject_kind?: string;
  readonly subject_id?: string;
  readonly evidence_role?: string;
  readonly contains_all?: readonly string[];
  readonly forbids_any?: readonly string[];
  readonly detail_equals?: Readonly<Record<string, string | number | boolean>>;
  readonly min_count?: number;
  readonly max_count?: number;
  readonly min_distinct_versions?: number;
  readonly require_exposure_for_feedback?: boolean;
  readonly primary_work_ref?: string;
  readonly secondary_work_ref?: string;
}

export interface EvaluationEvaluatorRule {
  readonly evaluator_id: string;
  readonly evaluator_version: string;
  readonly rubric: string;
  readonly expected_posture?: EvaluationOpportunityPosture;
  readonly required_facts?: readonly string[];
  readonly required_skill_ids?: readonly string[];
  readonly required_evidence_terms?: readonly string[];
  readonly forbidden_evidence_terms?: readonly string[];
  readonly forbidden_facts?: readonly string[];
  readonly acceptable_outcomes?: readonly ObservationOutcome[];
  readonly allowed_variations?: readonly string[];
}

export interface EvaluationHumanReferenceRule {
  readonly reference_id: string;
  readonly guidance: string;
  readonly expected_verdict?: EvaluationVerdict;
}

export type EvaluationExpectation =
  | {
      readonly expectation_id: string;
      readonly stage: EvaluationStage;
      readonly description: string;
      readonly source: "deterministic";
      readonly required_evidence?: boolean;
      readonly rule: EvaluationDeterministicRule;
    }
  | {
      readonly expectation_id: string;
      readonly stage: EvaluationStage;
      readonly description: string;
      readonly source: "evaluator";
      readonly required_evidence?: boolean;
      readonly rule: EvaluationEvaluatorRule;
    }
  | {
      readonly expectation_id: string;
      readonly stage: EvaluationStage;
      readonly description: string;
      readonly source: "human_reference";
      readonly required_evidence?: boolean;
      readonly rule: EvaluationHumanReferenceRule;
    };

export interface EvaluationOpportunityBasis {
  readonly source: "independent_fixture" | "human_audit" | "rule";
  readonly description: string;
  readonly expected_posture: EvaluationOpportunityPosture;
  readonly candidate_refs?: readonly string[];
}

export interface EvaluationConditionBaseline {
  readonly platform_version?: string;
  readonly model?: { readonly provider: string; readonly model_id: string; readonly api_format?: ModelApiFormat };
  readonly skills?: readonly { readonly id: string; readonly version: string | number }[];
  readonly plugins?: Readonly<Record<string, string>>;
}

export interface EvaluationSampleWindow {
  readonly since?: string;
  readonly until?: string;
  /** Feedback or downstream rework cannot be scored as pass/fail until `evaluated_at >= observation_cutoff_at` (PWA-55, PWA-56). */
  readonly observation_cutoff_at?: string;
}

export interface EvaluationSampleInput {
  readonly sample_id: string;
  readonly version: number;
  readonly title: string;
  readonly purpose: EvaluationSamplePurpose;
  readonly work_mode: EvaluationWorkMode;
  readonly project_id?: string | null;
  readonly case_ref?: string;
  readonly initial_intent: string;
  readonly query: Omit<ObservationQueryInput, "use">;
  readonly window?: EvaluationSampleWindow;
  readonly opportunity_basis?: EvaluationOpportunityBasis;
  readonly baseline_conditions?: EvaluationConditionBaseline;
  readonly allowed_variations?: readonly string[];
  readonly expectations: readonly EvaluationExpectation[];
  readonly hold_records?: boolean;
  readonly hold_expires_at?: string | null;
  readonly pinned_record_ids?: readonly string[];
}

export interface EvaluationSampleView extends EvaluationSampleInput {
  readonly frozen_digest: string;
  readonly hold_id: string | null;
  readonly held_record_count: number;
  readonly created_at: string;
}

export interface EvaluationSamplePutOutput {
  readonly sample: EvaluationSampleView;
  readonly created: boolean;
}

export interface EvaluationSampleListInput {
  readonly project_id?: string | null;
  readonly purpose?: EvaluationSamplePurpose;
  readonly work_mode?: EvaluationWorkMode;
  readonly sample_id?: string;
  readonly all_versions?: boolean;
}

export interface EvaluationSampleListOutput {
  readonly samples: readonly EvaluationSampleView[];
}

export interface EvaluationSampleRemoveInput {
  readonly sample_id: string;
  readonly version?: number;
  readonly release_holds?: boolean;
}

export interface EvaluationSampleRemoveOutput {
  readonly removed_versions: readonly number[];
  readonly released_hold_ids: readonly string[];
}

export interface EvaluationExpectationResult {
  readonly expectation_id: string;
  readonly stage: EvaluationStage;
  readonly source: EvaluationJudgmentSource;
  readonly rule_id: string;
  readonly rule_version: string;
  readonly automated_verdict: EvaluationVerdict;
  readonly effective_verdict: EvaluationVerdict;
  readonly verdict_source: "automated" | "human_review";
  readonly unknown_reasons: readonly EvaluationUnknownReason[];
  readonly rationale: string;
  readonly evidence_refs: readonly EvaluationEvidencePointer[];
}

export interface EvaluationObservedConditions {
  readonly platform_versions: readonly string[];
  readonly models: readonly { readonly provider: string; readonly model_id: string }[];
  readonly skills: readonly { readonly id: string; readonly version: string }[];
  readonly plugins: Readonly<Record<string, string>>;
  readonly record_count: number;
  readonly source_classes: readonly ObservationSourceClass[];
}

export interface EvaluationHumanReview {
  readonly review_id: string;
  readonly run_id: string;
  readonly expectation_id: string | null;
  readonly reviewer_actor_id: string;
  readonly verdict: EvaluationVerdict;
  readonly stage?: EvaluationStage;
  readonly rationale: string;
  readonly cited_record_ids: readonly string[];
  readonly created_at: string;
}

export interface EvaluationReplayReceipt {
  readonly replay_id: string;
  readonly source_class: "replay";
  readonly blocked_external_effects: readonly { readonly capability_id: string; readonly reason: string }[];
  readonly replay_record_ids: readonly string[];
}

export interface EvaluationFunnelCounts {
  readonly presented: number;
  readonly viewed: number;
  readonly selected: number;
  readonly executed: number;
  readonly completed: number;
  readonly adopted: number;
  readonly modified_after_adoption: number;
  readonly undone_or_reworked: number;
}

export interface EvaluationRunView {
  readonly run_id: string;
  readonly sample_id: string;
  readonly sample_version: number;
  readonly sample_purpose: EvaluationSamplePurpose;
  readonly work_mode: EvaluationWorkMode;
  readonly project_id: string | null;
  readonly execution_kind: EvaluationExecutionKind;
  readonly model_run_info?: {
    readonly mode: "none" | "stand_in" | "live";
    readonly provider?: string;
    readonly model_id?: string;
    readonly api_format?: ModelApiFormat;
  };
  readonly replay?: EvaluationReplayReceipt;
  readonly automated_verdict: EvaluationVerdict;
  readonly effective_verdict: EvaluationVerdict;
  readonly verdict_source: "automated" | "human_review";
  readonly unknown_reasons: readonly EvaluationUnknownReason[];
  readonly failed_stages: readonly EvaluationStage[];
  readonly coverage_limitations: readonly string[];
  readonly observed_conditions: EvaluationObservedConditions;
  readonly funnel: EvaluationFunnelCounts;
  readonly expectation_results: readonly EvaluationExpectationResult[];
  readonly human_reviews: readonly EvaluationHumanReview[];
  readonly evaluated_at: string;
  readonly duration_ms: number;
}

export interface EvaluationRunExecuteInput {
  readonly sample_id: string;
  readonly sample_version?: number;
  readonly execution_kind?: EvaluationExecutionKind;
  readonly replay_scenario_id?: string;
  readonly model_run_info?: {
    readonly mode: "none" | "stand_in" | "live";
    readonly provider?: string;
    readonly model_id?: string;
    readonly api_format?: ModelApiFormat;
  };
  readonly hold_records?: boolean;
}

export interface EvaluationRunGetInput {
  readonly run_id: string;
}

export interface EvaluationRunListInput {
  readonly sample_id?: string;
  readonly project_id?: string | null;
  readonly purpose?: EvaluationSamplePurpose;
  readonly execution_kind?: EvaluationExecutionKind;
  readonly verdict?: EvaluationVerdict;
  readonly limit?: number;
}

export interface EvaluationRunListOutput {
  readonly runs: readonly EvaluationRunView[];
}

export interface EvaluationRunCompareInput {
  readonly baseline_run_id: string;
  readonly candidate_run_id: string;
}

export interface EvaluationRunComparison {
  readonly sample_id: string;
  readonly baseline_run_id: string;
  readonly candidate_run_id: string;
  readonly comparable: boolean;
  readonly shared_conditions: readonly string[];
  readonly incomparable_differences: readonly string[];
  readonly verdict_change: { readonly from: EvaluationVerdict; readonly to: EvaluationVerdict };
  readonly stage_diffs: readonly {
    readonly stage: EvaluationStage;
    readonly baseline_verdict: EvaluationVerdict;
    readonly candidate_verdict: EvaluationVerdict;
    readonly changed_expectation_ids: readonly string[];
    readonly summary: string;
  }[];
}

export interface EvaluationReviewRecordInput {
  readonly run_id: string;
  readonly expectation_id?: string | null;
  readonly verdict: EvaluationVerdict;
  readonly stage?: EvaluationStage;
  readonly rationale: string;
  readonly cited_record_ids?: readonly string[];
}

export interface EvaluationReviewRecordOutput {
  readonly review: EvaluationHumanReview;
  readonly run: EvaluationRunView;
}

export interface EvaluationMetricsSummarizeInput {
  readonly purpose: EvaluationSamplePurpose;
  readonly project_id?: string | null;
  readonly work_mode?: EvaluationWorkMode;
  readonly execution_kind?: EvaluationExecutionKind;
  readonly since?: string;
  readonly until?: string;
}

export interface EvaluationMetricsSummary {
  readonly purpose: EvaluationSamplePurpose;
  readonly window: { readonly since: string | null; readonly until: string | null };
  readonly sample_count: number;
  readonly denominator: number;
  readonly evaluable_count: number;
  readonly evaluable_ratio: number;
  readonly verdict_counts: Readonly<Record<EvaluationVerdict, number>>;
  readonly unknown_reason_counts: Readonly<Partial<Record<EvaluationUnknownReason, number>>>;
  readonly work_outcome_counts: Readonly<Partial<Record<ObservationOutcome, number>>>;
  readonly funnel_totals: EvaluationFunnelCounts;
  readonly by_work_mode: readonly {
    readonly work_mode: EvaluationWorkMode;
    readonly denominator: number;
    readonly passed: number;
    readonly failed: number;
    readonly unknown: number;
  }[];
}
