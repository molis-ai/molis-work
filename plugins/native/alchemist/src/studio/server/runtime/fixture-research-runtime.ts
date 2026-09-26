import type { IdeaVersion } from "../../domain/ideas/idea.js";
import type { IdFactory } from "../../domain/kernel/identity.js";
import type { ResearchPlan } from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";

export type LensExecutionCheckpoint =
  | { stage: "planning_complete" }
  | { stage: "collecting_complete"; evidence: Evidence[] }
  | { stage: "cross_checking_complete"; evidence: Evidence[]; claims: Claim[]; callsUsed?: number }
  | { stage: "ready_to_persist"; evidence: Evidence[]; report: LensReport };

export interface RuntimeInput {
  plan: ResearchPlan;
  ideaVersion: IdeaVersion;
  idFactory: IdFactory;
  now: string;
  signal?: AbortSignal;
  beforeCorrection?: () => Promise<void>;
  beforeModelDispatch?: () => Promise<void>;
}

export interface ResearchExecutionRuntimePort {
  collect(input: RuntimeInput): Promise<Evidence[]>;
  crossCheck(input: RuntimeInput & { evidence: readonly Evidence[] }): Promise<Claim[]>;
  synthesize(
    input: RuntimeInput & { evidence: readonly Evidence[]; claims: readonly Claim[]; runId: string },
  ): Promise<LensReport>;
}

export class FixtureResearchRuntimeAdapter implements ResearchExecutionRuntimePort {
  constructor(private readonly stageDelayMs = 0) {}

  async collect(input: RuntimeInput): Promise<Evidence[]> {
    await delay(this.stageDelayMs);
    const records =
      input.plan.key.lens === "market_space"
        ? [
            {
              sourceId: "fixture-user-workflow",
              sourceType: "user_signal" as const,
              title: "创始人反复手工整理验证假设",
              excerpt: "同一批假设会在访谈、竞品表和开发清单之间被重复整理。",
            },
            {
              sourceId: "fixture-competitor-official",
              sourceType: "official" as const,
              title: "现有研究产品强调搜索与长报告",
              excerpt: "主要供给集中在既定课题的资料检索，较少承接 Idea 形成后的决策过程。",
            },
            {
              sourceId: "fixture-counter-signal",
              sourceType: "independent_analysis" as const,
              title: "部分用户只需要一次性对话",
              excerpt: "低频创始人可能不愿维护长期证据与版本，留存仍待验证。",
            },
          ]
        : [
            {
              sourceId: "fixture-mvp-scope",
              sourceType: "repository" as const,
              title: "当前 MVP 范围快照",
              excerpt: `首版只包含：${input.ideaVersion.content.mvp.inScope.join("、")}。`,
            },
            {
              sourceId: "fixture-runtime-boundary",
              sourceType: "official" as const,
              title: "模型运行时保持可替换",
              excerpt: "产品域只依赖自身 Runtime Port，不绑定当前 SDK 的宿主形态。",
            },
            {
              sourceId: "fixture-cost-counter",
              sourceType: "independent_analysis" as const,
              title: "外部来源与长期运行仍有不确定性",
              excerpt: "来源稳定性、模型调用和本地运维会形成持续成本。",
            },
          ];
    return records.map((record, index) => ({
      id: input.idFactory.next("evidence"),
      ...record,
      url: `fixture://research/${input.plan.key.lens}/${index + 1}`,
      capturedAt: input.now,
      contentHash: `fixture:${input.plan.key.lens}:${index + 1}`,
    }));
  }

  async crossCheck(input: RuntimeInput & { evidence: readonly Evidence[] }): Promise<Claim[]> {
    await delay(this.stageDelayMs);
    const [first, second, counter] = input.evidence;
    if (!first || !second || !counter) throw new Error("FIXTURE_EVIDENCE_INCOMPLETE");
    const definitions =
      input.plan.key.lens === "market_space"
        ? [
            ["需求强度", "supported", "目标用户确实反复遇到研究判断难以追溯的问题。"],
            ["付出意愿", "tentative", "用户已经付出时间，但尚未证明愿意持续付费。"],
            ["竞争压力", "supported", "研究工具很多，直接竞争不弱。"],
            ["切入缝隙", "tentative", "从 Idea 到决策的连续版本链仍有差异化空间。"],
            ["触达与时机", "tentative", "独立创始人可在线触达，但留存窗口仍需验证。"],
          ]
        : [
            ["MVP 边界", "supported", "当前范围可以被压缩成单用户本地闭环。"],
            ["前后端工作", "supported", "模块化单体可以承载首版交付。"],
            ["模型与数据", "tentative", "模型接口已隔离，真实质量与成本仍待接入验证。"],
            ["集成与部署", "supported", "本地同源 Web 不依赖团队服务即可运行。"],
            ["持续成本", "tentative", "主要变量来自研究调用频率与来源抓取。"],
            ["运维与合规", "tentative", "单用户降低权限复杂度，但外部数据使用边界仍需核对。"],
            ["最便宜验证", "supported", "先用演示 Adapter 跑通业务状态，再替换真实 Runtime。"],
          ];
    return definitions.map(([label, status, conclusion], index) => ({
      id: input.idFactory.next("claim"),
      label,
      status: status as Claim["status"],
      conclusion,
      rationale: `${first.title}与${second.title}形成支持，同时保留“${counter.title}”这一反向信号。`,
      supportingEvidenceIds: [index % 2 === 0 ? first.id : second.id],
      counterEvidenceIds: [counter.id],
      unknowns: [input.plan.key.lens === "market_space" ? "真实付费与复访数据" : "真实模型与来源负载"],
      changeConditions: ["后续真实证据与当前演示信号方向相反"],
    }));
  }

  async synthesize(
    input: RuntimeInput & {
      evidence: readonly Evidence[];
      claims: readonly Claim[];
      runId: string;
    },
  ): Promise<LensReport> {
    await delay(this.stageDelayMs);
    const partial = input.plan.budget.limit < 4;
    return {
      id: input.idFactory.next("lens_report"),
      runId: input.runId,
      revision: 1,
      key: input.plan.key,
      status: partial ? "partial" : "completed",
      runtimeLabel: "演示运行时",
      summary:
        input.plan.key.lens === "market_space"
          ? "有条件值得继续：问题真实，但付费意愿与长期留存仍需用真实用户验证。"
          : "实现工作量可控：先守住单用户本地闭环，并把真实 Runtime 与来源接入留在明确边界。",
      judgments: [...input.claims],
      createdAt: input.now,
    };
  }
}

async function delay(durationMs: number): Promise<void> {
  if (durationMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}
