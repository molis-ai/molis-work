import { createHash } from "node:crypto";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  evaluationActions,
  type EvaluationMetricsSummary,
  type EvaluationRunComparison,
  type EvaluationStage,
  type EvaluationUnknownReason,
  type EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { bootAndSeedEvaluationWorkload, type WorkloadModelConfig } from "./workload.mjs";
import { buildCanonicalEvaluationSuite } from "./suite.mjs";

export interface EvaluationCaseOutcome {
  readonly sample_id: string;
  readonly case_ref: string | null;
  readonly purpose: "tuning" | "validation";
  readonly expected_verdict: EvaluationVerdict;
  readonly observed_verdict: EvaluationVerdict;
  readonly matched_expectation: boolean;
  readonly failed_stages: readonly EvaluationStage[];
  readonly unknown_reasons: readonly EvaluationUnknownReason[];
  readonly matched_record_count: number;
  readonly evidence_pointer_count: number;
}

export interface EvaluationSuiteReport {
  readonly mode: "stand-in" | "live";
  readonly model_id: string;
  readonly api_format: string;
  readonly all_expectations_matched: boolean;
  readonly replay_isolated_from_real_audit: boolean;
  readonly blocked_external_effects_count: number;
  readonly human_review_applied_without_mutation: boolean;
  readonly cases: readonly EvaluationCaseOutcome[];
  readonly replay_comparison: {
    readonly verdict_transition: `${EvaluationVerdict}->${EvaluationVerdict}`;
    readonly improved_stages: readonly EvaluationStage[];
    readonly regressed_stages: readonly EvaluationStage[];
  };
  readonly metrics: {
    readonly validation: EvaluationMetricsSummary;
    readonly tuning: EvaluationMetricsSummary;
  };
  readonly reproducibility_digest: string;
}

function summarizeComparison(comparison: EvaluationRunComparison): EvaluationSuiteReport["replay_comparison"] {
  const improved_stages: EvaluationStage[] = [];
  const regressed_stages: EvaluationStage[] = [];
  for (const diff of comparison.stage_diffs) {
    if (diff.baseline_verdict !== "passed" && diff.candidate_verdict === "passed") {
      improved_stages.push(diff.stage);
    } else if (diff.baseline_verdict === "passed" && diff.candidate_verdict === "failed") {
      regressed_stages.push(diff.stage);
    }
  }
  return {
    verdict_transition: `${comparison.verdict_change.from}->${comparison.verdict_change.to}`,
    improved_stages,
    regressed_stages,
  };
}

