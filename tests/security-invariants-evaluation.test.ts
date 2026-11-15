import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ActionError,
  LOCAL_PERSON_ACTOR_ID,
  type ActionCallContext,
  type ActionDefinition,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EVALUATION_PROVIDER_ID,
  evaluationActions,
  type EvaluationSampleInput,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createHostObservation, installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { EvaluationService } from "@molis-ai/molis-work-service-evaluation";
import { withObservationSource } from "@molis-ai/molis-work-service-observation";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";

installHostUiText();

const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
  actor_id: LOCAL_PERSON_ACTOR_ID,
  actor_kind: "user",
  audience: "user",
  project_id: null,
  permissions: [],
  ...extra,
});

const pluginCaller = (pluginId: string): ActionCallContext =>
  person({
    actor_id: `plugin:${pluginId}`,
    actor_kind: "runtime",
    audience: "plugin",
    host_plugin: {
      plugin_id: pluginId,
      install_id: `${pluginId}-install`,
      actor_id: `plugin:${pluginId}`,
      project_id: null,
      declaration: { manifest: {} as never },
      assertActive: () => {},
    },
  });

function sampleFixture(overrides: Partial<EvaluationSampleInput> = {}): EvaluationSampleInput {
  return {
    sample_id: "sample-sec-1",
    version: 1,
    title: "安全隔离样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: null,
    initial_intent: "核验评测边界与隔离规则",
    query: { all_projects: true, fact: "notes.saved" },
    expectations: [
      {
        expectation_id: "exp-saved",
        stage: "execution",
        description: "应观察到一条 notes.saved 成功记录",
        source: "deterministic",
        rule: { check: "record_count", fact: "notes.saved", outcomes: ["succeeded"], min_count: 1 },
      },
    ],
    ...overrides,
  };
}

function setupHarness(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "sec-eval-"));
  const observation = createHostObservation(directory);
  let cancelBeforeEffectCapability: string | null = null;
  const service = new ActionService(undefined, {
    observed: (caller, action, value) => observation.observed(caller, action, value),
    beforeEffect: (_caller, reference) => {
      if (cancelBeforeEffectCapability !== null && reference.capability_id === cancelBeforeEffectCapability) {
        throw new ActionError("actions.cancelled", `并发操作在落库前已取消：${reference.capability_id}`);
      }
    },
  });
  service.registerProvider(observation.provider);
  const evaluation = new EvaluationService({
    home: directory,
    clientFor: () => service,
    runInReplayScope: (fn) => withObservationSource("replay", fn),
  });
  service.registerProvider(evaluation.provider());
  t.after(() => {
    evaluation.close();
    observation.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    directory,
    service,
    observation,
    evaluation,
    setCancelBeforeEffect: (capabilityId: string | null) => {
      cancelBeforeEffectCapability = capabilityId;
    },
  };
}

test("S-evaluation-isolation 1: evaluation actions refuse non-person and delegated callers", async (t) => {
  const { service } = setupHarness(t);
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const caller = person({ audience, actor_kind: "runtime", actor_id: `rt:${audience}` });
    const visible = (await service.discover(caller)).filter((v) => v.provider.provider_id === EVALUATION_PROVIDER_ID);
    assert.deepEqual(visible, [], `${audience} must not discover evaluation actions`);
    await assert.rejects(
      service.invoke(caller, evaluationActions.samplesList, {}),
      (err: unknown) => err instanceof ActionError,
      `${audience} must be refused`,
    );
  }
  const delegated = person({ delegated_by: "io.molis.work.workflows" });
  await assert.rejects(
    service.invoke(delegated, evaluationActions.samplesPut, sampleFixture()),
    refused("evaluation.forbidden"),
  );
  await assert.rejects(
    service.invoke(delegated, evaluationActions.metricsSummarize, { purpose: "validation" }),
    refused("evaluation.forbidden"),
  );
});

