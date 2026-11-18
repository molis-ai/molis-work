import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  EVALUATION_PROVIDER_ID,
  evaluationActions,
  type EvaluationSampleInput,
  type EvaluationRunView,
  type EvaluationRunComparison,
  type EvaluationMetricsSummary,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { observationActions, type ObservationQueryOutput } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { installHostUiText, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import { TODO_ACTION_PERMISSIONS, todoActions } from "@molis-ai/molis-work-plugin-todo";
import { EvaluationService } from "@molis-ai/molis-work-service-evaluation";
import {
  ObservationLayer,
  observationKeys,
  withObservationSource,
  type ObservationEnvironment,
} from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

installHostUiText();

function memorySecrets() {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => values.get(key) ?? null,
    createIfAbsent: (key: string, value: string) => {
      if (values.has(key)) return false;
      values.set(key, value);
      return true;
    },
  };
}

const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({
  actor_id: LOCAL_PERSON_ACTOR_ID,
  actor_kind: "user",
  audience: "user",
  project_id: null,
  permissions: [],
  ...extra,
});

const pluginCaller = (pluginId: string, projectId: string | null = "p1"): ActionCallContext =>
  person({
    actor_id: `plugin:${pluginId}`,
    actor_kind: "runtime",
    audience: "plugin",
    project_id: projectId,
    host_plugin: {
      plugin_id: pluginId,
      install_id: `${pluginId}-install`,
      actor_id: `plugin:${pluginId}`,
      project_id: projectId,
      declaration: { manifest: {} as never },
      assertActive: () => {},
    },
  });

function createEvaluationFixture(t: test.TestContext) {
  const home = mkdtempSync(join(tmpdir(), "evaluation-svc-"));
  const secrets = memorySecrets();
  let currentNow = new Date("2026-11-15T10:00:00.000Z");
  let currentPlatformVersion = "0.30.0";
  const projects = new Set(["p1", "p2"]);
  const env: ObservationEnvironment = {
    get platformVersion() {
      return currentPlatformVersion;
    },
    now: () => currentNow,
    projectClass: (id) => (projects.has(id) ? "user" : undefined),
    readableProjects: async () => [...projects],
  };

  let shellPass = false;
  const layer = new ObservationLayer({
    home,
    env,
    keys: (has) => observationKeys(secrets, has),
    flushDelayMs: 5,
  });
  const service = new ActionService(undefined, {
    observed: (caller, action, value) => layer.observed(caller, action, value),
  });
  const obsBound = layer.actions(() => {
    if (!shellPass) throw new Error("shell door closed");
  });
  service.registerProvider({
    provider: { provider_id: "system.observation", title: "工作记录", kind: "system" },
    definitions: obsBound.definitions,
    handlers: obsBound.handlers,
  });

  const evaluation = new EvaluationService({
    home,
    clientFor: () => service,
    runInReplayScope: (fn) => withObservationSource("replay", fn),
    now: () => currentNow,
  });
  service.registerProvider(evaluation.provider());

  t.after(() => {
    evaluation.close();
    layer.close();
    rmSync(home, { recursive: true, force: true });
  });

  const reportShell = async (projectId: string | null, facts: Parameters<typeof observationActions.report.action.input_schema>[0] extends never ? never : readonly Record<string, unknown>[]) => {
    shellPass = true;
    try {
      await service.invoke(person({ project_id: projectId }), observationActions.report, { facts: facts as never });
    } finally {
      shellPass = false;
    }
  };

  return {
    home,
    layer,
    evaluation,
    service,
    reportShell,
    setNow: (iso: string) => {
      currentNow = new Date(iso);
    },
    setPlatformVersion: (ver: string) => {
      currentPlatformVersion = ver;
    },
  };
}

test("PWA-51 EC-01 EC-02: end-to-end sample evaluates multi-version object evolution, stage sequence, invocation linkage and prohibits self-certifying success", async (t) => {
  const fx = createEvaluationFixture(t);

  await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, {
    facts: [
      {
        fact: "pages.draft_created",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:00:00.000Z",
        work: { work_ref: "work-ec01" },
        subjects: [{ kind: "page", id: "page-1", version: 1 }],
        evidence: [{ role: "body", ref: { kind: "content", media_type: "text/markdown", text: "初稿：核心问题拆解" } }],
      },
      {
        fact: "pages.revised",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:05:00.000Z",
        work: { work_ref: "work-ec01" },
        subjects: [{ kind: "page", id: "page-1", version: 2 }],
        evidence: [{ role: "body", ref: { kind: "content", media_type: "text/markdown", text: "修订稿：核心问题拆解与行动方案" } }],
      },
    ],
  });
  await fx.service.invoke(pluginCaller("goals", "p1"), observationActions.report, {
    facts: [
      {
        fact: "goals.linked_deliverable",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:06:00.000Z",
        work: { work_ref: "work-ec01" },
        subjects: [{ kind: "goal", id: "goal-1", version: 1 }, { kind: "page", id: "page-1", version: 2 }],
      },
    ],
  });
  fx.layer.flush();

  const ec01Sample: EvaluationSampleInput = {
    sample_id: "ec-01-multi-version",
    version: 1,
    title: "EC-01 对象多版本修订与下游目标引用",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    case_ref: "EC-01",
    initial_intent: "创建文稿初稿、修订出第二版并挂接到目标交付物",
    query: { project_id: "p1", work_ref: "work-ec01" },
    expectations: [
      {
        expectation_id: "exp-seq",
        stage: "execution",
        description: "按序完成初稿、修订与目标挂接",
        source: "deterministic",
        rule: { check: "stage_sequence", facts: ["pages.draft_created", "pages.revised", "goals.linked_deliverable"] },
      },
      {
        expectation_id: "exp-versions",
        stage: "delivery",
        description: "文稿至少演进出 2 个独立版本",
        source: "deterministic",
        rule: { check: "distinct_owner_versions", subject_kind: "page", subject_id: "page-1", min_distinct_versions: 2 },
      },
      {
        expectation_id: "exp-body",
        stage: "delivery",
        description: "修订稿包含行动方案",
        source: "deterministic",
        rule: { check: "evidence_text", fact: "pages.revised", evidence_role: "body", contains_all: ["行动方案"] },
      },
    ],
  };

  await fx.service.invoke(person(), evaluationActions.samplesPut, ec01Sample);
  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-01-multi-version" });
  assert.equal(run.effective_verdict, "passed");
  assert.deepEqual(run.failed_stages, []);
  assert.equal(run.expectation_results.every((r) => r.evidence_refs.length > 0), true);

  // Self-certifying agent failure check (PWA-52, PWA-55): agent claims succeeded while underlying action call failed.
  fx.layer.observed(
    { ...person({ project_id: "p1", audience: "agent", actor_id: "agent:assistant", call_id: "call-bad" }) },
    { capability_id: "todo.create", version: 1, provider_id: "io.molis.work.todo", operation: "command" },
    {
      invocation_id: "inv-child-fail",
      started_at: 100,
      ended_at: 120,
      handler_started: true,
      outcome: { ok: false, code: "todo.invalid" },
      aborted: false,
    },
  );
  fx.layer.sink("agent").bind({
    kind: "background",
    actor_id: "agent:assistant",
    project_id: "p1",
    entry: "agent",
    call_id: "call-bad",
  }).record({
    fact: "agent.round_completed",
    outcome: "succeeded",
    occurred_at: "2026-11-15T09:10:00.000Z",
    work: { work_ref: "work-self-cert" },
  });
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "no-self-cert",
    version: 1,
    title: "禁止脱离真实落库证据的模型自证成功",
    purpose: "validation",
    work_mode: "assistant",
    project_id: "p1",
    initial_intent: "创建待办并确认真实写入",
    query: { project_id: "p1", call_id: "call-bad" },
    expectations: [
      {
        expectation_id: "exp-honest",
        stage: "execution",
        description: "底层动作失败无写入时不得判定成功",
        source: "deterministic",
        rule: { check: "no_self_certifying_success" },
      },
    ],
  });
  const selfCertRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "no-self-cert" });
  assert.equal(selfCertRun.effective_verdict, "failed");
  assert.deepEqual(selfCertRun.failed_stages, ["execution"]);
});