function computeReproducibilityDigest(payload: {
  readonly cases: readonly EvaluationCaseOutcome[];
  readonly replay_comparison: EvaluationSuiteReport["replay_comparison"];
  readonly validation: EvaluationMetricsSummary;
  readonly tuning: EvaluationMetricsSummary;
  readonly replay_isolated: boolean;
  readonly blocked_effects: number;
  readonly human_review_ok: boolean;
}): string {
  const normalized = {
    cases: payload.cases.map((item) => ({
      sample_id: item.sample_id,
      purpose: item.purpose,
      expected_verdict: item.expected_verdict,
      observed_verdict: item.observed_verdict,
      matched_expectation: item.matched_expectation,
      failed_stages: item.failed_stages,
      unknown_reasons: item.unknown_reasons,
      has_evidence: item.evidence_pointer_count > 0,
    })),
    replay_comparison: payload.replay_comparison,
    validation: {
      sample_count: payload.validation.sample_count,
      verdict_counts: payload.validation.verdict_counts,
      evaluable_count: payload.validation.evaluable_count,
    },
    tuning: {
      sample_count: payload.tuning.sample_count,
      verdict_counts: payload.tuning.verdict_counts,
    },
    replay_isolated: payload.replay_isolated,
    blocked_effects: payload.blocked_effects,
    human_review_ok: payload.human_review_ok,
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function runCanonicalEvaluationInHome(
  home: string,
  model: WorkloadModelConfig,
): Promise<EvaluationSuiteReport> {
  const env = await bootAndSeedEvaluationWorkload(home, model);
  try {
    const suite = buildCanonicalEvaluationSuite(env.ids);
    const rawHomeClient = env.host.homeActionClient();
    const invokeHome = async <Input, Output>(action: ActionDefinition<Input, Output>, input: Input): Promise<Output> =>
      (await rawHomeClient.invoke(await env.homeCaller(), action, input)) as Output;

    for (const item of suite) {
      await invokeHome(evaluationActions.samplesPut, item.sample);
    }

    await invokeHome(observationActions.cleanupApply, {
      time_range: "before_7d",
      project_id: env.ids.holdProjectId,
    });

    const defaultExecKind = model.mode === "live" ? "live_model" : "evidence_audit";
    const modelRunInfo = {
      mode: model.mode === "live" ? ("live" as const) : ("stand_in" as const),
      model_id: model.modelId,
      api_format: model.apiFormat,
    };

    const outcomes: EvaluationCaseOutcome[] = [];
    let selfCertRunId = "";
    let replayRunV1Id = "";
    let replayRunV1BlockedCount = 0;

    for (const item of suite) {
      const run = await invokeHome(evaluationActions.runsExecute, {
        sample_id: item.sample.sample_id,
        execution_kind: item.executionKind ?? defaultExecKind,
        model_run_info: modelRunInfo,
        ...(item.replayScenarioId ? { replay_scenario_id: item.replayScenarioId } : {}),
      });
      if (item.sample.sample_id === "ec-02-no-self-cert") selfCertRunId = run.run_id;
      if (item.sample.sample_id === "ec-18-replay-compare") {
        replayRunV1Id = run.run_id;
        replayRunV1BlockedCount = run.replay?.blocked_external_effects.length ?? 0;
      }

      const reasonsMatch = item.expectedUnknownReasons
        ? item.expectedUnknownReasons.every((reason) => run.unknown_reasons.includes(reason))
        : true;
      outcomes.push({
        sample_id: item.sample.sample_id,
        case_ref: item.sample.case_ref ?? null,
        purpose: item.sample.purpose,
        expected_verdict: item.expectedRawVerdict,
        observed_verdict: run.effective_verdict,
        matched_expectation: run.effective_verdict === item.expectedRawVerdict && reasonsMatch,
        failed_stages: run.failed_stages,
        unknown_reasons: run.unknown_reasons,
        matched_record_count: run.observed_conditions.record_count,
        evidence_pointer_count: run.expectation_results.reduce((acc, exp) => acc + exp.evidence_refs.length, 0),
      });
    }

    const replayRunV2 = await invokeHome(evaluationActions.runsExecute, {
      sample_id: "ec-18-replay-compare",
      execution_kind: "isolated_replay",
      replay_scenario_id: env.ids.replayScenarioV2,
      model_run_info: modelRunInfo,
    });
    const comparison = await invokeHome(evaluationActions.runsCompare, {
      baseline_run_id: replayRunV1Id,
      candidate_run_id: replayRunV2.run_id,
    });

    const auditBefore = await invokeHome(observationActions.recordsQuery, {
      use: "evaluation",
      project_id: env.ids.mainProjectId,
    });
    const reviewed = await invokeHome(evaluationActions.reviewsRecord, {
      run_id: selfCertRunId,
      expectation_id: "exp-human-ref",
      verdict: "passed",
      rationale: "人工核对确认底层动作失败被如实捕获，历史工作记录未发生任何改写。",
    });
    const auditAfter = await invokeHome(observationActions.recordsQuery, {
      use: "evaluation",
      project_id: env.ids.mainProjectId,
    });
    const humanReviewOk =
      reviewed.run.expectation_results.find((r) => r.expectation_id === "exp-human-ref")?.verdict_source === "human_review"
      && auditAfter.records.length === auditBefore.records.length;

    // Verify replay records never pollute real-work assistant/default queries in `replayProjectId` (OCL-13, EC-18).
    const realReplayQuery = await invokeHome(observationActions.recordsQuery, {
      use: "assistant",
      project_id: env.ids.replayProjectId,
    });
    const replayIsolated = realReplayQuery.records.length === 0;

    const validationMetrics = await invokeHome(evaluationActions.metricsSummarize, {
      purpose: "validation",
    });
    const tuningMetrics = await invokeHome(evaluationActions.metricsSummarize, {
      purpose: "tuning",
    });

    const replaySummary = summarizeComparison(comparison);
    const blockedEffectsCount = replayRunV1BlockedCount + (replayRunV2.replay?.blocked_external_effects.length ?? 0);
    const allMatched =
      outcomes.every((c) => c.matched_expectation)
      && replayRunV2.effective_verdict === "passed"
      && replaySummary.improved_stages.includes("materials")
      && replayIsolated
      && blockedEffectsCount >= 2
      && humanReviewOk;

    return {
      mode: model.mode,
      model_id: model.modelId,
      api_format: model.apiFormat,
      all_expectations_matched: allMatched,
      replay_isolated_from_real_audit: replayIsolated,
      blocked_external_effects_count: blockedEffectsCount,
      human_review_applied_without_mutation: humanReviewOk,
      cases: outcomes,
      replay_comparison: replaySummary,
      metrics: {
        validation: validationMetrics,
        tuning: tuningMetrics,
      },
      reproducibility_digest: computeReproducibilityDigest({
        cases: outcomes,
        replay_comparison: replaySummary,
        validation: validationMetrics,
        tuning: tuningMetrics,
        replay_isolated: replayIsolated,
        blocked_effects: blockedEffectsCount,
        human_review_ok: humanReviewOk,
      }),
    };
  } finally {
    await env.close();
  }
}
