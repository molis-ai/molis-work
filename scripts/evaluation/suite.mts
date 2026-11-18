import {
  servicesEvaluationContract,
  type EvaluationExecutionKind,
  type EvaluationSampleInput,
  type EvaluationUnknownReason,
  type EvaluationVerdict,
} from "@molis-ai/molis-work-contracts/services/evaluation";
import { PAGES_SUBJECT_KIND } from "@molis-ai/molis-work-plugin-pages";

export interface SuiteContextIds {
  readonly mainProjectId: string;
  readonly holdProjectId: string;
  readonly replayProjectId: string;
  readonly pagesCallId: string;
  readonly pageDocumentId: string;
  readonly agentRunId: string;
  readonly selfCertCallId: string;
  readonly quietWorkRef: string;
  readonly unexposedWorkRef: string;
  readonly primaryWorkRef: string;
  readonly secondaryWorkRef: string;
  readonly primaryTodoId: string;
  readonly heldWorkRef: string;
  readonly unheldWorkRef: string;
  readonly replayScenarioV1: string;
  readonly replayScenarioV2: string;
}

export interface CanonicalSuiteCase {
  readonly sample: EvaluationSampleInput;
  readonly executionKind?: EvaluationExecutionKind;
  readonly replayScenarioId?: string;
  readonly expectedRawVerdict: EvaluationVerdict;
  readonly expectedUnknownReasons?: readonly EvaluationUnknownReason[];
}

const REV = servicesEvaluationContract.schemaVersion;
const EVALUATOR_REV = `${String(REV)}.0.0`;