test("EC-06 EC-08 EC-09 PWA-55 PWA-56: evaluator restraint, unexposed unknown, funnel stage separation and interleaved work isolation", async (t) => {
  const fx = createEvaluationFixture(t);

  // 1. Restraint ("quiet" posture) passes when non-intrusive (EC-06, PWA-56).
  fx.layer.sink("assistant").bind({
    kind: "background",
    actor_id: "agent:assistant",
    project_id: "p1",
    entry: "assistant",
  }).record({
    fact: "assistant.opportunity_assessed",
    outcome: "no_action",
    occurred_at: "2026-11-15T09:20:00.000Z",
    work: { work_ref: "work-ec06-quiet" },
    detail: { posture: "quiet", reason: "low_confidence_noise" },
  });

  // 2. Funnel separation (EC-08, PWA-55): presented -> viewed -> selected -> completed, then undone_or_reworked!
  await fx.reportShell("p1", [
    { fact: "ui.suggestion.presented", outcome: "succeeded", work: { work_ref: "work-ec08" } },
    { fact: "ui.suggestion.viewed", outcome: "succeeded", work: { work_ref: "work-ec08" } },
    { fact: "ui.suggestion.selected", outcome: "succeeded", work: { work_ref: "work-ec08" } },
    { fact: "ui.outcome.adopted", outcome: "succeeded", work: { work_ref: "work-ec08" } },
    { fact: "ui.outcome.undone", outcome: "succeeded", work: { work_ref: "work-ec08" } },
  ]);

  // 3. Interleaved work isolation (EC-09): primary and secondary tasks run concurrently without cross-talk.
  await fx.service.invoke(
    { ...pluginCaller("pages", "p1"), call_id: "call-primary" },
    observationActions.report,
    {
      facts: [
        {
          fact: "pages.edited",
          outcome: "succeeded",
          work: { work_ref: "work-primary" },
          subjects: [{ kind: "page", id: "doc-primary", version: 1 }],
        },
      ],
    },
  );
  await fx.service.invoke(
    { ...pluginCaller("todo", "p1"), call_id: "call-secondary" },
    observationActions.report,
    {
      facts: [
        {
          fact: "todo.created",
          outcome: "succeeded",
          work: { work_ref: "work-secondary" },
          subjects: [{ kind: "todo", id: "todo-secondary", version: 1 }],
        },
      ],
    },
  );
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "ec-06-restraint",
    version: 1,
    title: "EC-06 噪音机会保持安静不打扰",
    purpose: "validation",
    work_mode: "assistant",
    project_id: "p1",
    case_ref: "EC-06",
    initial_intent: "无关动态出现时不打断当前写作",
    query: { project_id: "p1", work_ref: "work-ec06-quiet" },
    opportunity_basis: {
      source: "independent_fixture",
      description: "预设低价值噪音输入样本",
      expected_posture: "quiet",
    },
    expectations: [
      {
        expectation_id: "exp-quiet",
        stage: "interaction",
        description: "应保持安静且不弹出打扰卡片",
        source: "evaluator",
        rule: {
          evaluator_id: "posture.restraint",
          evaluator_version: "initial",
          rubric: "无关噪音输入应判定为 quiet，不得产生打扰展示",
          expected_posture: "quiet",
          forbidden_facts: ["ui.opportunity.presented"],
          acceptable_outcomes: ["no_action"],
        },
      },
      {
        expectation_id: "exp-unexposed-feedback",
        stage: "delivery",
        description: "未向用户展示的机会不计正负反馈",
        source: "deterministic",
        rule: {
          check: "record_count",
          fact: "ui.outcome.adopted",
          min_count: 1,
          require_exposure_for_feedback: true,
        },
      },
    ],
  });

  const restraintRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-06-restraint" });
  assert.equal(restraintRun.expectation_results[0]?.effective_verdict, "passed");
  assert.equal(restraintRun.expectation_results[1]?.effective_verdict, "unknown");
  assert.deepEqual(restraintRun.expectation_results[1]?.unknown_reasons, ["unexposed"]);
  assert.equal(restraintRun.effective_verdict, "unknown", "unexposed feedback yields unknown rather than passed or failed (PWA-56)");

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "ec-08-funnel",
    version: 1,
    title: "EC-08 选用后撤销不得算净采用成功",
    purpose: "validation",
    work_mode: "assistant",
    project_id: "p1",
    case_ref: "EC-08",
    initial_intent: "区分点击采用与随后立即撤销重做",
    query: { project_id: "p1", work_ref: "work-ec08" },
    expectations: [
      {
        expectation_id: "exp-net-adoption",
        stage: "delivery",
        description: "净采用要求至少 1 次采用且 0 次撤销重做",
        source: "deterministic",
        rule: { check: "funnel_stage_separation", min_count: 1, max_count: 0 },
      },
    ],
  });
  const funnelRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-08-funnel" });
  assert.equal(funnelRun.effective_verdict, "failed");
  assert.equal(funnelRun.funnel.presented, 1);
  assert.equal(funnelRun.funnel.selected, 1);
  assert.equal(funnelRun.funnel.adopted, 1);
  assert.equal(funnelRun.funnel.undone_or_reworked, 1);

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "ec-09-interleaved",
    version: 1,
    title: "EC-09 主工作与穿插次工作相互隔离",
    purpose: "validation",
    work_mode: "mixed",
    project_id: "p1",
    case_ref: "EC-09",
    initial_intent: "穿插新建待办不污染主文稿上下文与对象",
    query: { project_id: "p1" },
    expectations: [
      {
        expectation_id: "exp-isolated",
        stage: "execution",
        description: "两个 work_ref 的调用链与主对象严格隔离",
        source: "deterministic",
        rule: {
          check: "interleaved_isolation",
          primary_work_ref: "work-primary",
          secondary_work_ref: "work-secondary",
          subject_id: "doc-primary",
        },
      },
    ],
  });
  const interleavedRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-09-interleaved" });
  assert.equal(interleavedRun.effective_verdict, "passed");
});

