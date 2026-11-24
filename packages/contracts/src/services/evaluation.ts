import type { ActionDefinition } from "../platform/actions.js";
import { inputSchemaFor } from "../platform/action-input.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { ContractDescriptor } from "../platform/package.js";
import {
  OBSERVATION_LIMITS,
  OBSERVATION_OUTCOMES,
  OBSERVATION_QUERY_FIELDS,
  OBSERVATION_SOURCE_CLASSES,
} from "./observation-types.js";
import {
  EVALUATION_EXECUTION_KINDS,
  EVALUATION_OPPORTUNITY_POSTURES,
  EVALUATION_SAMPLE_PURPOSES,
  EVALUATION_STAGES,
  EVALUATION_UNKNOWN_REASONS,
  EVALUATION_VERDICTS,
  EVALUATION_WORK_MODES,
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
} from "./evaluation-types.js";

export * from "./evaluation-types.js";

export const servicesEvaluationContract = {
  contractId: /* @version contract.io.molis.work.service.evaluation "io.molis.work.service.evaluation.v{version}" */ "io.molis.work.service.evaluation.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.evaluation */ 1,
  maturity: "implemented",
  ssot: "specs/observation-collection/evaluation-path-design.md",
} as const satisfies ContractDescriptor;

export const EVALUATION_PROVIDER_ID = "system.evaluation";

const token = { type: "string", minLength: 1, maxLength: OBSERVATION_LIMITS.ref_text } as const;
const nullableToken = { type: ["string", "null"], maxLength: OBSERVATION_LIMITS.ref_text } as const;
const shortText = { type: "string", minLength: 1, maxLength: 2048 } as const;
const versionValue = { type: ["string", "integer"], maxLength: OBSERVATION_LIMITS.ref_text } as const;

const QUERY_FILTER_SCHEMA = closedObjectSchema(OBSERVATION_QUERY_FIELDS, []);

const DETERMINISTIC_RULE_SCHEMA = closedObjectSchema({
  check: {
    enum: [
      "record_count",
      "stage_sequence",
      "distinct_owner_versions",
      "evidence_text",
      "evidence_absent",
      "parent_invocation_linked",
      "no_self_certifying_success",
      "funnel_stage_separation",
      "source_isolation",
      "interleaved_isolation",
    ],
  },
  fact: token,
  facts: { type: "array", maxItems: 32, items: token },
  outcomes: { type: "array", items: { enum: OBSERVATION_OUTCOMES } },
  source_classes: { type: "array", items: { enum: OBSERVATION_SOURCE_CLASSES } },
  actor_id: token,
  subject_kind: token,
  subject_id: token,
  evidence_role: token,
  contains_all: { type: "array", maxItems: 32, items: shortText },
  forbids_any: { type: "array", maxItems: 32, items: shortText },
  detail_equals: {
    type: "object",
    maxProperties: OBSERVATION_LIMITS.detail_keys,
    additionalProperties: { type: ["string", "number", "boolean"], maxLength: OBSERVATION_LIMITS.detail_text },
  },
  min_count: { type: "integer", minimum: 0 },
  max_count: { type: "integer", minimum: 0 },
  min_distinct_versions: { type: "integer", minimum: 1 },
  require_exposure_for_feedback: { type: "boolean" },
  primary_work_ref: token,
  secondary_work_ref: token,
}, ["check"]);

const EVALUATOR_RULE_SCHEMA = closedObjectSchema({
  evaluator_id: token,
  evaluator_version: token,
  rubric: shortText,
  evidence_source: closedObjectSchema({ fact: token, role: token }, ["fact", "role"]),
  expected_posture: { enum: EVALUATION_OPPORTUNITY_POSTURES },
  required_facts: { type: "array", maxItems: 32, items: token },
  required_skill_ids: { type: "array", maxItems: 16, items: token },
  required_evidence_terms: { type: "array", maxItems: 32, items: shortText },
  forbidden_evidence_terms: { type: "array", maxItems: 32, items: shortText },
  forbidden_facts: { type: "array", maxItems: 32, items: token },
  acceptable_outcomes: { type: "array", items: { enum: OBSERVATION_OUTCOMES } },
  allowed_variations: { type: "array", maxItems: 16, items: shortText },
}, ["evaluator_id", "evaluator_version", "rubric"]);

