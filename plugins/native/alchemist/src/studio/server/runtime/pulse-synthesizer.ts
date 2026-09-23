import type { Opportunity, PulseFinding, PulseReport, PulseRun } from "../../domain/discovery/pulse.js";
import { inspectPulseCoverage } from "../../domain/discovery/pulse.js";
import type { SourceCollectionResult, SupplySignal } from "../../domain/discovery/source.js";
import type { IdFactory } from "../../domain/kernel/identity.js";
import { formatSystemLocalCalendarDate } from "../utils/local-calendar.js";

export interface PulseSynthesisInput {
  run: PulseRun;
  collections: readonly SourceCollectionResult[];
  signals: readonly SupplySignal[];
  periodStart: string;
  now: string;
  idFactory: IdFactory;
}

export interface PulseSynthesisResult {
  report: PulseReport;
  opportunities: readonly Opportunity[];
}

export interface PulseSynthesizerPort {
  synthesize(input: PulseSynthesisInput): Promise<PulseSynthesisResult>;
}

interface ClusterDefinition {
  id: string;
  keywords: readonly string[];
  findingTitle: string;
  factPattern: string;
  whyItMatters: string;
  opportunityTitle: string;
  highlight: string;
  demandInference: string;
  counterSignal: string;
  unknown: string;
}

const clusters: readonly ClusterDefinition[] = [
  {
    id: "deliverable_content",
    keywords: [
      "content",
      "image",
      "video",
      "photo",
      "social",
      "文案",
      "图像",
      "视频",
      "照片",
      "内容",
      "海报",
    ],
    findingTitle: "生成式产品开始直接交付可发布成品",
    factPattern: "近期供给把图片、文案或视频组合成可继续编辑和发布的成品。",
    whyItMatters: "竞争焦点可能从回答质量转向交付路径是否足够短。",
    opportunityTitle: "面向一个高频内容场景的成品工作台",
    highlight: "不止生成一段内容，而是交付用户下一步可以直接使用的成品。",
    demandInference: "用户可能愿意为更少的工具切换与返工付费，但供给热度尚不能证明重复使用。",
    counterSignal: "通用模型与既有创作套件可能快速吸收这些能力。",
    unknown: "哪个具体人群拥有足够高频、可付费的成品任务。",
  },
  {
    id: "agent_workflow",
    keywords: [
      "agent",
      "workflow",
      "automation",
      "code",
      "coding",
      "developer",
      "工作流",
      "自动化",
      "编程",
      "开发",
      "智能体",
    ],
    findingTitle: "Agent 供给从聊天入口走向可执行工作流",
    factPattern: "近期供给反复强调任务拆解、工具调用、代码或部署等可执行链路。",
    whyItMatters: "产品价值可能从一次回答迁移到可靠完成一个有边界的任务。",
    opportunityTitle: "把一个重复专业流程做成可核验的 Agent",
    highlight: "选择窄任务，保留检查点和人工确认，让 Agent 真正完成而不是只建议。",
    demandInference: "如果用户已经反复手工串联工具，这类产品可能节省协调成本；仍需验证真实工作流。",
    counterSignal: "平台级 Agent 能力可能压缩独立工具的差异化窗口。",
    unknown: "哪条流程同时具备高频、明确完成标准和可触达用户。",
  },
  {
    id: "persistent_context",
    keywords: ["memory", "context", "knowledge", "rag", "记忆", "上下文", "知识"],
    findingTitle: "长期记忆与上下文成为独立产品机制",
    factPattern: "近期供给开始把跨会话记忆、知识组织和上下文压缩单独产品化。",
    whyItMatters: "当用户持续与多个 Agent 协作时，重复解释和上下文丢失会变成显性成本。",
    opportunityTitle: "为一个持续工作场景提供可控记忆层",
    highlight: "让用户看见、纠正并限定 AI 记住了什么，而不是只做更长的聊天记录。",
    demandInference: "持续项目中的重复解释可能形成真实摩擦，但尚未证明用户愿意单独采购记忆层。",
    counterSignal: "基础模型和平台可能把记忆变成默认能力。",
    unknown: "独立记忆产品相比平台内置能力的不可替代价值。",
  },
  {
    id: "business_action",
    keywords: ["sales", "crm", "customer", "marketing", "commerce", "销售", "营销", "客户", "电商"],
    findingTitle: "AI 产品正在承接更具体的业务动作",
    factPattern: "近期供给围绕获客、客户跟进、销售或运营动作提供更垂直的执行能力。",
    whyItMatters: "靠近业务动作更容易形成可衡量结果，也会带来更高的集成和可信度要求。",
    opportunityTitle: "为一个小团队业务动作提供轻量闭环",
    highlight: "围绕一个可以衡量结果的业务动作，连接输入、执行、复核和复盘。",
    demandInference: "已有人工投入可能意味着付出意愿，但供给增加并不等于目标用户会换工具。",
    counterSignal: "成熟 CRM 与营销平台可以用内置 AI 覆盖相同能力。",
    unknown: "哪类小团队的现有方案最笨重且切换成本可控。",
  },
  {
    id: "narrow_deliverable",
    keywords: [],
    findingTitle: "新供给继续从通用对话收窄到具体交付物",
    factPattern: "本期仍出现围绕单一对象、单一任务或单一交付物的新产品。",
    whyItMatters: "更窄的产品边界可能带来更清晰的价值说明与首次体验。",
    opportunityTitle: "从一个具体交付物反推最小产品",
    highlight: "先选用户真正要带走的成果，再设计最短完成路径。",
    demandInference: "具体交付物可能降低理解成本，但仍需证明任务频率和替代成本。",
    counterSignal: "窄工具容易被通用模型的模板或自定义指令替代。",
    unknown: "这个交付物是否频繁到值得成为独立产品。",
  },
];