test("EC-16 OCL-12 OCL-14 PWA-54 PWA-55: sample holds survive cleanup while unheld expired records become unknown, plus 6-stage compare & metrics split", async (t) => {
  const fx = createEvaluationFixture(t);

  await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, {
    facts: [
      {
        fact: "pages.summary_saved",
        outcome: "succeeded",
        occurred_at: "2026-09-01T08:00:00.000Z",
        work: { work_ref: "held-work" },
        conditions: { skills: [{ id: "skill.summary", version: 1 }], model: { provider: "google", model_id: "gemini-2.5-flash" } },
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "含里程碑风险清单的完整摘要" } }],
      },
      {
        fact: "pages.summary_saved",
        outcome: "succeeded",
        occurred_at: "2026-09-01T08:05:00.000Z",
        work: { work_ref: "unheld-work" },
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "未加留存的旧摘要" } }],
      },
    ],
  });
  fx.layer.flush();

  const putHeld = await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "ec-16-held",
    version: 1,
    title: "EC-16 加留存的历史样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    case_ref: "EC-16",
    initial_intent: "保留关键证据供回归评测",
    query: { project_id: "p1", work_ref: "held-work" },
    hold_records: true,
    expectations: [
      {
        expectation_id: "exp-held-text",
        stage: "delivery",
        description: "留存证据在清理后仍可读并命中要点",
        source: "deterministic",
        rule: { check: "evidence_text", fact: "pages.summary_saved", evidence_role: "output", contains_all: ["里程碑风险清单"] },
      },
    ],
  });
  assert.equal(putHeld.sample.held_record_count, 1);
  assert.ok(putHeld.sample.hold_id);

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "ec-16-unheld",
    version: 1,
    title: "EC-16 未加留存的历史样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    case_ref: "EC-16",
    initial_intent: "验证清理后归为 unknown 而非 failed",
    query: { project_id: "p1", work_ref: "unheld-work" },
    expectations: [
      {
        expectation_id: "exp-unheld-text",
        stage: "delivery",
        description: "清理后缺失应报 unknown",
        source: "deterministic",
        rule: { check: "evidence_text", fact: "pages.summary_saved", evidence_role: "output", contains_all: ["旧摘要"] },
      },
    ],
  });

  // Clean up records older than 30 days: held-work stays intact; unheld-work expires!
  const cleaned = await fx.service.invoke(person(), observationActions.cleanupApply, {
    time_range: "before_30d",
    project_id: "p1",
  });
  assert.equal(cleaned.deleted_records, 1);

  const heldRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-16-held" });
  assert.equal(heldRun.effective_verdict, "passed");

  const unheldRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "ec-16-unheld" });
  assert.equal(unheldRun.effective_verdict, "unknown");
  assert.equal(unheldRun.unknown_reasons.includes("coverage_gap_expired"), true);

  // Incomplete window check (window_incomplete):
  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "future-window-sample",
    version: 1,
    title: "观察窗口尚未结束的样本",
    purpose: "tuning",
    work_mode: "assistant",
    project_id: "p1",
    initial_intent: "等待下游反工观察窗口截止",
    query: { project_id: "p1", work_ref: "held-work" },
    window: { observation_cutoff_at: "2026-12-01T00:00:00.000Z" },
    expectations: [
      {
        expectation_id: "exp-cutoff",
        stage: "delivery",
        description: "窗口截止前不提前判赢",
        source: "deterministic",
        rule: { check: "record_count", fact: "pages.summary_saved", min_count: 1 },
      },
    ],
  });
  const cutoffRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "future-window-sample" });
  assert.equal(cutoffRun.effective_verdict, "unknown");
  assert.equal(cutoffRun.unknown_reasons.includes("window_incomplete"), true);

  // Six-stage cross-version comparison (PWA-54): baseline fails at skill & delivery, candidate passes on p2 after Skill upgrade.
  await fx.service.invoke(pluginCaller("pages", "p2"), observationActions.report, {
    facts: [
      {
        fact: "pages.summary_saved",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:30:00.000Z",
        work: { work_ref: "compare-v1" },
        conditions: { skills: [{ id: "skill.summary", version: 1 }], model: { provider: "google", model_id: "gemini-2.5-flash" } },
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "初版泛泛总结" } }],
      },
    ],
  });
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "compare-sample",
    version: 1,
    title: "跨版本六阶段对比样本",
    purpose: "tuning",
    work_mode: "assistant",
    project_id: "p2",
    initial_intent: "产出带量化指标与下一步负责人的总结",
    query: { project_id: "p2", fact: "pages.summary_saved" },
    expectations: [
      {
        expectation_id: "exp-skill-loaded",
        stage: "skill",
        description: "需启用总结 Skill",
        source: "evaluator",
        rule: {
          evaluator_id: "summary.quality",
          evaluator_version: "initial",
          rubric: "必须加载总结 Skill 并包含量化指标",
          required_skill_ids: ["skill.summary"],
          required_evidence_terms: ["量化指标"],
        },
      },
      {
        expectation_id: "exp-responsible-person", stage: "skill", source: "evaluator", description: "说明下一步负责人",
        rule: { evaluator_id: "summary.owner", evaluator_version: "1", rubric: "说明下一步负责人",
          required_evidence_terms: ["下一步负责人"], allowed_variations: ["下一步责任人"] },
      },
    ],
  });

  const baselineRun = await fx.service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "compare-sample",
    model_run_info: { mode: "stand_in", provider: "google", model_id: "gemini-2.5-flash", api_format: "openai-chat-completions" },
  });
  assert.equal(baselineRun.effective_verdict, "failed");
  assert.deepEqual(baselineRun.failed_stages, ["skill"]);

  fx.setPlatformVersion("0.30.1");
  await fx.service.invoke(pluginCaller("pages", "p2"), observationActions.report, {
    facts: [
      {
        fact: "pages.summary_saved",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:45:00.000Z",
        work: { work_ref: "compare-v2" },
        conditions: { skills: [{ id: "skill.summary", version: 2 }], model: { provider: "google", model_id: "gemini-2.5-flash" } },
        evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "新版：量化指标达 98%，已明确下一步责任人" } }],
      },
    ],
  });
  fx.layer.flush();

  const candidateRun = await fx.service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "compare-sample",
    model_run_info: { mode: "stand_in", provider: "google", model_id: "gemini-2.5-flash", api_format: "openai-chat-completions" },
  });
  assert.equal(candidateRun.effective_verdict, "passed");

  const comparison = await fx.service.invoke(person(), evaluationActions.runsCompare, {
    baseline_run_id: baselineRun.run_id,
    candidate_run_id: candidateRun.run_id,
  });
  assert.equal(comparison.comparable, true);
  assert.deepEqual(comparison.verdict_change, { from: "failed", to: "passed" });
  assert.equal(comparison.incomparable_differences.some((d) => d.includes("Skill 版本变化")), true);
  const skillStageDiff = comparison.stage_diffs.find((s) => s.stage === "skill");
  assert.equal(skillStageDiff?.baseline_verdict, "failed");
  assert.equal(skillStageDiff?.candidate_verdict, "passed");
  const understandingStageDiff = comparison.stage_diffs.find((s) => s.stage === "understanding");
  assert.equal(understandingStageDiff?.baseline_verdict, "unknown", "a stage with no expectation is not evaluated");
  assert.equal(understandingStageDiff?.candidate_verdict, "unknown", "a stage with no expectation is not evaluated");

  // Cross-purpose comparison (tuning vs validation) is explicitly marked incomparable (PWA-54):
  const crossPurpose = await fx.service.invoke(person(), evaluationActions.runsCompare, {
    baseline_run_id: heldRun.run_id,
    candidate_run_id: candidateRun.run_id,
  });
  assert.equal(crossPurpose.comparable, false);

  // Metrics summarize separates validation from tuning (PWA-54, PWA-55):
  const validationMetrics = await fx.service.invoke(person(), evaluationActions.metricsSummarize, {
    purpose: "validation",
  });
  assert.equal(validationMetrics.purpose, "validation");
  assert.equal(validationMetrics.sample_count, 2);
  assert.equal(validationMetrics.denominator, 2);
  assert.equal(validationMetrics.evaluable_count, 1);
  assert.equal(validationMetrics.verdict_counts.passed, 1);
  assert.equal(validationMetrics.verdict_counts.unknown, 1);
  assert.equal(validationMetrics.unknown_reason_counts.coverage_gap_expired, 1);

  const tuningMetrics = await fx.service.invoke(person(), evaluationActions.metricsSummarize, {
    purpose: "tuning",
  });
  assert.equal(tuningMetrics.purpose, "tuning");
  assert.equal(tuningMetrics.sample_count, 2);
  assert.equal(tuningMetrics.denominator, 3);
  assert.equal(tuningMetrics.verdict_counts.passed, 1);
  assert.equal(tuningMetrics.verdict_counts.failed, 1);
  assert.equal(tuningMetrics.verdict_counts.unknown, 1);

  // Removing sample releases hold while retaining historical runs:
  const removed = await fx.service.invoke(person(), evaluationActions.samplesRemove, {
    sample_id: "ec-16-held",
    release_holds: true,
  });
  assert.deepEqual(removed.removed_versions, [1]);
  assert.equal(removed.released_hold_ids.length, 1);
  const retainedRun = await fx.service.invoke(person(), evaluationActions.runsGet, { run_id: heldRun.run_id });
  assert.equal(retainedRun.run_id, heldRun.run_id);
});