test("S-evaluation-isolation 2: frozen sample versions refuse any spec or pinned_record_ids mutation without corrupting existing holds", async (t) => {
  const { service, observation } = setupHarness(t);
  await service.invoke(pluginCaller("notes"), observationActions.report, {
    facts: [
      { fact: "notes.saved", outcome: "succeeded" },
      { fact: "notes.other_saved", outcome: "succeeded" },
    ],
  });
  observation.layer.flush();
  const queriedNotes = await service.invoke(person(), observationActions.recordsQuery, {
    all_projects: true,
    fact: "notes.saved",
  });
  const queriedOther = await service.invoke(person(), observationActions.recordsQuery, {
    all_projects: true,
    fact: "notes.other_saved",
  });
  const recA = queriedNotes.records[0]!.record_id;
  const recB = queriedOther.records[0]!.record_id;

  const frozenInput = sampleFixture({ hold_records: true, pinned_record_ids: [recA] });
  const first = await service.invoke(person(), evaluationActions.samplesPut, frozenInput);
  assert.equal(first.created, true);
  assert.equal(first.sample.held_record_count, 1);

  const idempotent = await service.invoke(person(), evaluationActions.samplesPut, frozenInput);
  assert.equal(idempotent.created, false);
  assert.equal(idempotent.sample.frozen_digest, first.sample.frozen_digest);

  await assert.rejects(
    service.invoke(
      person(),
      evaluationActions.samplesPut,
      sampleFixture({
        initial_intent: "偷偷修改后的意图但没升版本号",
        hold_records: true,
        query: { all_projects: true, fact: "notes.other_saved" },
        pinned_record_ids: [recB],
      }),
    ),
    refused("evaluation.sample_version_immutable"),
  );
  await assert.rejects(
    service.invoke(
      person(),
      evaluationActions.samplesPut,
      sampleFixture({ hold_records: true, pinned_record_ids: [recB] }),
    ),
    refused("evaluation.sample_version_immutable"),
  );

  // Verify the original hold in observation.db was NOT overwritten by either rejected mutation attempt.
  const holdsAfterRejected = await service.invoke(person(), observationActions.holdsList, {});
  assert.equal(holdsAfterRejected.holds.length, 1);
  assert.deepEqual(holdsAfterRejected.holds[0]?.record_ids, [recA]);

  const bumped = await service.invoke(
    person(),
    evaluationActions.samplesPut,
    sampleFixture({ version: 2, initial_intent: "升到版本 2 后更新意图", hold_records: true, pinned_record_ids: [recB] }),
  );
  assert.equal(bumped.created, true);
  assert.equal(bumped.sample.version, 2);
});

test("S-evaluation-isolation 3: isolated replay blocks external side-effect actions and isolates replay records from real work", async (t) => {
  const { service, evaluation, observation } = setupHarness(t);
  let externalSentCount = 0;
  let localSavedCount = 0;

  const externalSendDef: ActionDefinition<{ readonly to: string }, { readonly ok: boolean }> = {
    capability_id: "connectors.gmail.send",
    version: 1,
    operation: "command",
    action: {
      title: "发送外部邮件",
      description: "测试用外部发送动作",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: ["connector.write"],
      subject_kinds: [],
      input_schema: { type: "object", properties: { to: { type: "string" } }, required: ["to"], additionalProperties: false },
      output_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    },
  };
  const localSaveDef: ActionDefinition<{ readonly text: string }, { readonly ok: boolean }> = {
    capability_id: "notes.local.save",
    version: 1,
    operation: "command",
    action: {
      title: "保存本地笔记",
      description: "测试用本地写动作",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
      output_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    },
  };

  const boundExternal = defineAction(externalSendDef, async () => {
    externalSentCount += 1;
    return { ok: true };
  });
  const boundLocal = defineAction(localSaveDef, async () => {
    localSavedCount += 1;
    await service.invoke(pluginCaller("notes"), observationActions.report, {
      facts: [{ fact: "notes.saved", outcome: "succeeded" }],
    });
    return { ok: true };
  });
  service.registerProvider({
    provider: { provider_id: "test.replay-targets", title: "回放目标", kind: "system" },
    definitions: [boundExternal.definition, boundLocal.definition],
    handlers: [boundExternal.handler, boundLocal.handler],
  });

  await service.invoke(
    person(),
    evaluationActions.samplesPut,
    sampleFixture({
      sample_id: "replay-sample",
      query: { all_projects: true, fact: "notes.saved" },
      expectations: [
        {
          expectation_id: "exp-replay-source",
          stage: "execution",
          description: "回放记录必须标记为 replay",
          source: "deterministic",
          rule: { check: "source_isolation", source_classes: ["replay"] },
        },
      ],
    }),
  );

  evaluation.registerReplayScenario("replay-blocks-uncaught", async ({ caller, client }) => {
    await client.invoke(caller, externalSendDef, { to: "outside@example.com" });
  });
  await assert.rejects(
    service.invoke(person(), evaluationActions.runsExecute, {
      sample_id: "replay-sample",
      execution_kind: "isolated_replay",
      replay_scenario_id: "replay-blocks-uncaught",
    }),
    refused("evaluation.replay_external_effect_blocked"),
  );
  assert.equal(externalSentCount, 0);

  evaluation.registerReplayScenario("replay-guarded", async ({ caller, client }) => {
    await assert.rejects(
      client.invoke(caller, externalSendDef, { to: "outside@example.com" }),
      refused("evaluation.replay_external_effect_blocked"),
    );
    await client.invoke(caller, localSaveDef, { text: "仅在隔离回放中写入" });
  });

  const run = await service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "replay-sample",
    execution_kind: "isolated_replay",
    replay_scenario_id: "replay-guarded",
  });
  assert.equal(externalSentCount, 0);
  assert.equal(localSavedCount, 1);
  assert.equal(run.effective_verdict, "passed");
  assert.equal(run.replay?.source_class, "replay");
  assert.equal(run.replay?.blocked_external_effects.length, 1);
  assert.equal(run.replay?.blocked_external_effects[0]?.capability_id, "connectors.gmail.send");
  assert.ok((run.replay?.replay_record_ids.length ?? 0) >= 1);

  observation.layer.flush();
  const assistantWorkQuery = await service.invoke(person(), observationActions.recordsQuery, {
    use: "assistant",
    all_projects: true,
    fact: "notes.saved",
  });
  assert.equal(assistantWorkQuery.records.length, 0, "replay records must never leak into assistant real-work queries (OCL-13, EC-18)");

  const realLookbackQuery = await service.invoke(person(), observationActions.recordsQuery, {
    use: "lookback",
    include_simulated: false,
    all_projects: true,
    fact: "notes.saved",
  });
  assert.equal(realLookbackQuery.records.length, 0, "replay records are excluded from real-work lookback queries");

  const realAuditRun = await service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "replay-sample",
    execution_kind: "evidence_audit",
  });
  assert.equal(realAuditRun.effective_verdict, "unknown", "real-work evidence_audit must never count replay records as real work");
  assert.equal(realAuditRun.unknown_reasons.includes("no_matching_records"), true);
});

