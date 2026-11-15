import {
  EVALUATION_STAGES,
  EVALUATION_WORK_MODES,
  type EvaluationFunnelCounts,
  type EvaluationMetricsSummarizeInput,
  type EvaluationMetricsSummary,
  type EvaluationRunComparison,
  type EvaluationRunView,
  type EvaluationStage,
  type EvaluationUnknownReason,
  type EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type { ObservationOutcome } from "@molis-ai/molis-work-contracts/services/observation";
import type { StoredRunWithOutcomes } from "./store.js";

function stageVerdictOf(run: EvaluationRunView, stage: EvaluationStage): EvaluationVerdict {
  const items = run.expectation_results.filter((item) => item.stage === stage);
  if (items.length === 0) return "passed";
  if (items.some((item) => item.effective_verdict === "failed")) return "failed";
  if (items.some((item) => item.effective_verdict === "unknown")) return "unknown";
  return "passed";
}

function formatModels(run: EvaluationRunView): string {
  if (run.model_run_info && run.model_run_info.mode !== "none") {
    return `${run.model_run_info.mode}:${run.model_run_info.provider ?? "unknown"}/${run.model_run_info.model_id ?? "unknown"}`;
  }
  if (run.observed_conditions.models.length > 0) {
    return run.observed_conditions.models.map((m) => `${m.provider}/${m.model_id}`).sort().join(",");
  }
  return "none";
}

function formatSkills(run: EvaluationRunView): string {
  return run.observed_conditions.skills.map((s) => `${s.id}@${s.version}`).sort().join(",") || "none";
}

function formatPlugins(run: EvaluationRunView): string {
  const entries = Object.entries(run.observed_conditions.plugins).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([id, ver]) => `${id}@${ver}`).join(",") || "none";
}

/**
 * Compare two runs across the six evaluation stages while explicitly separating shared conditions from changed or
 * incomparable conditions (PWA-51, PWA-54). Two runs of different `sample_id` or `sample_purpose` are marked
 * `comparable: false` rather than producing a misleading improvement claim.
 */
export function compareEvaluationRuns(baseline: EvaluationRunView, candidate: EvaluationRunView): EvaluationRunComparison {
  const shared: string[] = [];
  const differences: string[] = [];
  let comparable = true;

  if (baseline.sample_id === candidate.sample_id) {
    shared.push(`sample_id=${baseline.sample_id}`);
  } else {
    comparable = false;
    differences.push(`样本不同：${baseline.sample_id} vs ${candidate.sample_id}`);
  }

  if (baseline.sample_version === candidate.sample_version) {
    shared.push(`sample_version=${baseline.sample_version}`);
  } else {
    comparable = false;
    differences.push(`样本预期版本不同：v${baseline.sample_version} vs v${candidate.sample_version}`);
  }

  if (baseline.sample_purpose === candidate.sample_purpose) {
    shared.push(`purpose=${baseline.sample_purpose}`);
  } else {
    comparable = false;
    differences.push(`样本用途不同（调优与独立验证不可混比）：${baseline.sample_purpose} vs ${candidate.sample_purpose}`);
  }

  if (baseline.execution_kind === candidate.execution_kind) {
    shared.push(`execution_kind=${baseline.execution_kind}`);
  } else {
    differences.push(`运行方式变化：${baseline.execution_kind} -> ${candidate.execution_kind}`);
  }

  const basePlatform = baseline.observed_conditions.platform_versions.join(",") || "none";
  const candPlatform = candidate.observed_conditions.platform_versions.join(",") || "none";
  if (basePlatform === candPlatform) shared.push(`platform=${basePlatform}`);
  else differences.push(`平台版本变化：${basePlatform} -> ${candPlatform}`);

  const baseModel = formatModels(baseline);
  const candModel = formatModels(candidate);
  if (baseModel === candModel) shared.push(`model=${baseModel}`);
  else differences.push(`模型条件变化：${baseModel} -> ${candModel}`);

  const baseSkills = formatSkills(baseline);
  const candSkills = formatSkills(candidate);
  if (baseSkills === candSkills) shared.push(`skills=${baseSkills}`);
  else differences.push(`Skill 版本变化：${baseSkills} -> ${candSkills}`);

  const basePlugins = formatPlugins(baseline);
  const candPlugins = formatPlugins(candidate);
  if (basePlugins === candPlugins) shared.push(`plugins=${basePlugins}`);
  else differences.push(`插件版本变化：${basePlugins} -> ${candPlugins}`);

  if (baseline.coverage_limitations.length > 0 || candidate.coverage_limitations.length > 0) {
    differences.push(
      `覆盖限制：baseline(${baseline.coverage_limitations.length}) / candidate(${candidate.coverage_limitations.length})`,
    );
  }

  const stageDiffs = EVALUATION_STAGES.map((stage) => {
    const baseVerdict = stageVerdictOf(baseline, stage);
    const candVerdict = stageVerdictOf(candidate, stage);
    const baseMap = new Map(
      baseline.expectation_results.filter((r) => r.stage === stage).map((r) => [r.expectation_id, r.effective_verdict]),
    );
    const candMap = new Map(
      candidate.expectation_results.filter((r) => r.stage === stage).map((r) => [r.expectation_id, r.effective_verdict]),
    );
    const ids = Array.from(new Set([...baseMap.keys(), ...candMap.keys()])).sort();
    const changed = ids.filter((id) => baseMap.get(id) !== candMap.get(id));
    const summary = baseVerdict === candVerdict && changed.length === 0
      ? `阶段 ${stage} 保持 ${candVerdict}`
      : `阶段 ${stage} 由 ${baseVerdict} 变为 ${candVerdict}（变更预期：${changed.join(", ") || "无"}）`;
    return {
      stage,
      baseline_verdict: baseVerdict,
      candidate_verdict: candVerdict,
      changed_expectation_ids: changed,
      summary,
    };
  });

  return {
    sample_id: baseline.sample_id,
    baseline_run_id: baseline.run_id,
    candidate_run_id: candidate.run_id,
    comparable,
    shared_conditions: shared,
    incomparable_differences: differences,
    verdict_change: {
      from: baseline.effective_verdict,
      to: candidate.effective_verdict,
    },
    stage_diffs: stageDiffs,
  };
}