test("Host composition: MolisWorkLocalHost lazily opens evaluation.db, evaluates real Todo plugin work, and clears project rows on deletion", async (t) => {
  const testHome = await openTestHome(t);
  const evalDbFile = join(testHome.home, "evaluation", "evaluation.db");
  assert.equal(existsSync(evalDbFile), false, "evaluation.db must not be created eagerly before evaluation.* is called");

  const project = await testHome.createProject("评测宿主集成项目", ["todo"]);
  const projectCaller = person({
    project_id: project.project_id,
    permissions: TODO_ACTION_PERMISSIONS,
    readable_project_ids: [project.project_id],
  });
  const projectClient = testHome.host.actionClient(project.reference);

  const discovered = await projectClient.discover(projectCaller);
  assert.equal(
    discovered.some((view) => view.provider.provider_id === EVALUATION_PROVIDER_ID && view.capability_id === "evaluation.runs.execute"),
    true,
  );

  const createdTodo = await projectClient.invoke(projectCaller, todoActions.create, {
    title: "完成第 30 批宿主端到端评测",
    placement: "project",
  });
  assert.ok(createdTodo.item.id);

  await projectClient.invoke(projectCaller, evaluationActions.samplesPut, {
    sample_id: "host-todo-sample",
    version: 1,
    title: "真实 Todo 插件创建动作评测",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: project.project_id,
    initial_intent: "在项目内创建一条待办并落入工作记录",
    query: { project_id: project.project_id, fact: "action.call" },
    expectations: [
      {
        expectation_id: "exp-todo-call",
        stage: "execution",
        description: "观察到 todo.items.create 成功调用记录",
        source: "deterministic",
        rule: {
          check: "record_count",
          fact: "action.call",
          outcomes: ["succeeded"],
          detail_equals: { action: "todo.items.create@1" },
          min_count: 1,
        },
      },
    ],
  });
  assert.equal(existsSync(evalDbFile), true, "evaluation.db opens lazily on first evaluation.* call");

  const run = await projectClient.invoke(projectCaller, evaluationActions.runsExecute, {
    sample_id: "host-todo-sample",
  });
  assert.equal(run.effective_verdict, "passed");

  // Also register a Home-scoped sample so we verify project deletion only deletes the target project's evaluation data.
  const homeClient = testHome.host.homeActionClient();
  await homeClient.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "home-level-sample",
    version: 1,
    title: "Home 级保留样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: null,
    initial_intent: "删项目时保留无关的 Home 样本",
    query: { project_id: null },
    expectations: [
      {
        expectation_id: "exp-zero",
        stage: "understanding",
        description: "允许 0 条",
        source: "deterministic",
        rule: { check: "record_count", min_count: 0 },
      },
    ],
  });

  await projectDeletedHooksFor(testHome.home).clear("evaluation", project.project_id);

  const remainingProjectSamples = await homeClient.invoke(person(), evaluationActions.samplesList, {
    project_id: project.project_id,
  });
  assert.deepEqual(remainingProjectSamples.samples, []);

  const remainingHomeSamples = await homeClient.invoke(person(), evaluationActions.samplesList, {
    project_id: null,
  });
  assert.equal(remainingHomeSamples.samples.length, 1);
  assert.equal(remainingHomeSamples.samples[0]?.sample_id, "home-level-sample");
});