export class RuleBasedPulseSynthesizer implements PulseSynthesizerPort {
  async synthesize(input: PulseSynthesisInput): Promise<PulseSynthesisResult> {
    const coverage = inspectPulseCoverage(input.collections, input.run.sourceIds);
    const grouped = groupSignals(input.signals);
    const findings: PulseFinding[] = [];
    const opportunities: Opportunity[] = [];
    for (const group of grouped.slice(0, 4)) {
      const sourceSignalIds = group.signals.map((signal) => signal.id);
      const sources = new Set(group.signals.map((signal) => signal.sourceId)).size;
      const fact = `${group.definition.factPattern} 本期观察到 ${group.signals.length} 条信号，来自 ${sources} 个来源。`;
      findings.push({
        id: input.idFactory.next("pulse_finding"),
        title: group.definition.findingTitle,
        fact,
        whyItMatters: group.definition.whyItMatters,
        demandInference: group.definition.demandInference,
        counterSignals: [group.definition.counterSignal],
        unknowns: [group.definition.unknown],
        sourceSignalIds,
      });
      opportunities.push({
        id: input.idFactory.next("opportunity"),
        reportId: "",
        title: group.definition.opportunityTitle,
        highlight: group.definition.highlight,
        rationale: fact,
        demandInference: group.definition.demandInference,
        counterSignals: [group.definition.counterSignal],
        unknowns: [group.definition.unknown],
        sourceSignalIds,
        status: "new",
        createdAt: input.now,
      });
    }
    const reportId = input.idFactory.next("pulse_report");
    const report: PulseReport = {
      id: reportId,
      runId: input.run.id,
      revision: 1,
      status: coverage.status,
      title: `市场供给脉搏 · ${formatSystemLocalCalendarDate(input.now)}`,
      summary:
        input.signals.length > 0
          ? `本期从 ${coverage.successfulSourceIds.length} 个可用来源观察到 ${input.signals.length} 条供给信号。以下方向是待验证推断，不代表需求或付费已经成立。`
          : "本期可用来源没有解析出足够供给信号；暂不生成方向，保留来源覆盖与解析缺口。",
      periodStart: input.periodStart,
      periodEnd: input.now,
      runtimeLabel: "真实公开来源 · 规则综合",
      successfulSourceIds: coverage.successfulSourceIds,
      failedSourceIds: coverage.failedSourceIds,
      coverageGaps: coverage.coverageGaps,
      findings,
      createdAt: input.now,
    };
    return {
      report,
      opportunities: opportunities.map((opportunity) => ({ ...opportunity, reportId })),
    };
  }
}

function groupSignals(signals: readonly SupplySignal[]) {
  const groups = new Map<string, { definition: ClusterDefinition; signals: SupplySignal[] }>();
  for (const signal of signals) {
    const corpus = `${signal.title} ${signal.summary} ${signal.categories.join(" ")}`.toLowerCase();
    const definition = clusters.find(
      (cluster) =>
        cluster.keywords.length === 0 || cluster.keywords.some((keyword) => corpus.includes(keyword)),
    ) as ClusterDefinition;
    const group = groups.get(definition.id) ?? { definition, signals: [] };
    group.signals.push(signal);
    groups.set(definition.id, group);
  }
  return [...groups.values()].sort(
    (left, right) =>
      new Set(right.signals.map((signal) => signal.sourceId)).size -
        new Set(left.signals.map((signal) => signal.sourceId)).size ||
      right.signals.length - left.signals.length,
  );
}
