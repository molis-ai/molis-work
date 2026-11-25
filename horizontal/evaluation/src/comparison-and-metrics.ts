import {
  EVALUATION_STAGES,
  EVALUATION_WORK_MODES,
  type EvaluationMetricsSummarizeInput,
  type EvaluationMetricsSummary,
  type EvaluationRunComparison,
  type EvaluationRunView,
  type EvaluationStage,
  type EvaluationUnknownReason,
  type EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type { ObservationOutcome, ObservationQueriedRecord } from "@molis-ai/molis-work-contracts/services/observation";
import { collectFunnel, emptyFunnelSets, funnelCounts } from "./unknown-and-funnel.js";
import type { StoredRunWithOutcomes } from "./store.js";

function stageVerdictOf(run: EvaluationRunView, stage: EvaluationStage): EvaluationVerdict {
  const items = run.expectation_results.filter((item) => item.stage === stage);
  // A stage with no expectation was not evaluated. Reporting it as `passed` would let a two-stage sample claim all six
  // stages were covered; the closed verdict set has `unknown` for exactly this (PWA-51, PWA-54).
  if (items.length === 0) return "unknown";
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

  if (baseline.funnel.execution_basis !== candidate.funnel.execution_basis) {
    comparable = false;
    differences.push("执行与完成的统计单位发生变化，历史记录条数与业务工作数无法直接比较");
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
  selectedSampleCount: number,
  evidence: ReadonlyMap<string, readonly ObservationQueriedRecord[]>,
): EvaluationMetricsSummary {
  const verdictCounts: Record<EvaluationVerdict, number> = { passed: 0, failed: 0, unknown: 0 };
  const unknownReasonCounts: Partial<Record<EvaluationUnknownReason, number>> = {};
  const workOutcomeCounts: Partial<Record<ObservationOutcome, number>> = {};
  let excludedExecutionRuns = 0;
  const stages = emptyFunnelSets();
  const unattributedInteractions = { presented: 0, viewed: 0, selected: 0, adopted: 0, modified_after_adoption: 0, undone_or_reworked: 0 };
  const interactions = Object.keys(unattributedInteractions) as (keyof typeof unattributedInteractions)[];
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
    const rows = evidence.get(view.run_id) ?? [];
    const keys = collectFunnel(rows);
    for (const stage of interactions) {
      for (const key of keys[stage]) stages[stage].add(key);
      unattributedInteractions[stage] += Math.max(0, view.funnel[stage] - keys[stage].size);
    }
    for (const key of keys.executed) stages.executed.add(key);
    for (const key of keys.completed) stages.completed.add(key);
    const completeBasis = rows.length === view.observed_conditions.record_count;
    if (!completeBasis && (view.funnel.execution_basis !== "owner_work" ||
      keys.executed.size < view.funnel.executed || keys.completed.size < view.funnel.completed)) excludedExecutionRuns++;
  }

  const totals = { ...funnelCounts(stages), excluded_execution_runs: excludedExecutionRuns, unattributed_interactions: unattributedInteractions };
  for (const stage of interactions) totals[stage] += unattributedInteractions[stage];
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
    sample_count: new Set(stored.map(({ view }) => view.sample_id)).size,
    selected_sample_count: selectedSampleCount,
    denominator,
    evaluable_count: evaluableCount,
    evaluable_ratio: evaluableRatio,
    verdict_counts: verdictCounts,
    unknown_reason_counts: unknownReasonCounts,
    work_outcome_counts: workOutcomeCounts,
    funnel_totals: totals,
    by_work_mode: byWorkMode,
  };
}