test("PWA-55 PWA-56 OCL-08 OCL-14: incomplete observation window, partial missing snapshots, pinned_record_ids and required_evidence yield unknown without masking hard violations", async (t) => {
  const fx = createEvaluationFixture(t);

  // 1. Opportunity presented (`presented = 1, adopted = 0`) while `evaluated_at < observation_cutoff_at` -> `unknown` (`window_incomplete`), NOT `failed`.
  await fx.reportShell("p1", [
    { fact: "ui.suggestion.presented", outcome: "waiting", work: { work_ref: "work-open-window" } },
  ]);
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "open-window-presented",
    version: 1,
    title: "已呈现但尚未到观察截止时间的机会样本",
    purpose: "validation",
    work_mode: "assistant",
    project_id: "p1",
    initial_intent: "观察截止前未收齐采用结果须记为 unknown",
    query: { project_id: "p1", work_ref: "work-open-window" },
    window: { observation_cutoff_at: "2026-12-01T00:00:00.000Z" },
    expectations: [
      {
        expectation_id: "exp-funnel-pending",
        stage: "delivery",
        description: "等待用户采用反馈",
        source: "deterministic",
        rule: { check: "funnel_stage_separation", min_count: 1, max_count: 0 },
      },
      {
        expectation_id: "exp-count-pending",
        stage: "interaction",
        description: "等待至少 2 条交互记录",
        source: "deterministic",
        rule: { check: "record_count", fact: "ui.suggestion.presented", min_count: 2 },
      },
      {
        expectation_id: "exp-eval-pending",
        stage: "execution",
        description: "等待最终完成结局",
        source: "evaluator",
        rule: {
          evaluator_id: "eval.pending-outcome",
          evaluator_version: "1.0.0",
          rubric: "完成后应达到 succeeded 结局",
          acceptable_outcomes: ["succeeded"],
        },
      },
    ],
  });

  const pendingRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "open-window-presented" });
  assert.equal(pendingRun.effective_verdict, "unknown", "open cutoff window with pending adoption must be unknown, not failed");
  assert.deepEqual(pendingRun.failed_stages, []);
  assert.equal(pendingRun.unknown_reasons.includes("window_incomplete"), true);
  assert.equal(pendingRun.expectation_results.every((r) => r.effective_verdict === "unknown"), true);

  // Hard violation inside an open window (e.g. user already undid the suggestion) still fails immediately.
  await fx.reportShell("p1", [
    { fact: "ui.outcome.undone", outcome: "succeeded", work: { work_ref: "work-open-window" } },
  ]);
  fx.layer.flush();
  const hardViolatedRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "open-window-presented" });
  assert.equal(hardViolatedRun.effective_verdict, "failed");
  assert.deepEqual(hardViolatedRun.failed_stages, ["delivery"]);

  // 2. Multi-record sample where one record's evidence is missing (`truncated`) while another remains available -> `unknown` for missing required term, `failed` for forbidden term.
  await fx.service.invoke(pluginCaller("pages", "p2"), observationActions.report, {
    facts: [
      {
        fact: "pages.multi_snap",
        outcome: "succeeded",
        occurred_at: "2026-09-01T08:00:00.000Z",
        work: { work_ref: "work-partial-missing" },
        evidence: [{ role: "body", ref: { kind: "missing", reason: "truncated" } }],
      },
      {
        fact: "pages.multi_snap",
        outcome: "succeeded",
        occurred_at: "2026-11-15T09:50:00.000Z",
        work: { work_ref: "work-partial-missing" },
        evidence: [{ role: "body", ref: { kind: "content", media_type: "text/plain", text: "第二版：简短补充说明" } }],
      },
    ],
  });
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "partial-missing-evidence",
    version: 1,
    title: "多记录部分快照缺失样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p2",
    initial_intent: "部分证据快照缺失时未命中正词判 unknown",
    query: { project_id: "p2", work_ref: "work-partial-missing" },
    expectations: [
      {
        expectation_id: "exp-det-partial",
        stage: "delivery",
        description: "核对关键风险推演",
        source: "deterministic",
        rule: { check: "evidence_text", fact: "pages.multi_snap", evidence_role: "body", contains_all: ["关键风险推演"] },
      },
      {
        expectation_id: "exp-eval-partial",
        stage: "materials",
        description: "评测器核对关键风险推演",
        source: "evaluator",
        rule: {
          evaluator_id: "eval.partial-evidence",
          evaluator_version: "1.0.0",
          rubric: "需覆盖关键风险推演",
          required_evidence_terms: ["关键风险推演"],
        },
      },
    ],
  });

  const partialRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "partial-missing-evidence" });
  assert.equal(partialRun.effective_verdict, "unknown");
  assert.deepEqual(partialRun.failed_stages, []);
  assert.equal(partialRun.unknown_reasons.includes("evidence_missing"), true);
  assert.equal(partialRun.expectation_results.every((r) => r.effective_verdict === "unknown"), true);

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "partial-missing-evidence",
    version: 2,
    title: "多记录部分缺失但命中禁用词样本",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p2",
    initial_intent: "可用快照已命中禁用词时即使另一条缺失仍直接判 failed",
    query: { project_id: "p2", work_ref: "work-partial-missing" },
    expectations: [
      {
        expectation_id: "exp-det-forbidden-hit",
        stage: "delivery",
        description: "禁用词在现存快照中已命中",
        source: "deterministic",
        rule: { check: "evidence_text", fact: "pages.multi_snap", evidence_role: "body", forbids_any: ["简短补充"] },
      },
    ],
  });
  const forbiddenHitRun = await fx.service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "partial-missing-evidence",
    sample_version: 2,
  });
  assert.equal(forbiddenHitRun.effective_verdict, "failed");
  assert.deepEqual(forbiddenHitRun.failed_stages, ["delivery"]);

  // 3. `pinned_record_ids` filters out unpinned records, and `required_evidence: true` without concrete evidence yields `unknown: ["evidence_missing"]`.
  await fx.service.invoke(pluginCaller("todo", "p2"), observationActions.report, {
    facts: [
      { fact: "todo.bare", outcome: "succeeded", work: { work_ref: "work-pin-req" } },
      { fact: "todo.bare", outcome: "failed", work: { work_ref: "work-pin-req" } },
    ],
  });
  fx.layer.flush();
  const bareRecords = await fx.service.invoke(person(), observationActions.recordsQuery, {
    project_id: "p2",
    work_ref: "work-pin-req",
  });
  const succeededBareId = bareRecords.records.find((r) => r.outcome === "succeeded")!.record_id;

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "pinned-and-required-evidence",
    version: 1,
    title: "固定记录过滤与必带证据守卫",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p2",
    initial_intent: "仅评估 pinned_record_ids 并在缺少快照或对象引用时报 evidence_missing",
    query: { project_id: "p2", work_ref: "work-pin-req" },
    pinned_record_ids: [succeededBareId],
    expectations: [
      {
        expectation_id: "exp-only-pinned",
        stage: "execution",
        description: "未固定的失败记录不应计入",
        source: "deterministic",
        rule: { check: "record_count", fact: "todo.bare", outcomes: ["failed"], min_count: 0, max_count: 0 },
      },
      {
        expectation_id: "exp-needs-evidence",
        stage: "delivery",
        description: "要求具备可核对证据但记录无快照",
        source: "deterministic",
        required_evidence: true,
        rule: { check: "record_count", fact: "todo.bare", outcomes: ["succeeded"], min_count: 1 },
      },
    ],
  });

  const pinnedRun = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "pinned-and-required-evidence" });
  assert.equal(pinnedRun.observed_conditions.record_count, 1);
  assert.equal(pinnedRun.expectation_results[0]?.effective_verdict, "passed");
  assert.equal(pinnedRun.expectation_results[1]?.effective_verdict, "unknown");
  assert.deepEqual(pinnedRun.expectation_results[1]?.unknown_reasons, ["evidence_missing"]);
  assert.equal(pinnedRun.effective_verdict, "unknown");
});