export function buildCanonicalEvaluationSuite(ids: SuiteContextIds): readonly CanonicalSuiteCase[] {
  return [
    {
      expectedRawVerdict: "passed",
      sample: {
        sample_id: "ec-01-pages-evolution",
        version: REV,
        title: "EC-01 文稿多版本修订与成果发布链路",
        purpose: "validation",
        work_mode: "manual_plugin",
        project_id: ids.mainProjectId,
        case_ref: "EC-01",
        initial_intent: "新建文稿初稿、修订出第二版并发布固定版本成果",
        query: { project_id: ids.mainProjectId, call_id: ids.pagesCallId },
        expectations: [
          {
            expectation_id: "exp-ec01-versions",
            stage: "delivery",
            description: "文稿演进出至少 2 个独立对象版本",
            source: "deterministic",
            rule: {
              check: "distinct_owner_versions",
              subject_kind: PAGES_SUBJECT_KIND,
              subject_id: ids.pageDocumentId,
              min_distinct_versions: REV + REV,
            },
          },
          {
            expectation_id: "exp-ec01-text",
            stage: "execution",
            description: "修订输入快照保留第二版关键内容",
            source: "deterministic",
            rule: {
              check: "evidence_text",
              fact: "action.call",
              evidence_role: "input",
              contains_all: ["第二版行动方案"],
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "passed",
      sample: {
        sample_id: "ec-02-model-round",
        version: 2,
        title: "EC-02 真实模型回合记录与准则评判",
        purpose: "validation",
        work_mode: "assistant",
        project_id: ids.mainProjectId,
        case_ref: "EC-02",
        initial_intent: "读取发布材料并输出包含留存豁免与隔离回放要点的中文摘要",
        query: { project_id: ids.mainProjectId, run_id: ids.agentRunId },
        expectations: [
          {
            expectation_id: "exp-ec02-seq",
            stage: "execution",
            description: "完整记录 Agent 启动、材料、模型请求、回复、用量与结束",
            source: "deterministic",
            rule: {
              check: "stage_sequence",
              facts: ["agent.run", "agent.instructions", "agent.materials", "agent.model_request", "agent.reply", "agent.usage", "agent.run"],
            },
          },
          {
            expectation_id: "exp-ec02-rubric",
            stage: "delivery",
            description: "模型摘要覆盖留存豁免与隔离回放要点",
            source: "evaluator",
            rule: {
              evaluator_id: "eval.delivery.summary-rubric",
              evaluator_version: "2.0.0",
              rubric: "核对本轮回复是否按原请求包含「留存豁免」与「隔离回放」两个词语。",
              required_facts: ["agent.reply"],
              required_evidence_terms: ["留存豁免", "隔离回放"],
              evidence_source: { fact: "agent.reply", role: "reply" },
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "failed",
      sample: {
        sample_id: "ec-02-no-self-cert",
        version: REV,
        title: "PWA-52 禁止脱离落库证据的模型自证成功与人工复核示例",
        purpose: "tuning",
        work_mode: "assistant",
        project_id: ids.mainProjectId,
        case_ref: "EC-02",
        initial_intent: "底层动作失败时禁止将模型口头声称计为成功",
        query: { project_id: ids.mainProjectId, call_id: ids.selfCertCallId },
        expectations: [
          {
            expectation_id: "exp-no-self-cert",
            stage: "execution",
            description: "拦截无真实写落库却声称成功的回合",
            source: "deterministic",
            rule: { check: "no_self_certifying_success" },
          },
          {
            expectation_id: "exp-human-ref",
            stage: "delivery",
            description: "人工复查确认失败归因准确",
            source: "human_reference",
            rule: {
              reference_id: "ref.no-self-cert.audit",
              guidance: "核对失败动作回执与 Agent 轮次结论是否一致；人工复查意见只追加在评测库。",
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "passed",
      sample: {
        sample_id: "ec-06-quiet-restraint",
        version: REV,
        title: "EC-06 应克制不打扰的机会窗口",
        purpose: "validation",
        work_mode: "assistant",
        project_id: ids.mainProjectId,
        case_ref: "EC-06",
        initial_intent: "专注编辑期间保持安静，不主动弹出低把握打扰",
        opportunity_basis: {
          source: "independent_fixture",
          description: "专注写作阶段无阻塞缺口，应保持静默",
          expected_posture: "quiet",
        },
        query: { project_id: ids.mainProjectId, work_ref: ids.quietWorkRef },
        expectations: [
          {
            expectation_id: "exp-ec06-quiet",
            stage: "interaction",
            description: "保持 quiet 姿态且无打扰卡片曝光",
            source: "evaluator",
            rule: {
              evaluator_id: "eval.interaction.restraint",
              evaluator_version: EVALUATOR_REV,
              rubric: "无需介入时应保持静默，不计入负向率。",
              expected_posture: "quiet",
              forbidden_facts: ["assistant.suggestion.presented"],
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "unknown",
      expectedUnknownReasons: ["unexposed"],
      sample: {
        sample_id: "ec-08-unexposed-opportunity",
        version: REV,
        title: "EC-08 未曝光机会归入未知而非失败",
        purpose: "validation",
        work_mode: "assistant",
        project_id: ids.mainProjectId,
        case_ref: "EC-08",
        initial_intent: "尚未向用户曝光的建议不计入已曝光反馈分母",
        query: { project_id: ids.mainProjectId, work_ref: ids.unexposedWorkRef },
        expectations: [
          {
            expectation_id: "exp-ec08-exposure",
            stage: "interaction",
            description: "要求曝光后才判定用户采纳与否",
            source: "deterministic",
            rule: {
              check: "record_count",
              fact: "assistant.suggestion.adopted",
              min_count: REV,
              require_exposure_for_feedback: true,
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "passed",
      sample: {
        sample_id: "ec-09-interleaved-isolation",
        version: REV,
        title: "EC-09 穿插并行任务归因隔离",
        purpose: "validation",
        work_mode: "mixed",
        project_id: ids.mainProjectId,
        case_ref: "EC-09",
        initial_intent: "主次任务穿插执行时不串用调用号或目标对象",
        query: { project_id: ids.mainProjectId },
        expectations: [
          {
            expectation_id: "exp-ec09-isolated",
            stage: "execution",
            description: "主次 work_ref 调用链与目标对象互不污染",
            source: "deterministic",
            rule: {
              check: "interleaved_isolation",
              primary_work_ref: ids.primaryWorkRef,
              secondary_work_ref: ids.secondaryWorkRef,
              subject_id: ids.primaryTodoId,
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "passed",
      sample: {
        sample_id: "ec-16-held",
        version: REV,
        title: "EC-16 挂有评测留存的过期记录豁免清理",
        purpose: "validation",
        work_mode: "manual_plugin",
        project_id: ids.holdProjectId,
        case_ref: "EC-16",
        initial_intent: "留存豁免样本在手动清理后仍保留完整加密快照证据",
        hold_records: true,
        query: { project_id: ids.holdProjectId, work_ref: ids.heldWorkRef },
        expectations: [
          {
            expectation_id: "exp-ec16-held",
            stage: "materials",
            description: "留存样本在到期清理后仍可读出原始快照文本",
            source: "deterministic",
            rule: {
              check: "evidence_text",
              fact: "agent.materials",
              evidence_role: "material:held",
              contains_all: ["受留存保护的历史证据"],
            },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "unknown",
      expectedUnknownReasons: ["coverage_gap_expired"],
      sample: {
        sample_id: "ec-16-unheld",
        version: REV,
        title: "EC-16 未挂留存的过期记录清理后如实呈报未知",
        purpose: "validation",
        work_mode: "manual_plugin",
        project_id: ids.holdProjectId,
        case_ref: "EC-16",
        initial_intent: "已被清理且留下到期覆盖缺口的窗口如实判定为 unknown",
        hold_records: false,
        query: { project_id: ids.holdProjectId, work_ref: ids.unheldWorkRef },
        expectations: [
          {
            expectation_id: "exp-ec16-unheld",
            stage: "materials",
            description: "过期清除窗口不伪造通过或失败",
            source: "deterministic",
            rule: { check: "record_count", fact: "agent.materials", min_count: REV },
          },
        ],
      },
    },
    {
      expectedRawVerdict: "failed",
      executionKind: "isolated_replay",
      replayScenarioId: ids.replayScenarioV1,
      sample: {
        sample_id: "ec-18-replay-compare",
        version: REV,
        title: "EC-18 隔离回放阻断外部副作用与跨版本六阶段对比",
        purpose: "tuning",
        work_mode: "assistant",
        project_id: ids.replayProjectId,
        case_ref: "EC-18",
        initial_intent: "在无外部副作用的隔离回放中对比旧版漏装材料与新版修复后的六阶段差异",
        query: { project_id: ids.replayProjectId, include_simulated: true },
        expectations: [
          {
            expectation_id: "exp-ec18-materials",
            stage: "materials",
            description: "回放装载完整背景材料",
            source: "deterministic",
            rule: { check: "record_count", fact: "agent.materials", source_classes: ["replay"], min_count: REV },
          },
          {
            expectation_id: "exp-ec18-source",
            stage: "execution",
            description: "回放记录全部标记为 replay 来源类别",
            source: "deterministic",
            rule: { check: "source_isolation", source_classes: ["replay"] },
          },
        ],
      },
    },
  ];
}