test("S-evaluation-isolation 4: disabling observation evaluation use immediately refuses evaluation runs and sample holds", async (t) => {
  const { service, observation } = setupHarness(t);
  await service.invoke(pluginCaller("notes"), observationActions.report, {
    facts: [{ fact: "notes.saved", outcome: "succeeded" }],
  });
  observation.layer.flush();

  await service.invoke(person(), evaluationActions.samplesPut, sampleFixture());
  await service.invoke(person(), observationActions.settingsSet, { uses: { evaluation: false } });

  await assert.rejects(
    service.invoke(person(), evaluationActions.runsExecute, { sample_id: "sample-sec-1" }),
    refused("observation.use_disabled"),
  );
  await assert.rejects(
    service.invoke(
      person(),
      evaluationActions.samplesPut,
      sampleFixture({ sample_id: "sample-sec-held", hold_records: true }),
    ),
    refused("observation.use_disabled"),
  );
});

test("S-evaluation-isolation 5: human reviews preserve automated verdicts and never mutate observation records or business tables", async (t) => {
  const { service, observation } = setupHarness(t);
  const businessRows = [{ id: "doc-1", body: "原始业务正文" }];
  await service.invoke(pluginCaller("notes"), observationActions.report, {
    facts: [
      {
        fact: "notes.saved",
        outcome: "succeeded",
        subjects: [{ kind: "note", id: "doc-1", version: 1 }],
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "原始快照文本" } }],
      },
    ],
  });
  observation.layer.flush();

  const beforeObs = await service.invoke(person(), observationActions.recordsQuery, {
    all_projects: true,
    fact: "notes.saved",
  });
  assert.equal(beforeObs.records.length, 1);

  await service.invoke(
    person(),
    evaluationActions.samplesPut,
    sampleFixture({
      sample_id: "human-review-sample",
      expectations: [
        {
          expectation_id: "exp-human",
          stage: "delivery",
          description: "需要人工核验交付质量",
          source: "human_reference",
          rule: { reference_id: "rubric.delivery", guidance: "检查表述是否失真" },
        },
      ],
    }),
  );

  const initialRun = await service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "human-review-sample",
  });
  assert.equal(initialRun.automated_verdict, "unknown");
  assert.equal(initialRun.effective_verdict, "unknown");
  assert.deepEqual(initialRun.unknown_reasons, ["awaiting_human_review"]);

  const reviewed = await service.invoke(person(), evaluationActions.reviewsRecord, {
    run_id: initialRun.run_id,
    expectation_id: "exp-human",
    verdict: "failed",
    stage: "delivery",
    rationale: "人工复查发现关键结论遗漏前提条件",
    cited_record_ids: [beforeObs.records[0]!.record_id],
  });
  assert.equal(reviewed.run.automated_verdict, "unknown", "automated_verdict must never be overwritten (PWA-52)");
  assert.equal(reviewed.run.effective_verdict, "failed");
  assert.equal(reviewed.run.verdict_source, "human_review");
  assert.deepEqual(reviewed.run.failed_stages, ["delivery"]);
  assert.equal(reviewed.run.expectation_results[0]?.automated_verdict, "unknown");
  assert.equal(reviewed.run.expectation_results[0]?.effective_verdict, "failed");

  // Multi-round reviews: overriding to passed and then back to unknown restores original automated unknown_reasons from immutable run_json.
  const approvedOverride = await service.invoke(person(), evaluationActions.reviewsRecord, {
    run_id: initialRun.run_id,
    verdict: "passed",
    rationale: "二审补充上下文后暂予通过",
  });
  assert.equal(approvedOverride.run.effective_verdict, "passed");
  assert.deepEqual(approvedOverride.run.failed_stages, []);
  assert.deepEqual(approvedOverride.run.unknown_reasons, []);

  const revertedToUnknown = await service.invoke(person(), evaluationActions.reviewsRecord, {
    run_id: initialRun.run_id,
    verdict: "unknown",
    rationale: "撤回二审结论，退回待复核并保留原始未知原因链",
  });
  assert.equal(revertedToUnknown.run.automated_verdict, "unknown");
  assert.equal(revertedToUnknown.run.effective_verdict, "unknown");
  assert.deepEqual(revertedToUnknown.run.unknown_reasons, ["awaiting_human_review"]);
  assert.equal(revertedToUnknown.run.human_reviews.length, 3);

  const afterObs = await service.invoke(person(), observationActions.recordsQuery, {
    all_projects: true,
    fact: "notes.saved",
  });
  assert.deepEqual(afterObs.records, beforeObs.records, "observation records must remain completely untouched (OCL-17)");
  assert.deepEqual(businessRows, [{ id: "doc-1", body: "原始业务正文" }]);
});