test("OCL-08 PWA-55: a coverage gap in scope makes the run unknown even when every expectation passes", async (t) => {
  const fx = createEvaluationFixture(t);
  await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, {
    facts: [
      { fact: "pages.gap_sample", outcome: "succeeded", occurred_at: "2026-09-01T08:00:00.000Z", work: { work_ref: "work-gap" } },
      { fact: "pages.gap_sample", outcome: "succeeded", occurred_at: "2026-11-15T09:00:00.000Z", work: { work_ref: "work-gap" } },
    ],
  });
  fx.layer.flush();

  const cleaned = await fx.service.invoke(person(), observationActions.cleanupApply, {
    time_range: "before_30d",
    project_id: "p1",
  });
  assert.equal(cleaned.deleted_records, 1);

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "coverage-gap-with-passing-rule",
    version: 1,
    title: "覆盖缺口不能被通过的规则掩盖",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    initial_intent: "范围内存在到期清理缺口时整次运行必须判 unknown",
    query: { project_id: "p1", work_ref: "work-gap" },
    expectations: [
      {
        expectation_id: "exp-source-only",
        stage: "execution",
        description: "剩余记录都来自真实工作",
        source: "deterministic",
        rule: { check: "source_isolation", source_classes: ["real"] },
      },
    ],
  });

  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "coverage-gap-with-passing-rule" });
  assert.equal(run.expectation_results[0]?.automated_verdict, "passed");
  assert.equal(run.effective_verdict, "unknown");
  assert.equal(run.unknown_reasons.includes("coverage_gap_expired"), true);
  assert.equal(run.coverage_limitations.length > 0, true);
});

test("OCL-08 PWA-55: empty matches do not pass absence or self-certifying checks", async (t) => {
  const fx = createEvaluationFixture(t);
  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "empty-match-not-success",
    version: 1,
    title: "没有匹配记录不能当成通过",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    initial_intent: "空匹配的缺证据与禁自证检查必须判 unknown",
    query: { project_id: "p1", fact: "pages.none_such_fact" },
    expectations: [
      {
        expectation_id: "exp-absence",
        stage: "delivery",
        description: "没有匹配证据可核对",
        source: "deterministic",
        rule: { check: "evidence_absent", forbids_any: ["绝不能留存的片段"] },
      },
      {
        expectation_id: "exp-self-cert",
        stage: "execution",
        description: "没有记录可核对自证成功",
        source: "deterministic",
        rule: { check: "no_self_certifying_success" },
      },
    ],
  });

  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "empty-match-not-success" });
  assert.equal(run.observed_conditions.record_count, 0);
  assert.equal(run.effective_verdict, "unknown");
  assert.equal(run.unknown_reasons.includes("no_matching_records"), true);
  assert.equal(run.expectation_results.every((item) => item.automated_verdict === "unknown"), true);
  assert.equal(run.expectation_results.every((item) => item.unknown_reasons.includes("no_matching_records")), true);
});

test("PWA-51 OCL-14: evaluation reads a work larger than the 500-record page instead of truncating it", async (t) => {
  const fx = createEvaluationFixture(t);
  for (let batch = 0; batch < 6; batch += 1) {
    const facts = Array.from({ length: 100 }, (_, index) => ({
      fact: "pages.bulk_record",
      outcome: "succeeded" as const,
      occurred_at: new Date(Date.parse("2026-11-15T08:00:00.000Z") + (batch * 100 + index) * 1000).toISOString(),
      work: { work_ref: "work-bulk" },
      detail: { ordinal: batch * 100 + index },
    }));
    await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, { facts });
  }
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "large-work-over-page",
    version: 1,
    title: "超过单页上限的完整工作",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    initial_intent: "600 条记录必须全部读到，不能只读第一页",
    query: { project_id: "p1", work_ref: "work-bulk" },
    expectations: [
      {
        expectation_id: "exp-all-records",
        stage: "execution",
        description: "完整读取 600 条记录",
        source: "deterministic",
        rule: { check: "record_count", fact: "pages.bulk_record", min_count: 600 },
      },
    ],
  });

  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "large-work-over-page" });
  assert.equal(run.observed_conditions.record_count, 600);
  assert.equal(run.effective_verdict, "passed");
});

test("PWA-53 OCL-13: a simulated run excludes real records by default", async (t) => {
  const fx = createEvaluationFixture(t);
  await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, {
    facts: [{ fact: "pages.real_work", outcome: "succeeded", work: { work_ref: "work-sim" } }],
  });
  await withObservationSource("trial", async () => {
    await fx.service.invoke(pluginCaller("pages", "p1"), observationActions.report, {
      facts: [{ fact: "pages.trial_work", outcome: "succeeded", work: { work_ref: "work-sim" } }],
    });
  });
  fx.layer.flush();

  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "simulated-source-isolation",
    version: 1,
    title: "模拟运行不混入真实记录",
    purpose: "validation",
    work_mode: "manual_plugin",
    project_id: "p1",
    initial_intent: "默认只读 demo/trial/replay/system_check 来源",
    query: { project_id: "p1", work_ref: "work-sim" },
    expectations: [
      {
        expectation_id: "exp-only-demo",
        stage: "execution",
        description: "记录全部来自模拟来源",
        source: "deterministic",
        rule: { check: "source_isolation", source_classes: ["trial"] },
      },
    ],
  });

  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, {
    sample_id: "simulated-source-isolation",
    execution_kind: "simulated",
  });
  assert.deepEqual(run.observed_conditions.source_classes, ["trial"]);
  assert.equal(run.observed_conditions.record_count, 1);
  assert.equal(run.effective_verdict, "passed");
});

