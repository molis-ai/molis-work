import { randomUUID } from "node:crypto";
import {
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionExecutionContext,
  type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  EvaluationReplayReceipt,
  EvaluationRunExecuteInput,
  EvaluationRunView,
  EvaluationSampleView,
  EvaluationUnknownReason,
  EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import type {
  ObservationOutcome,
  ObservationQueriedRecord,
  ObservationQueryInput,
} from "@molis-ai/molis-work-contracts/services/observation";
import { evaluationErrors } from "./errors.js";
import {
  effectiveQueryForSample,
  fetchObservationEvidenceMap,
  queryAllObservationRecords,
  readObservationCoverage,
  readRetryReceipts,
  sampleHasActiveHold,
} from "./observation-bridge.js";
import { executeIsolatedReplay, type EvaluationReplayScenario } from "./replay.js";
import { evaluateExpectation } from "./rules.js";
import {
  collectFunnel,
  type FunnelKeys,
  countWorkOutcomes,
  deriveRunCoverageUnknowns,
  extractObservedConditions,
} from "./unknown-and-funnel.js";

export interface RunExecutionContext {
  readonly caller: ActionExecutionContext;
  readonly origin: ActionReference;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly sample: EvaluationSampleView;
  readonly input: EvaluationRunExecuteInput;
  readonly scenarios: ReadonlyMap<string, EvaluationReplayScenario>;
  readonly runInReplayScope?: <T>(fn: () => Promise<T>, replayId: string) => Promise<T>;
  readonly nowIso: () => string;

}

async function collectEvaluationRecords(
  ctx: RunExecutionContext,
  client: ActionClient,
  readNested: ActionCallContext,
  executionKind: NonNullable<EvaluationRunExecuteInput["execution_kind"]>,
): Promise<{
  readonly records: readonly ObservationQueriedRecord[];
  readonly replayReceipt?: EvaluationReplayReceipt;
  readonly missingPinnedCount: number;
}> {
  const { caller, origin, clientFor, sample, input } = ctx;
  if (executionKind === "isolated_replay") {
    const scenarioId = input.replay_scenario_id ?? sample.sample_id;
    const scenario = ctx.scenarios.get(scenarioId);
    if (!scenario || !ctx.runInReplayScope) {
      throw evaluationErrors.replay_unavailable(`隔离回放场景 ${scenarioId} 未登记或当前环境未启用回放作用域`);
    }
    const replayId = `replay-${randomUUID()}`;
    const executed = await executeIsolatedReplay({
      replayId,
      scenario,
      sample,
      caller,
      origin,
      clientFor,
      runInReplayScope: ctx.runInReplayScope,
    });
    const records = await queryAllObservationRecords(
      client,
      readNested,
      effectiveQueryForSample(sample, {
        replay_id: replayId,
        include_simulated: true,
        source_classes: ["replay"],
      }),
    );
    return {
      records,
      missingPinnedCount: 0,
      replayReceipt: {
        replay_id: replayId,
        source_class: "replay",
        blocked_external_effects: executed.blockedExternalEffects,
        replay_record_ids: records.map((r) => r.record_id),
      },
    };
  }

  const simulatedSources = ["trial", "replay", "demo", "system_check"] as const;
  const extra: Partial<ObservationQueryInput> = executionKind === "simulated"
    ? {
        include_simulated: true,
        ...(sample.query.source_classes === undefined ? { source_classes: [...simulatedSources] } : {}),
      }
    : sample.query.source_classes === undefined && sample.query.include_simulated === undefined
      ? { include_simulated: false }
      : {};
  const queried = await queryAllObservationRecords(client, readNested, effectiveQueryForSample(sample, extra));
  if (sample.pinned_record_ids === undefined) {
    return { records: queried, missingPinnedCount: 0 };
  }
  const pinnedSet = new Set(sample.pinned_record_ids);
  const records = queried.filter((r) => pinnedSet.has(r.record_id));
  const foundIds = new Set(records.map((r) => r.record_id));
  const missingPinnedCount = Array.from(pinnedSet).filter((id) => !foundIds.has(id)).length;
  return { records, missingPinnedCount };
}

export async function executeSampleEvaluationRun(ctx: RunExecutionContext): Promise<{
  readonly runView: EvaluationRunView;
  readonly holdRecordIds: readonly string[];
  readonly funnelKeys: FunnelKeys;
  readonly outcomeCounts: Readonly<Partial<Record<ObservationOutcome, number>>>;
}> {
  const { caller, origin, clientFor, sample, input } = ctx;
  const client = clientFor(caller);
  const startedMs = Date.now();
  const executionKind = input.execution_kind ?? "evidence_audit";
  const readNested = retainActionAuthority(caller, origin);

  const { records, replayReceipt, missingPinnedCount } = await collectEvaluationRecords(
    ctx,
    client,
    readNested,
    executionKind,
  );

  const evidenceByRecord = await fetchObservationEvidenceMap(client, readNested, records);
  const coverage = await readObservationCoverage(client, readNested, sample);

  const evaluatedAt = ctx.nowIso();
  const baseCoverage = deriveRunCoverageUnknowns(coverage, sample, evaluatedAt);
  const runCoverageUnknowns: readonly EvaluationUnknownReason[] = missingPinnedCount > 0
    ? Array.from(new Set<EvaluationUnknownReason>([...baseCoverage.unknownReasons, "evidence_missing"]))
    : baseCoverage.unknownReasons;
  const limitations = missingPinnedCount > 0
    ? [...baseCoverage.limitations, `样本固定的 ${missingPinnedCount} 条工作记录在采集层已缺失`]
    : [...baseCoverage.limitations];

  const { counts: funnel, keys: funnelKeys } = collectFunnel(records);
  if (records.length && !funnel.completed) {
    limitations.push("本次未读到业务主人确认完成的工作。完成数只计有据可查的交付。");
  }
  const observedConditions = extractObservedConditions(records);
  const outcomeCounts = countWorkOutcomes(records);

  const sampleTextTermCount = sample.expectations.reduce((count, exp) => {
    if (exp.source === "evaluator") return count + (exp.rule.required_evidence_terms?.length ?? 0) + (exp.rule.forbidden_evidence_terms?.length ?? 0);
    if (exp.source === "deterministic" && (exp.rule.check === "evidence_text" || exp.rule.check === "evidence_absent")) {
      return count + (exp.rule.contains_all?.length ?? 0) + (exp.rule.forbids_any?.length ?? 0);
    }
    return count;
  }, 0);
  const retryReceipts = sample.expectations.some(exp => exp.source === "deterministic" && exp.rule.check === "no_self_certifying_success")
    ? await readRetryReceipts(clientFor, readNested, records, evidenceByRecord) : undefined;
  const expectationResults = sample.expectations.map((expectation) =>
    evaluateExpectation(expectation, {
      records,
      evidenceByRecord,
      retryReceipts,
      funnel,
      runCoverageUnknowns,
      sampleAllowedVariations: sample.allowed_variations ?? [],
      sampleTextTermCount,
      workMode: sample.work_mode,
    }),
  );

  const failedStages = Array.from(
    new Set(expectationResults.filter((r) => r.automated_verdict === "failed").map((r) => r.stage)),
  );
  // A sample whose records are under a live evaluation hold has its own basis retained. A project-wide expired/purged
  // gap can belong to another work in the same project (EC-16 held vs unheld); do not turn the held run unknown for it.
  // Lost/paused gaps are not protected by a hold and still propagate, as does every gap for an unheld sample. Ask the
  // observation layer whether the hold is still active instead of trusting the sample row's cached hold count.
  const hasRetentionGap = runCoverageUnknowns.some((reason) => reason === "coverage_gap_expired" || reason === "coverage_gap_purged");
  const holdProtectsRetention = hasRetentionGap && missingPinnedCount === 0 && await sampleHasActiveHold(client, readNested, sample);
  const propagatedCoverageUnknowns = holdProtectsRetention
    ? runCoverageUnknowns.filter((reason) => reason !== "coverage_gap_expired" && reason !== "coverage_gap_purged")
    : runCoverageUnknowns;
  const finalUnknowns = Array.from(
    new Set<EvaluationUnknownReason>([
      ...propagatedCoverageUnknowns,
      ...expectationResults.flatMap((r) => (r.automated_verdict === "unknown" ? r.unknown_reasons : [])),
    ]),
  );
  const automatedVerdict: EvaluationVerdict = failedStages.length > 0
    ? "failed"
    : finalUnknowns.length > 0 || expectationResults.some((r) => r.automated_verdict === "unknown")
      ? "unknown"
      : "passed";

  const durationMs = Math.max(0, Date.now() - startedMs);
  const runView: EvaluationRunView = {
    run_id: `evalrun-${randomUUID()}`,
    sample_id: sample.sample_id,
    sample_version: sample.version,
    sample_purpose: sample.purpose,
    work_mode: sample.work_mode,
    project_id: sample.project_id ?? null,
    execution_kind: executionKind,
    ...(input.model_run_info ? { model_run_info: input.model_run_info } : {}),
    ...(replayReceipt ? { replay: replayReceipt } : {}),
    automated_verdict: automatedVerdict,
    effective_verdict: automatedVerdict,
    verdict_source: "automated",
    unknown_reasons: finalUnknowns,
    failed_stages: failedStages,
    coverage_limitations: limitations,
    observed_conditions: observedConditions,
    funnel,
    expectation_results: expectationResults,
    human_reviews: [],
    evaluated_at: evaluatedAt,
    duration_ms: durationMs,
  };

  return { runView, outcomeCounts, funnelKeys, holdRecordIds: input.hold_records ? records.map(record => record.record_id) : [] };
}
