import { randomUUID } from "node:crypto";
import {
  LOCAL_PERSON_ACTOR_ID,
  retainActionAuthority,
  type ActionCallContext,
  type ActionClient,
  type ActionDefinition,
  type ActionExecutionContext,
  type ActionHandlerBinding,
  type ActionProviderRegistration,
  type ActionReference,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EVALUATION_PROVIDER_ID,
  evaluationActions,
  type EvaluationHumanReview,
  type EvaluationMetricsSummarizeInput,
  type EvaluationMetricsSummary,
  type EvaluationReviewRecordInput,
  type EvaluationReviewRecordOutput,
  type EvaluationRunCompareInput,
  type EvaluationRunComparison,
  type EvaluationRunExecuteInput,
  type EvaluationRunGetInput,
  type EvaluationRunListInput,
  type EvaluationRunListOutput,
  type EvaluationRunView,
  type EvaluationSampleInput,
  type EvaluationSampleListInput,
  type EvaluationSampleListOutput,
  type EvaluationSamplePutOutput,
  type EvaluationSampleRemoveInput,
  type EvaluationSampleRemoveOutput,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { compareEvaluationRuns, summarizeEvaluationMetrics } from "./comparison-and-metrics.js";
import { evaluationErrors } from "./errors.js";
import { placeEvaluationSampleHold, releaseEvaluationSampleHolds } from "./observation-bridge.js";
import type { EvaluationReplayScenario } from "./replay.js";
import { executeSampleEvaluationRun } from "./run-executor.js";
import { EvaluationStore } from "./store.js";

export interface EvaluationServiceOptions {
  readonly home: string;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly runInReplayScope?: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly now?: () => Date;
  readonly replayScenarios?: Readonly<Record<string, EvaluationReplayScenario>>;
}

function assertPersonCaller(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || Boolean(caller.delegated_by)) {
    throw evaluationErrors.forbidden("只有本人能管理评测样本、运行端到端评测或记录人工复查");
  }
}

function originOf(caller: ActionCallContext, fallback: ActionDefinition): ActionReference {
  const exec = caller as Partial<ActionExecutionContext>;
  if (exec.current_action) return exec.current_action;
  return { capability_id: fallback.capability_id, version: fallback.version, provider_id: EVALUATION_PROVIDER_ID };
}

function validateWindow(window: EvaluationSampleInput["window"]): void {
  if (!window) return;
  for (const [label, raw] of [["since", window.since], ["until", window.until], ["observation_cutoff_at", window.observation_cutoff_at]] as const) {
    if (raw !== undefined && Number.isNaN(Date.parse(raw))) {
      throw evaluationErrors.invalid(`样本时间窗口字段 ${label} 不是合法 ISO 时间：${raw}`);
    }
  }
  if (window.since && window.until && Date.parse(window.since) > Date.parse(window.until)) {
    throw evaluationErrors.invalid("样本时间窗口 since 不能晚于 until");
  }
}

function validateMetricsWindow(input: EvaluationMetricsSummarizeInput): void {
  if (input.since !== undefined && Number.isNaN(Date.parse(input.since))) {
    throw evaluationErrors.invalid(`指标汇总起始时间不合法：${input.since}`);
  }
  if (input.until !== undefined && Number.isNaN(Date.parse(input.until))) {
    throw evaluationErrors.invalid(`指标汇总结束时间不合法：${input.until}`);
  }
  if (input.since && input.until && Date.parse(input.since) > Date.parse(input.until)) {
    throw evaluationErrors.invalid("指标汇总 since 不能晚于 until");
  }
}

export class EvaluationService {
  private readonly store: EvaluationStore;
  private readonly scenarios = new Map<string, EvaluationReplayScenario>();

  constructor(private readonly options: EvaluationServiceOptions) {
    this.store = new EvaluationStore(options.home);
    for (const [id, fn] of Object.entries(options.replayScenarios ?? {})) {
      this.scenarios.set(id, fn);
    }
  }

  registerReplayScenario(id: string, scenario: EvaluationReplayScenario): () => void {
    this.scenarios.set(id, scenario);
    return () => {
      if (this.scenarios.get(id) === scenario) this.scenarios.delete(id);
    };
  }

  private nowIso(): string {
    return (this.options.now ? this.options.now() : new Date()).toISOString();
  }

  async putSample(caller: ActionExecutionContext, input: EvaluationSampleInput): Promise<EvaluationSamplePutOutput> {
    assertPersonCaller(caller);
    validateWindow(input.window);
    caller.signal?.throwIfAborted();
    let hold: { readonly holdId: string | null; readonly heldCount: number } = { holdId: null, heldCount: 0 };
    if (input.hold_records) {
      const nested = retainActionAuthority(caller, originOf(caller, evaluationActions.samplesPut));
      hold = await placeEvaluationSampleHold(this.options.clientFor(caller), nested, input);
    }
    caller.signal?.throwIfAborted();
    await caller.beforeEffect?.();
    return this.store.putSample(input, hold, this.nowIso());
  }