export function summarizeEvaluationMetrics(
  input: EvaluationMetricsSummarizeInput,
  stored: readonly StoredRunWithOutcomes[],
  sampleCount: number,
): EvaluationMetricsSummary {
  const verdictCounts: Record<EvaluationVerdict, number> = { passed: 0, failed: 0, unknown: 0 };
  const unknownReasonCounts: Partial<Record<EvaluationUnknownReason, number>> = {};
  const workOutcomeCounts: Partial<Record<ObservationOutcome, number>> = {};
  let funnelTotals: EvaluationFunnelCounts = {
    presented: 0,
    viewed: 0,
    selected: 0,
    executed: 0,
    completed: 0,
    adopted: 0,
    modified_after_adoption: 0,
    undone_or_reworked: 0,
  };

  for (const { view, outcomeCounts } of stored) {
    verdictCounts[view.effective_verdict] += 1;
    for (const reason of view.unknown_reasons) {
      unknownReasonCounts[reason] = (unknownReasonCounts[reason] ?? 0) + 1;
    }
    for (const [outcome, count] of Object.entries(outcomeCounts)) {
      if (typeof count === "number") {
        const key = outcome as ObservationOutcome;
        workOutcomeCounts[key] = (workOutcomeCounts[key] ?? 0) + count;
      }
    }
    funnelTotals = {
      presented: funnelTotals.presented + view.funnel.presented,
      viewed: funnelTotals.viewed + view.funnel.viewed,
      selected: funnelTotals.selected + view.funnel.selected,
      executed: funnelTotals.executed + view.funnel.executed,
      completed: funnelTotals.completed + view.funnel.completed,
      adopted: funnelTotals.adopted + view.funnel.adopted,
      modified_after_adoption: funnelTotals.modified_after_adoption + view.funnel.modified_after_adoption,
      undone_or_reworked: funnelTotals.undone_or_reworked + view.funnel.undone_or_reworked,
    };
  }

  const denominator = stored.length;
  const evaluableCount = verdictCounts.passed + verdictCounts.failed;
  const evaluableRatio = denominator === 0 ? 0 : Number((evaluableCount / denominator).toFixed(4));

  const byWorkMode = EVALUATION_WORK_MODES.flatMap((mode) => {
    const subset = stored.filter(({ view }) => view.work_mode === mode);
    if (subset.length === 0) return [];
    let passed = 0;
    let failed = 0;
    let unknown = 0;
    for (const { view } of subset) {
      if (view.effective_verdict === "passed") passed += 1;
      else if (view.effective_verdict === "failed") failed += 1;
      else unknown += 1;
    }
    return [{
      work_mode: mode,
      denominator: subset.length,
      passed,
      failed,
      unknown,
    }];
  });

  return {
    purpose: input.purpose,
    window: { since: input.since ?? null, until: input.until ?? null },
    sample_count: sampleCount,
    denominator,
    evaluable_count: evaluableCount,
    evaluable_ratio: evaluableRatio,
    verdict_counts: verdictCounts,
    unknown_reason_counts: unknownReasonCounts,
    work_outcome_counts: workOutcomeCounts,
    funnel_totals: funnelTotals,
    by_work_mode: byWorkMode,
  };
}