test("PWA-52 OCL-04: delivery rubrics use the reply body and keep missing evidence unknown", async t => {
  const fx = createEvaluationFixture(t);
  const sink = fx.layer.sink("agent").bind({ kind: "background", actor_id: "agent:assistant", project_id: "p1", entry: "agent", call_id: "reply-test" });
  const content = (role: string, text: string) => ({ role, ref: { kind: "content" as const, media_type: "text/plain", text } });
  for (const [id, answer, expected] of [
    ["wrong", "蓝色杯子放在桌上。", "failed"], ["right", "留存豁免与隔离回放", "passed"], ["half", "留存豁免", "failed"],
    ["reasoning-only", "", "unknown"], ["truncated", "", "unknown"], ["two-replies", "隔离回放", "unknown"], ["forbidden", "留存豁免与隔离回放，已经发布", "failed"],
  ] as const) {
    const work = { work_ref: id };
    sink.record({ fact: "agent.model_request", outcome: "succeeded", work, evidence: [content("request", "留存豁免、隔离回放、已经发布")] });
    sink.record({ fact: "agent.reply", outcome: "succeeded", work, evidence: [
      content("reasoning", "留存豁免与隔离回放，已经发布"),
      ...(answer ? [content("reply", answer)] : []),
      ...(id === "truncated" ? [{ role: "reply", ref: { kind: "missing" as const, reason: "truncated" as const } }] : []),
    ] });
    if (id === "two-replies") {
      sink.record({ fact: "agent.reply", outcome: "succeeded", work, evidence: [content("reply", "留存豁免")] });
    }
    fx.layer.flush();
    await fx.service.invoke(person(), evaluationActions.samplesPut, {
      sample_id: id, version: 1, title: "独立核对回复正文", purpose: "validation", work_mode: "assistant", project_id: "p1",
      initial_intent: "核对留存豁免和隔离回放两个要点", query: { project_id: "p1", work_ref: id },
      expectations: ["explicit", "legacy", "forbidden-only"].map(mode => ({
        expectation_id: mode, stage: "delivery", source: "evaluator", description: "检查实际回复",
        rule: { evaluator_id: "reply", evaluator_version: "1", rubric: "逐项核对正文", required_facts: ["agent.reply"],
          ...(mode === "explicit" ? { evidence_source: { fact: "agent.reply", role: "reply" } } : {}),
          ...(mode !== "forbidden-only" ? { required_evidence_terms: ["留存豁免", "隔离回放"], allowed_variations: ["豁免"] } : {}),
          forbidden_evidence_terms: ["已经发布"] },
      })),
    });
    const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: id }) as EvaluationRunView;
    for (const result of run.expectation_results) {
      assert.equal(result.effective_verdict,
        result.expectation_id === "forbidden-only" && answer && expected !== "unknown" && id !== "forbidden" ? "passed" : expected, id + "/" + result.expectation_id);
      assert.ok(result.evidence_refs.every(ref => ref.fact === "agent.reply" && ref.role === "reply"));
      if (answer) assert.ok(result.evidence_refs.some(ref => ref.snapshot));
      if (expected === "unknown") assert.ok(result.unknown_reasons.includes("evidence_missing"));
    }
  }
});

test("PWA-52 OCL-17: scoring cannot use reasoning or borrowed aliases to establish delivery", async t => {
  const fx = createEvaluationFixture(t);
  const sink = fx.layer.sink("agent").bind({ kind: "background", actor_id: "agent:assistant", project_id: "p1", entry: "agent", call_id: "alias-case" });
  sink.record({ fact: "agent.reply", outcome: "succeeded", work: { work_ref: "alias-case" }, evidence: [
    { role: "reasoning", ref: { kind: "content", media_type: "text/plain", text: "量化指标" } },
    { role: "reply", ref: { kind: "content", media_type: "text/plain", text: "下一步负责人即下一步责任人" } },
  ] });
  fx.layer.flush();
  const sample: EvaluationSampleInput = {
    sample_id: "aliases", version: 1, title: "量化与跟进", purpose: "validation", work_mode: "assistant",
    project_id: "p1", initial_intent: "同时说明两个要点", query: { project_id: "p1", work_ref: "alias-case" },
    expectations: [],
  };
  const base = { evaluator_id: "quality", evaluator_version: "1", rubric: "核对正文", required_facts: ["agent.reply"] };
  const expectation = { expectation_id: "answer", stage: "delivery" as const, source: "evaluator" as const, description: "核对正文" };
  for (const source of [{ fact: "agent.reply", role: "reasoning" }, { fact: "agent.model_request", role: "request" }, { fact: "action.call", role: "input" }]) {
    await assert.rejects(fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample,
      expectations: [{ ...expectation, rule: { ...base, required_facts: [], evidence_source: source, required_evidence_terms: ["量化指标"] } }] }),
      /agent.reply.*reply/);
  }
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, expectations: [
    { ...expectation, rule: { ...base, required_evidence_terms: ["量化指标", "下一步负责人"], allowed_variations: ["下一步责任人"] } },
    { ...expectation, expectation_id: "metric", rule: { ...base, required_evidence_terms: ["量化指标"] } },
  ] });
  const run = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: sample.sample_id }) as EvaluationRunView;
  const ownerCriterion = { expectation_id: "owner", stage: "delivery", source: "deterministic", description: "核对跟进人",
    rule: { check: "evidence_text", fact: "agent.reply", contains_all: ["下一步负责人"] } } as const;
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "mixed-criteria",
    allowed_variations: ["下一步责任人"], expectations: [ownerCriterion,
      { ...expectation, rule: { ...base, required_evidence_terms: ["量化指标"] } }] });
  const criteria = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "mixed-criteria" }) as EvaluationRunView;
  assert.deepEqual(criteria.expectation_results.map(result => result.automated_verdict), ["passed", "unknown"]);

  // Create the historical rule in its previously accepted shape. A new execution must validate it before reading or holding records.
  sink.record({ fact: "agent.model_request", outcome: "succeeded", work: { work_ref: "alias-case" },
    evidence: [{ role: "request", ref: { kind: "content", media_type: "text/plain", text: "量化指标" } }] });
  fx.layer.flush();
  const requestFilter = { project_id: "p1", fact: "agent.model_request", work_ref: "alias-case" };
  const requestRule = { ...ownerCriterion, rule: { check: "evidence_text", evidence_role: "request", contains_all: ["量化指标"] } };
  await assert.rejects(fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "mixed-request",
    work_mode: "mixed", query: requestFilter, expectations: [requestRule] }), /agent.reply/);
  const { records } = await fx.service.invoke(person(), observationActions.recordsQuery, requestFilter) as ObservationQueryOutput;
  assert.equal(records.length, 1);
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "pinned-request", work_mode: "mixed",
    pinned_record_ids: [records[0]!.record_id], expectations: [requestRule] });
  const pinned = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "pinned-request" }) as EvaluationRunView;
  assert.equal(pinned.effective_verdict, "unknown");
  assert.deepEqual(pinned.expectation_results[0]?.evidence_refs, []);
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "old-input", expectations: [
    { ...ownerCriterion, stage: "execution", rule: { check: "evidence_text", fact: "agent.model_request", evidence_role: "request", contains_all: ["量化指标"] } },
  ] });
  const old = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "old-input" }) as EvaluationRunView;
  const db = new DatabaseSync(join(fx.home, "evaluation", "evaluation.db"));
  try {
    db.prepare("UPDATE evaluation_samples SET spec_json = json_set(spec_json, '$.expectations[0].stage', 'delivery') WHERE sample_id = ?")
      .run("old-input");
  } finally { db.close(); }
  await assert.rejects(fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "old-input" }), /用新版本/);
  const original = await fx.service.invoke(person(), evaluationActions.runsGet, { run_id: old.run_id }) as EvaluationRunView;
  assert.equal(original.effective_verdict, "passed");

  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "det-reply", expectations: [
    { expectation_id: "metric", stage: "delivery", source: "deterministic", description: "核对正文", rule: {
      check: "evidence_text", fact: "agent.reply", contains_all: ["量化指标"] } },
  ] });
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "mixed-reply", work_mode: "mixed",
    query: { ...sample.query, fact: "agent.reply" }, expectations: [
      { expectation_id: "metric", stage: "delivery", source: "deterministic", description: "核对正文", rule: {
        check: "evidence_text", contains_all: ["量化指标"] } },
    ] });
  const mixed = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "mixed-reply" }) as EvaluationRunView;
  assert.equal(mixed.effective_verdict, "failed");
  assert.ok(mixed.expectation_results[0]?.evidence_refs.every(ref => ref.role === "reply"));
  const det = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "det-reply" }) as EvaluationRunView;
  assert.equal(det.effective_verdict, "failed");
  assert.ok(det.expectation_results[0]?.evidence_refs.every(ref => ref.role === "reply"));
  assert.equal(run.expectation_results[0]?.automated_verdict, "unknown");
  assert.deepEqual(run.expectation_results[0]?.unknown_reasons, ["awaiting_human_review"]);
  assert.equal(run.expectation_results[1]?.automated_verdict, "failed");

  await fx.service.invoke(pluginCaller("pages"), observationActions.report, { facts: [{ fact: "pages.summary",
    outcome: "succeeded", work: { work_ref: "missing-reply" },
    evidence: [{ role: "output", ref: { kind: "content", media_type: "text/plain", text: "量化指标" } }] }] });
  fx.layer.flush();
  await fx.service.invoke(person(), evaluationActions.samplesPut, { ...sample, sample_id: "missing-reply",
    query: { project_id: "p1", work_ref: "missing-reply" },
    expectations: [
      { ...expectation, rule: { ...base, required_facts: [], required_evidence_terms: ["量化指标"] } },
      { expectation_id: "metric", stage: "delivery", source: "deterministic", description: "核对正文", rule: {
        check: "evidence_text", fact: "agent.reply", contains_all: ["量化指标"] } },
    ] });
  const absent = await fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "missing-reply" }) as EvaluationRunView;
  assert.equal(absent.effective_verdict, "unknown");
  for (const result of absent.expectation_results) {
    assert.equal(result.automated_verdict, "unknown");
    assert.deepEqual(result.evidence_refs, []);
    assert.ok(result.unknown_reasons.includes("evidence_missing"));
  }
});