  async removeSample(caller: ActionExecutionContext, input: EvaluationSampleRemoveInput): Promise<EvaluationSampleRemoveOutput> {
    assertPersonCaller(caller);
    caller.signal?.throwIfAborted();
    await caller.beforeEffect?.();
    const { removedVersions, holdIds } = this.store.removeSample(input.sample_id, input.version);
    const releasedHoldIds = input.release_holds !== false && holdIds.length > 0
      ? await releaseEvaluationSampleHolds(
          this.options.clientFor(caller),
          retainActionAuthority(caller, originOf(caller, evaluationActions.samplesRemove)),
          holdIds,
        )
      : [];
    return { removed_versions: removedVersions, released_hold_ids: releasedHoldIds };
  }

  async executeRun(caller: ActionExecutionContext, input: EvaluationRunExecuteInput): Promise<EvaluationRunView> {
    assertPersonCaller(caller);
    caller.signal?.throwIfAborted();
    const sample = this.store.getSample(input.sample_id, input.sample_version);
    if (!sample) {
      throw evaluationErrors.not_found(
        input.sample_version !== undefined
          ? `评测样本 ${input.sample_id}@${input.sample_version} 不存在`
          : `评测样本 ${input.sample_id} 不存在`,
      );
    }
    const { runView, outcomeCounts } = await executeSampleEvaluationRun({
      caller,
      origin: originOf(caller, evaluationActions.runsExecute),
      client: this.options.clientFor(caller),
      sample,
      input,
      scenarios: this.scenarios,
      ...(this.options.runInReplayScope ? { runInReplayScope: this.options.runInReplayScope } : {}),
      nowIso: () => this.nowIso(),
    });
    this.store.insertRun(runView, outcomeCounts);
    return runView;
  }

  async recordReview(caller: ActionExecutionContext, input: EvaluationReviewRecordInput): Promise<EvaluationReviewRecordOutput> {
    assertPersonCaller(caller);
    caller.signal?.throwIfAborted();
    await caller.beforeEffect?.();
    const review: EvaluationHumanReview = {
      review_id: `evalrev-${randomUUID()}`,
      run_id: input.run_id,
      expectation_id: input.expectation_id ?? null,
      reviewer_actor_id: caller.actor_id,
      verdict: input.verdict,
      ...(input.stage ? { stage: input.stage } : {}),
      rationale: input.rationale,
      cited_record_ids: input.cited_record_ids ?? [],
      created_at: this.nowIso(),
    };
    const updated = this.store.appendReview(review);
    return { review, run: updated };
  }

  actions(): {
    readonly definitions: readonly ActionDefinition[];
    readonly handlers: readonly ActionHandlerBinding[];
  } {
    const bound = [
      defineAction(evaluationActions.samplesPut, (caller, input) => this.putSample(caller, input)),
      defineAction(evaluationActions.samplesList, (caller, input: EvaluationSampleListInput): EvaluationSampleListOutput => {
        assertPersonCaller(caller);
        return { samples: this.store.listSamples(input) };
      }),
      defineAction(evaluationActions.samplesRemove, (caller, input) => this.removeSample(caller, input)),
      defineAction(evaluationActions.runsExecute, (caller, input) => this.executeRun(caller, input)),
      defineAction(evaluationActions.runsGet, (caller, input: EvaluationRunGetInput): EvaluationRunView => {
        assertPersonCaller(caller);
        const run = this.store.getRun(input.run_id);
        if (!run) throw evaluationErrors.not_found(`评测运行 ${input.run_id} 不存在`);
        return run;
      }),
      defineAction(evaluationActions.runsList, (caller, input: EvaluationRunListInput): EvaluationRunListOutput => {
        assertPersonCaller(caller);
        return { runs: this.store.listRuns(input) };
      }),
      defineAction(evaluationActions.runsCompare, (caller, input: EvaluationRunCompareInput): EvaluationRunComparison => {
        assertPersonCaller(caller);
        const baseline = this.store.getRun(input.baseline_run_id);
        if (!baseline) throw evaluationErrors.not_found(`基线评测运行 ${input.baseline_run_id} 不存在`);
        const candidate = this.store.getRun(input.candidate_run_id);
        if (!candidate) throw evaluationErrors.not_found(`候选评测运行 ${input.candidate_run_id} 不存在`);
        return compareEvaluationRuns(baseline, candidate);
      }),
      defineAction(evaluationActions.reviewsRecord, (caller, input) => this.recordReview(caller, input)),
      defineAction(evaluationActions.metricsSummarize, (caller, input: EvaluationMetricsSummarizeInput): EvaluationMetricsSummary => {
        assertPersonCaller(caller);
        validateMetricsWindow(input);
        const { runs, sampleCount } = this.store.queryRunsForMetrics(input);
        return summarizeEvaluationMetrics(input, runs, sampleCount);
      }),
    ];
    return {
      definitions: bound.map((item) => item.definition as ActionDefinition),
      handlers: bound.map((item) => item.handler),
    };
  }

  provider(): ActionProviderRegistration {
    const { definitions, handlers } = this.actions();
    return {
      provider: { provider_id: EVALUATION_PROVIDER_ID, title: "端到端评测", kind: "system" },
      definitions,
      handlers,
    };
  }

  clearProject(projectId: string): void {
    this.store.clearProject(projectId);
  }

  close(): void {
    this.store.close();
  }
}