const HUMAN_REFERENCE_RULE_SCHEMA = closedObjectSchema({
  reference_id: token,
  guidance: shortText,
  expected_verdict: { enum: EVALUATION_VERDICTS },
}, ["reference_id", "guidance"]);

const EXPECTATION_SCHEMA = {
  oneOf: [
    closedObjectSchema({
      expectation_id: token,
      stage: { enum: EVALUATION_STAGES },
      description: shortText,
      source: { const: "deterministic" },
      required_evidence: { type: "boolean" },
      rule: DETERMINISTIC_RULE_SCHEMA,
    }, ["expectation_id", "stage", "description", "source", "rule"]),
    closedObjectSchema({
      expectation_id: token,
      stage: { enum: EVALUATION_STAGES },
      description: shortText,
      source: { const: "evaluator" },
      required_evidence: { type: "boolean" },
      rule: EVALUATOR_RULE_SCHEMA,
    }, ["expectation_id", "stage", "description", "source", "rule"]),
    closedObjectSchema({
      expectation_id: token,
      stage: { enum: EVALUATION_STAGES },
      description: shortText,
      source: { const: "human_reference" },
      required_evidence: { type: "boolean" },
      rule: HUMAN_REFERENCE_RULE_SCHEMA,
    }, ["expectation_id", "stage", "description", "source", "rule"]),
  ],
} as const;

const MODEL_RUN_INFO_SCHEMA = closedObjectSchema({
  mode: { enum: ["none", "stand_in", "live"] },
  provider: token,
  model_id: token,
  api_format: { enum: ["anthropic-messages", "openai-chat-completions"] },
}, ["mode"]);