test("PWA-54 PWA-55 OCL-17: count confirmed owner work once, preserve legacy runs and disclose their exclusion from work totals", async t => {
  const fx = createEvaluationFixture(t);
  const work = { work_ref: "work-unit-1" };
  await fx.service.invoke(pluginCaller("pages"), observationActions.report, { facts: [
    { fact: "pages.save", outcome: "succeeded", stage: "executed", work },
    { fact: "pages.save", outcome: "succeeded", stage: "completed", work },
    { fact: "pages.save", outcome: "succeeded", stage: "completed", work },
    { fact: "pages.save", outcome: "refused", stage: "executed", work: { work_ref: "never-started" } },
    { fact: "pages.save", outcome: "succeeded", stage: "completed" },
  ] });
  const agent = fx.layer.sink("agent").bind({ kind: "background", actor_id: "agent:assistant", project_id: "p1", entry: "agent", call_id: "model-unit" });
  agent.record({ fact: "agent.run", stage: "completed", outcome: "succeeded", work: { work_ref: "agent-technical" } });
  fx.layer.flush();
  await fx.service.invoke(person(), evaluationActions.samplesPut, {
    sample_id: "work-units", title: "按业务记录归集", version: 1, purpose: "validation", work_mode: "manual_plugin",
    project_id: "p1", initial_intent: "核对主人保存的操作", query: { project_id: "p1" },
    expectations: [{ expectation_id: "save", source: "deterministic", stage: "execution", description: "已保存",
      rule: { check: "record_count", fact: "pages.save", min_count: 1 } }],
  });
  const execute = () => fx.service.invoke(person(), evaluationActions.runsExecute, { sample_id: "work-units" }) as Promise<EvaluationRunView>;
  const legacy = await execute();
  // Model the actual persisted pre-upgrade JSON; exercise both public history reads and aggregation.
  const { execution_basis: ignored, ...oldFunnel } = legacy.funnel;
  assert.equal(ignored, "owner_work");
  const db = new DatabaseSync(join(fx.home, "evaluation", "evaluation.db"));
  try {
    db.prepare("UPDATE evaluation_runs SET run_json = ? WHERE run_id = ?").run(JSON.stringify({
      ...legacy, funnel: { ...oldFunnel, executed: 9, completed: 9 },
    }), legacy.run_id);
  } finally { db.close(); }
  const current = await execute();
  assert.deepEqual([current.funnel.executed, current.funnel.completed], [1, 1]);
  const history = await fx.service.invoke(person(), evaluationActions.runsGet, { run_id: legacy.run_id }) as EvaluationRunView;
  assert.equal(history.funnel.completed, 9);
  const metrics = await fx.service.invoke(person(), evaluationActions.metricsSummarize, { purpose: "validation", project_id: "p1" }) as EvaluationMetricsSummary;
  assert.equal(metrics.denominator, 2);
  assert.deepEqual([metrics.funnel_totals.executed, metrics.funnel_totals.completed, metrics.funnel_totals.excluded_execution_runs], [1, 1, 1]);
  const comparison = await fx.service.invoke(person(), evaluationActions.runsCompare, { baseline_run_id: legacy.run_id, candidate_run_id: current.run_id }) as EvaluationRunComparison;
  assert.equal(comparison.comparable, false);
});
