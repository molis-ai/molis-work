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
  type EvaluationSampleView,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { OBSERVATION_SERVICE_PREFIXES } from "@molis-ai/molis-work-contracts/services/observation";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { compareEvaluationRuns, summarizeEvaluationMetrics } from "./comparison-and-metrics.js";
import { evaluationErrors } from "./errors.js";
import {
  commitEvaluationSampleHold,
  readSampleHold,
  readRunFunnelEvidence,
  releaseEvaluationSampleHolds,
  resolveSampleHoldRecordIds,
  sampleHoldTarget,
} from "./observation-bridge.js";
import type { EvaluationReplayScenario } from "./replay.js";
import { isPluginDeliveryRole } from "./rules.js";
import { executeSampleEvaluationRun } from "./run-executor.js";
import { EvaluationStore } from "./store.js";
import { workModeExpectsReply } from "./unknown-and-funnel.js";

export interface EvaluationServiceOptions {
  readonly home: string;
  readonly clientFor: (caller: ActionCallContext) => ActionClient;
  readonly runInReplayScope?: <T>(fn: () => Promise<T>, replayId: string) => Promise<T>;
  readonly now?: () => Date;
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

function validateDeliverySources(input: EvaluationSampleInput): void {
  const platformPrefixes = Object.values(OBSERVATION_SERVICE_PREFIXES);
  for (const exp of input.expectations) {
    if (exp.stage !== "delivery") continue;
    let facts: readonly string[];
    let role: string | undefined;
    let requiresReply = false;
    if (exp.source === "evaluator" && exp.rule.evidence_source) {
      facts = [exp.rule.evidence_source.fact];
      role = exp.rule.evidence_source.role;
      requiresReply = exp.rule.required_facts?.includes("agent.reply") ?? false;
    } else if (exp.source === "deterministic" && exp.rule.check === "evidence_text") {
      facts = exp.rule.facts ?? (exp.rule.fact ? [exp.rule.fact] : []);
      role = exp.rule.evidence_role;
      requiresReply = facts.includes("agent.reply") || (!facts.length && (workModeExpectsReply(input.work_mode) || input.query.fact === "agent.reply"));
    } else continue;
    if (!facts.length && input.query.fact) facts = [input.query.fact];
    const judgesReply = requiresReply || facts.some(fact => platformPrefixes.some(prefix => fact.startsWith(prefix + ".")));
    if (judgesReply && ((role !== undefined && role !== "reply") || facts.some(fact => fact !== "agent.reply"))) {
      throw evaluationErrors.invalid("评判模型交付须使用 agent.reply 的 reply 正文。已冻结的样本请用新版本登记正确来源。");
    }
    if (!judgesReply && role !== undefined && !isPluginDeliveryRole(role) && !(facts.length === 0 && input.work_mode === "mixed" && role === "reply")) {
      throw evaluationErrors.invalid("评判业务插件交付须使用 output 产出或 body 正文。已冻结的样本请用新版本登记正确来源。");
    }
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
  private readonly collectingRuns = new Set<EvaluationSampleView>();
  private readonly sampleWrites = new Map<string, Promise<void>>();
  private readonly scenarios = new Map<string, EvaluationReplayScenario>();

  constructor(private readonly options: EvaluationServiceOptions) {
    this.store = new EvaluationStore(options.home);
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

  /** A sample can be deleted while a replay is collecting evidence. Serialize only its final writes. */
  private async writeSample<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.sampleWrites.get(id) ?? Promise.resolve();
    const next = previous.then(operation);
    const settled = next.then(() => {}, () => {});
    this.sampleWrites.set(id, settled);
    try { return await next; }
    finally { if (this.sampleWrites.get(id) === settled) this.sampleWrites.delete(id); }
  }

  private async commitWithHold<T>(
    caller: ActionExecutionContext, origin: ActionReference, sample: EvaluationSampleInput, ids: readonly string[],
    commit: (hold: { holdId: string | null; heldCount: number }) => T,
  ): Promise<T> {
    const client = this.options.clientFor(caller);
    const previous = ids.length ? await readSampleHold(client, retainActionAuthority(caller, origin), sample) : undefined;
    caller.signal?.throwIfAborted();
    await caller.beforeEffect();
    caller.signal?.throwIfAborted();
    if (!ids.length) return commit({ holdId: null, heldCount: 0 });
    const target = sampleHoldTarget(sample.sample_id, sample.version);
    const nested = retainActionAuthority(caller, origin, caller.beforeEffect);
    const details = { project_id: sample.project_id, expires_at: sample.hold_expires_at, note: `评测样本留存：${sample.title}` };
    let written = false;
    let heldCount = 0;
    try {
      for (let offset = 0; offset < ids.length; offset += 500) {
        const hold = await commitEvaluationSampleHold(client, nested, target, details, ids.slice(offset, offset + 500), true);
        written = true;
        heldCount = hold.active_record_count;
      }
      caller.signal?.throwIfAborted();
      await caller.beforeEffect();
      caller.signal?.throwIfAborted();
      return commit({ holdId: target.hold_id, heldCount });
    } catch (error) {
      if (!written) throw error;
      const cleanup = { ...retainActionAuthority(caller, origin), signal: undefined, beforeEffect: async () => {} };
      if (previous && previous.record_ids.length > 0) {
        const { note, expires_at, record_ids } = previous;
        for (let offset = 0; offset < record_ids.length; offset += 500) {
          await commitEvaluationSampleHold(client, cleanup, target, { note, project_id: sample.project_id, expires_at },
            record_ids.slice(offset, offset + 500), offset > 0);
        }
      } else {
        await releaseEvaluationSampleHolds(client, cleanup, [target]);
      }
      throw error;
    }
  }

  async putSample(caller: ActionExecutionContext, input: EvaluationSampleInput): Promise<EvaluationSamplePutOutput> {
    assertPersonCaller(caller);
    validateWindow(input.window);
    validateDeliverySources(input);
    caller.signal?.throwIfAborted();
    this.store.assertSampleImmutable(input);
    const origin = originOf(caller, evaluationActions.samplesPut);
    const ids = input.hold_records
      ? await resolveSampleHoldRecordIds(this.options.clientFor(caller), retainActionAuthority(caller, origin), input)
      : [];
    return this.writeSample(input.sample_id, () => {
      this.store.assertSampleImmutable(input);
      return this.commitWithHold(caller, origin, input, ids, hold => this.store.putSample(input, hold, this.nowIso()));
    });
  }

  async removeSample(caller: ActionExecutionContext, input: EvaluationSampleRemoveInput): Promise<EvaluationSampleRemoveOutput> {
    assertPersonCaller(caller);
    return this.writeSample(input.sample_id, () => this.removeSampleVersions(caller, input));
  }

  private async removeSampleVersions(caller: ActionExecutionContext, input: EvaluationSampleRemoveInput): Promise<EvaluationSampleRemoveOutput> {
    caller.signal?.throwIfAborted();
    const pending = this.store.inspectSampleRemoval(input.sample_id, input.version);
    await caller.beforeEffect();
    caller.signal?.throwIfAborted();
    const releasedHoldIds = input.release_holds !== false
      ? await releaseEvaluationSampleHolds(
          this.options.clientFor(caller),
          retainActionAuthority(caller, originOf(caller, evaluationActions.samplesRemove), caller.beforeEffect),
          pending.targets, input,
        )
      : [];
    // The first beforeEffect is the commit point for release + delete. Rechecking after the release would strand the
    // sample without its hold if the caller cancelled in between; a cancelled call therefore stops before either write.
    if (pending.versions.length) {
      this.store.removeSample(input.sample_id, input.version);
      for (const sample of this.collectingRuns) {
        if (sample.sample_id === input.sample_id && pending.versions.includes(sample.version)) this.collectingRuns.delete(sample);
      }
    }
    return { removed_versions: pending.versions, released_hold_ids: releasedHoldIds };
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
    validateDeliverySources(sample);
    this.collectingRuns.add(sample);
    try { return await this.evaluateAndCommit(caller, input, sample); }
    finally { this.collectingRuns.delete(sample); }
  }

  private async evaluateAndCommit(caller: ActionExecutionContext, input: EvaluationRunExecuteInput, sample: EvaluationSampleView): Promise<EvaluationRunView> {
    const origin = originOf(caller, evaluationActions.runsExecute);
    const { runView, outcomeCounts, holdRecordIds } = await executeSampleEvaluationRun({
      caller, origin, clientFor: this.options.clientFor, sample, input, scenarios: this.scenarios,
      runInReplayScope: this.options.runInReplayScope, nowIso: () => this.nowIso(),
    });
    return this.writeSample(sample.sample_id, async () => {
      const checkSample = () => {
        const current = this.store.getSample(sample.sample_id, sample.version);
        if (!this.collectingRuns.has(sample) || current?.frozen_digest !== sample.frozen_digest || current.created_at !== sample.created_at) {
          throw evaluationErrors.not_found("评测期间样本已移除或替换，请重新选择样本");
        }
      };
      checkSample();
      return this.commitWithHold(caller, origin, sample, holdRecordIds, hold => {
        checkSample();
        this.store.insertRun(runView, outcomeCounts, hold);
        return runView;
      });
    });
  }

  async recordReview(caller: ActionExecutionContext, input: EvaluationReviewRecordInput): Promise<EvaluationReviewRecordOutput> {
    assertPersonCaller(caller);
    caller.signal?.throwIfAborted();
    await caller.beforeEffect();
    caller.signal?.throwIfAborted();
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
      defineAction(evaluationActions.metricsSummarize, async (caller, input: EvaluationMetricsSummarizeInput): Promise<EvaluationMetricsSummary> => {
        assertPersonCaller(caller);
        validateMetricsWindow(input);
        const { runs, sampleCount } = this.store.queryRunsForMetrics(input);
        const nested = retainActionAuthority(caller, originOf(caller, evaluationActions.metricsSummarize));
        const evidence = await readRunFunnelEvidence(this.options.clientFor(caller), nested, runs.map(run => run.view));
        return summarizeEvaluationMetrics(input, runs, sampleCount, evidence);
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
    for (const sample of this.collectingRuns) {
      if (sample.project_id === projectId) this.collectingRuns.delete(sample);
    }
  }

  close(): void {
    this.store.close();
  }
}