export const evaluationActions = {
  samplesPut: {
    capability_id: "evaluation.samples.put",
    version: /* @version action.evaluation.samples.put */ 1,
    operation: "command",
    action: {
      title: "登记评测样本与预期",
      description: "按版本号冻结登记一份端到端评测样本、预期规则及调优／独立验证用途，可选在采集层登记样本记录留存",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      scheduling: "concurrent",
      input_schema: inputSchemaFor<EvaluationSampleInput>()(closedObjectSchema({
        sample_id: token,
        version: { type: "integer", minimum: 1 },
        title: shortText,
        purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        work_mode: { enum: EVALUATION_WORK_MODES },
        project_id: nullableToken,
        case_ref: token,
        initial_intent: shortText,
        query: QUERY_FILTER_SCHEMA,
        window: closedObjectSchema({
          since: { type: "string" },
          until: { type: "string" },
          observation_cutoff_at: { type: "string" },
        }, []),
        opportunity_basis: closedObjectSchema({
          source: { enum: ["independent_fixture", "human_audit", "rule"] },
          description: shortText,
          expected_posture: { enum: EVALUATION_OPPORTUNITY_POSTURES },
          candidate_refs: { type: "array", maxItems: 32, items: token },
        }, ["source", "description", "expected_posture"]),
        baseline_conditions: closedObjectSchema({
          platform_version: token,
          model: closedObjectSchema({
            provider: token,
            model_id: token,
            api_format: { enum: ["anthropic-messages", "openai-chat-completions"] },
          }, ["provider", "model_id"]),
          skills: { type: "array", maxItems: 16, items: closedObjectSchema({ id: token, version: versionValue }) },
          plugins: { type: "object", maxProperties: 32, additionalProperties: token },
        }, []),
        allowed_variations: { type: "array", maxItems: 16, items: shortText },
        expectations: { type: "array", minItems: 1, maxItems: 64, items: EXPECTATION_SCHEMA },
        hold_records: { type: "boolean" },
        hold_expires_at: nullableToken,
        pinned_record_ids: { type: "array", maxItems: 500, items: token },
      }, ["sample_id", "version", "title", "purpose", "work_mode", "initial_intent", "query", "expectations"])),
      output_schema: closedObjectSchema({
        sample: { type: "object" },
        created: { type: "boolean" },
      }),
    },
  } as ActionDefinition<EvaluationSampleInput, EvaluationSamplePutOutput>,

  samplesList: {
    capability_id: "evaluation.samples.list",
    version: /* @version action.evaluation.samples.list */ 1,
    operation: "query",
    action: {
      title: "查看评测样本列表",
      description: "按项目、调优／独立验证用途或工作方式查询已冻结的评测样本",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationSampleListInput>()(closedObjectSchema({
        project_id: nullableToken,
        purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        work_mode: { enum: EVALUATION_WORK_MODES },
        sample_id: token,
        all_versions: { type: "boolean" },
      }, [])),
      output_schema: closedObjectSchema({
        samples: { type: "array" },
      }),
    },
  } as ActionDefinition<EvaluationSampleListInput, EvaluationSampleListOutput>,

  samplesRemove: {
    capability_id: "evaluation.samples.remove",
    version: /* @version action.evaluation.samples.remove */ 1,
    operation: "command",
    action: {
      title: "移除评测样本",
      description: "移除指定评测样本或版本，并可选释放其在采集层的样本留存；历史评测运行结论保留不删",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      scheduling: "concurrent",
      input_schema: inputSchemaFor<EvaluationSampleRemoveInput>()(closedObjectSchema({
        sample_id: token,
        version: { type: "integer", minimum: 1 },
        release_holds: { type: "boolean" },
      }, ["sample_id"])),
      output_schema: closedObjectSchema({
        removed_versions: { type: "array", items: { type: "integer" } },
        released_hold_ids: { type: "array", items: token },
      }),
    },
  } as ActionDefinition<EvaluationSampleRemoveInput, EvaluationSampleRemoveOutput>,

  runsExecute: {
    capability_id: "evaluation.runs.execute",
    version: /* @version action.evaluation.runs.execute */ 1,
    operation: "command",
    action: {
      title: "执行端到端评测",
      description: "基于采集层真实工作记录与证据快照（或在受控隔离回放范围内）对冻结样本执行判定，保留失败与未知原因且不改写历史事实",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      scheduling: "concurrent",
      input_schema: inputSchemaFor<EvaluationRunExecuteInput>()(closedObjectSchema({
        sample_id: token,
        sample_version: { type: "integer", minimum: 1 },
        execution_kind: { enum: EVALUATION_EXECUTION_KINDS },
        replay_scenario_id: token,
        model_run_info: MODEL_RUN_INFO_SCHEMA,
        hold_records: { type: "boolean" },
      }, ["sample_id"])),
      output_schema: closedObjectSchema({
        run_id: token,
        sample_id: token,
        sample_version: { type: "integer", minimum: 1 },
        sample_purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        work_mode: { enum: EVALUATION_WORK_MODES },
        project_id: nullableToken,
        execution_kind: { enum: EVALUATION_EXECUTION_KINDS },
        model_run_info: MODEL_RUN_INFO_SCHEMA,
        replay: { type: "object" },
        automated_verdict: { enum: EVALUATION_VERDICTS },
        effective_verdict: { enum: EVALUATION_VERDICTS },
        verdict_source: { enum: ["automated", "human_review"] },
        unknown_reasons: { type: "array", items: { enum: EVALUATION_UNKNOWN_REASONS } },
        failed_stages: { type: "array", items: { enum: EVALUATION_STAGES } },
        coverage_limitations: { type: "array", items: { type: "string" } },
        observed_conditions: { type: "object" },
        funnel: { type: "object" },
        expectation_results: { type: "array" },
        human_reviews: { type: "array" },
        evaluated_at: { type: "string" },
        duration_ms: { type: "integer", minimum: 0 },
      }, [
        "run_id",
        "sample_id",
        "sample_version",
        "sample_purpose",
        "work_mode",
        "project_id",
        "execution_kind",
        "automated_verdict",
        "effective_verdict",
        "verdict_source",
        "unknown_reasons",
        "failed_stages",
        "coverage_limitations",
        "observed_conditions",
        "funnel",
        "expectation_results",
        "human_reviews",
        "evaluated_at",
        "duration_ms",
      ]),
    },
  } as ActionDefinition<EvaluationRunExecuteInput, EvaluationRunView>,

  runsGet: {
    capability_id: "evaluation.runs.get",
    version: /* @version action.evaluation.runs.get */ 1,
    operation: "query",
    action: {
      title: "读取评测运行详情",
      description: "读取单次评测运行的逐条判定、证据引用、覆盖限制、自动结论与人工纠正链",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationRunGetInput>()(closedObjectSchema({
        run_id: token,
      })),
      output_schema: { type: "object" },
    },
  } as ActionDefinition<EvaluationRunGetInput, EvaluationRunView>,

  runsList: {
    capability_id: "evaluation.runs.list",
    version: /* @version action.evaluation.runs.list */ 1,
    operation: "query",
    action: {
      title: "查询历史评测运行",
      description: "按样本、项目、调优／独立验证用途、运行环境或判定结论列出历史评测运行",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationRunListInput>()(closedObjectSchema({
        sample_id: token,
        project_id: nullableToken,
        purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        execution_kind: { enum: EVALUATION_EXECUTION_KINDS },
        verdict: { enum: EVALUATION_VERDICTS },
        limit: { type: "integer", minimum: 1, maximum: 200 },
      }, [])),
      output_schema: closedObjectSchema({
        runs: { type: "array" },
      }),
    },
  } as ActionDefinition<EvaluationRunListInput, EvaluationRunListOutput>,

  runsCompare: {
    capability_id: "evaluation.runs.compare",
    version: /* @version action.evaluation.runs.compare */ 1,
    operation: "query",
    action: {
      title: "对比两次评测运行",
      description: "比较同一样本在平台、模型、Skill 或插件变更前后的两次评测运行，保留共同条件、不可比差异与六阶段定位",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationRunCompareInput>()(closedObjectSchema({
        baseline_run_id: token,
        candidate_run_id: token,
      })),
      output_schema: closedObjectSchema({
        sample_id: token,
        baseline_run_id: token,
        candidate_run_id: token,
        comparable: { type: "boolean" },
        shared_conditions: { type: "array", items: { type: "string" } },
        incomparable_differences: { type: "array", items: { type: "string" } },
        verdict_change: closedObjectSchema({
          from: { enum: EVALUATION_VERDICTS },
          to: { enum: EVALUATION_VERDICTS },
        }),
        stage_diffs: { type: "array" },
      }),
    },
  } as ActionDefinition<EvaluationRunCompareInput, EvaluationRunComparison>,

  reviewsRecord: {
    capability_id: "evaluation.reviews.record",
    version: /* @version action.evaluation.reviews.record */ 1,
    operation: "command",
    action: {
      title: "记录人工复查与纠正",
      description: "对某次评测运行或单条预期追加人工评价／纠正结论，保留依据与原自动结论，不改写原始工作记录与业务事实",
      kind: "operation",
      scope: "home",
      effect: "write",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationReviewRecordInput>()(closedObjectSchema({
        run_id: token,
        expectation_id: nullableToken,
        verdict: { enum: EVALUATION_VERDICTS },
        stage: { enum: EVALUATION_STAGES },
        rationale: shortText,
        cited_record_ids: { type: "array", maxItems: 64, items: token },
      }, ["run_id", "verdict", "rationale"])),
      output_schema: closedObjectSchema({
        review: { type: "object" },
        run: { type: "object" },
      }),
    },
  } as ActionDefinition<EvaluationReviewRecordInput, EvaluationReviewRecordOutput>,

  metricsSummarize: {
    capability_id: "evaluation.metrics.summarize",
    version: /* @version action.evaluation.metrics.summarize */ 1,
    operation: "query",
    action: {
      title: "汇总端到端评测指标",
      description: "按调优或独立验证用途汇总样本量、分母、可评测比例、未知与缺失原因、全部工作结局及呈现到采用的分阶段计数",
      kind: "query",
      scope: "home",
      effect: "read",
      audiences: ["user"],
      permissions: [],
      subject_kinds: [],
      input_schema: inputSchemaFor<EvaluationMetricsSummarizeInput>()(closedObjectSchema({
        purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        project_id: nullableToken,
        work_mode: { enum: EVALUATION_WORK_MODES },
        execution_kind: { enum: EVALUATION_EXECUTION_KINDS },
        since: { type: "string" },
        until: { type: "string" },
      }, ["purpose"])),
      output_schema: closedObjectSchema({
        purpose: { enum: EVALUATION_SAMPLE_PURPOSES },
        window: closedObjectSchema({
          since: { type: ["string", "null"] },
          until: { type: ["string", "null"] },
        }),
        sample_count: { type: "integer", minimum: 0 },
        denominator: { type: "integer", minimum: 0 },
        evaluable_count: { type: "integer", minimum: 0 },
        evaluable_ratio: { type: "number", minimum: 0, maximum: 1 },
        verdict_counts: { type: "object" },
        unknown_reason_counts: { type: "object" },
        work_outcome_counts: { type: "object" },
        funnel_totals: { type: "object" },
        by_work_mode: { type: "array" },
      }),
    },
  } as ActionDefinition<EvaluationMetricsSummarizeInput, EvaluationMetricsSummary>,
};
