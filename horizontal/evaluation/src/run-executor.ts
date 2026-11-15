import { randomUUID } from "node:crypto";
import {
  retainActionAuthority,
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
  placeEvaluationSampleHold,
  queryAllObservationRecords,
  readObservationCoverage,
} from "./observation-bridge.js";
import { executeIsolatedReplay, type EvaluationReplayScenario } from "./replay.js";
import { evaluateExpectation } from "./rules.js";
import {
  computeFunnelCounts,
  countWorkOutcomes,
  deriveRunCoverageUnknowns,
  extractObservedConditions,
} from "./unknown-and-funnel.js";

export interface RunExecutionContext {
  readonly caller: ActionExecutionContext;
  readonly origin: ActionReference;
  readonly client: ActionClient;
  readonly sample: EvaluationSampleView;
  readonly input: EvaluationRunExecuteInput;
  readonly scenarios: ReadonlyMap<string, EvaluationReplayScenario>;
  readonly runInReplayScope?: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly nowIso: () => string;
}

export async function executeSampleEvaluationRun(ctx: RunExecutionContext): Promise<{
  readonly runView: EvaluationRunView;
  readonly outcomeCounts: Readonly<Partial<Record<ObservationOutcome, number>>>;
}> {
  const { caller, origin, client, sample, input } = ctx;
  const startedMs = Date.now();
  const executionKind = input.execution_kind ?? "evidence_audit";
  const nested = retainActionAuthority(caller, origin);

  let replayReceipt: EvaluationReplayReceipt | undefined;
  let records: readonly ObservationQueriedRecord[];

  if (executionKind === "isolated_replay") {
    const scenarioId = input.replay_scenario_id ?? sample.sample_id;
    const scenario = ctx.scenarios.get(scenarioId);
    if (!scenario || !ctx.runInReplayScope) {
      throw evaluationErrors.replay_unavailable(`隔离回放场景 ${scenarioId} 未登记或当前环境未启用回放作用域`);
    }
    const priorReplay = await queryAllObservationRecords(client, nested, {
      ...(sample.project_id !== undefined ? { project_id: sample.project_id } : { all_projects: true }),
      include_simulated: true,
      source_classes: ["replay"],
      limit: 500,
    });
    const maxSeqBefore = priorReplay.reduce((max, r) => (r.seq > max ? r.seq : max), 0);
    const replayId = `replay-${randomUUID()}`;
    const executed = await executeIsolatedReplay({
      replayId,
      scenario,
      sample,
      caller,
      origin,
      baseClient: client,
      runInReplayScope: ctx.runInReplayScope,
    });
    records = await queryAllObservationRecords(
      client,
      nested,
      effectiveQueryForSample(sample, {
        after_seq: maxSeqBefore,
        include_simulated: true,
        source_classes: ["replay"],
      }),
    );
    replayReceipt = {
      replay_id: replayId,
      source_class: "replay",
      blocked_external_effects: executed.blockedExternalEffects,
      replay_record_ids: records.map((r) => r.record_id),
    };
  } else {
    const extra: Partial<ObservationQueryInput> = executionKind === "simulated"
      ? { include_simulated: true }
      : sample.query.source_classes === undefined && sample.query.include_simulated === undefined
        ? { include_simulated: false }
        : {};
    records = await queryAllObservationRecords(client, nested, effectiveQueryForSample(sample, extra));
  }

  const evidenceByRecord = await fetchObservationEvidenceMap(client, nested, records);
  const coverage = await readObservationCoverage(client, nested, sample);

  const evaluatedAt = ctx.nowIso();
  const { unknownReasons: runCoverageUnknowns, limitations } = deriveRunCoverageUnknowns(coverage, sample, evaluatedAt);
  const funnel = computeFunnelCounts(records);
  const observedConditions = extractObservedConditions(records);
  const outcomeCounts = countWorkOutcomes(records);

  const expectationResults = sample.expectations.map((expectation) =>
    evaluateExpectation(expectation, {
      records,
      evidenceByRecord,
      funnel,
      runCoverageUnknowns,
      sampleAllowedVariations: sample.allowed_variations ?? [],
    }),
  );

  const failedStages = Array.from(
    new Set(expectationResults.filter((r) => r.automated_verdict === "failed").map((r) => r.stage)),
  );
  const finalUnknowns = Array.from(
    new Set<EvaluationUnknownReason>([
      ...(runCoverageUnknowns.includes("window_incomplete") ? (["window_incomplete"] as const) : []),
      ...expectationResults.flatMap((r) => (r.automated_verdict === "unknown" ? r.unknown_reasons : [])),
    ]),
  );
  const automatedVerdict: EvaluationVerdict = failedStages.length > 0
    ? "failed"
    : expectationResults.some((r) => r.automated_verdict === "unknown") || runCoverageUnknowns.includes("window_incomplete")
      ? "unknown"
      : "passed";

  caller.signal?.throwIfAborted();
  await caller.beforeEffect?.();

  if (input.hold_records && records.length > 0) {
    await placeEvaluationSampleHold(client, nested, sample, records.map((r) => r.record_id));
  }

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

  return { runView, outcomeCounts };
}