test("S-evaluation-isolation 6: cancelled or revoked beforeEffect calls write zero evaluation samples, holds, runs or reviews", async (t) => {
  const { service, observation, setCancelBeforeEffect } = setupHarness(t);
  await service.invoke(pluginCaller("notes"), observationActions.report, {
    facts: [{ fact: "notes.saved", outcome: "succeeded" }],
  });
  observation.layer.flush();

  // 1. Pre-aborted signal writes nothing.
  const controller = new AbortController();
  controller.abort(new ActionError("actions.cancelled", "调用已取消"));
  const cancelledCaller = person({ signal: controller.signal });

  await assert.rejects(
    service.invoke(cancelledCaller, evaluationActions.samplesPut, sampleFixture({ sample_id: "aborted-sample", hold_records: true })),
    refused("actions.cancelled"),
  );
  assert.deepEqual((await service.invoke(person(), evaluationActions.samplesList, {})).samples, []);
  assert.deepEqual((await service.invoke(person(), observationActions.holdsList, {})).holds, []);

  // 2. Post-read `beforeEffect` cancellation on `samples.put` (with `hold_records: true`) writes zero samples AND zero observation holds.
  setCancelBeforeEffect("evaluation.samples.put");
  await assert.rejects(
    service.invoke(person(), evaluationActions.samplesPut, sampleFixture({ sample_id: "before-effect-sample", hold_records: true })),
    refused("actions.cancelled"),
  );
  setCancelBeforeEffect(null);
  assert.deepEqual((await service.invoke(person(), evaluationActions.samplesList, {})).samples, []);
  assert.deepEqual((await service.invoke(person(), observationActions.holdsList, {})).holds, []);

  // 3. Post-read `beforeEffect` cancellation on `runs.execute` (with `hold_records: true`) writes zero runs AND zero observation holds.
  await service.invoke(person(), evaluationActions.samplesPut, sampleFixture({ sample_id: "kept-sample" }));
  setCancelBeforeEffect("evaluation.runs.execute");
  await assert.rejects(
    service.invoke(person(), evaluationActions.runsExecute, { sample_id: "kept-sample", hold_records: true }),
    refused("actions.cancelled"),
  );
  setCancelBeforeEffect(null);
  assert.deepEqual((await service.invoke(person(), evaluationActions.runsList, { sample_id: "kept-sample" })).runs, []);
  assert.deepEqual((await service.invoke(person(), observationActions.holdsList, {})).holds, []);

  // 4. `beforeEffect` cancellation on `reviews.record` writes zero reviews.
  const validRun = await service.invoke(person(), evaluationActions.runsExecute, { sample_id: "kept-sample" });
  setCancelBeforeEffect("evaluation.reviews.record");
  await assert.rejects(
    service.invoke(person(), evaluationActions.reviewsRecord, {
      run_id: validRun.run_id,
      verdict: "failed",
      rationale: "被取消的复查不应写入",
    }),
    refused("actions.cancelled"),
  );
  setCancelBeforeEffect(null);
  const reread = await service.invoke(person(), evaluationActions.runsGet, { run_id: validRun.run_id });
  assert.deepEqual(reread.human_reviews, []);
  assert.equal(reread.verdict_source, "automated");
});
