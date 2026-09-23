import type { Direction } from "../../domain/discovery/direction.js";
import type { DirectionUnderstanding } from "../../domain/discovery/exploration.js";
import type { IdeaCard } from "../../domain/discovery/idea-card.js";
import type { IdFactory } from "../../domain/kernel/identity.js";
import type {
  AiRuntimePort,
  GenerationResult,
  StructuredGenerationRequest,
} from "../../domain/kernel/ports.js";

export interface ExplorationCheckpoint {
  stage: "ready_to_persist";
  runtimeLabel: string;
  understanding: DirectionUnderstanding;
  cards: IdeaCard[];
}

export class FixtureAiRuntimeAdapter implements AiRuntimePort {
  async listModels() {
    return [
      {
        id: "fixture-research-v1",
        label: "演示研究模型",
        runtimeLabel: "演示运行时",
        costVisibility: "unobservable" as const,
      },
    ];
  }

  async generateStructured<Result>(
    input: StructuredGenerationRequest<Result>,
  ): Promise<GenerationResult<Result>> {
    const direction = parseDirectionPrompt(input.userPrompt);
    const candidate = createFixtureGeneration(direction.title, direction.description);
    return {
      operationId: input.operationId,
      runtimeLabel: "演示运行时",
      value: input.parse(candidate),
    };
  }

  static exampleCheckpoint(input: {
    direction: Direction;
    explorationRunId: string;
    idFactory: IdFactory;
    now: string;
  }): ExplorationCheckpoint {
    const generation = createFixtureGeneration(input.direction.title, input.direction.description);
    return {
      stage: "ready_to_persist",
      runtimeLabel: "演示运行时",
      understanding: generation.understanding,
      cards: generation.cards.map((draft) => ({
        ...draft,
        id: input.idFactory.next("card"),
        explorationRunId: input.explorationRunId,
        directionId: input.direction.id,
        status: "candidate" as const,
        createdAt: input.now,
      })),
    };
  }
}

function parseDirectionPrompt(prompt: string): { title: string; description: string } {
  const parsed = JSON.parse(prompt) as { title?: unknown; description?: unknown };
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("FIXTURE_DIRECTION_INVALID");
  }
  return { title: parsed.title, description: parsed.description };
}

function createFixtureGeneration(title: string, description: string) {
  const subject = title.trim() || "这个方向";
  const useSubjectInTitle = subject.length <= 12;
  return {
    noCardsReason: null,
    understanding: {
      summary: `围绕“${subject}”探索能够快速验证真实需求的 AI 产品。`,
      assumptions: ["用户愿意在正式投入开发前先验证关键假设"],
      unknowns: ["最早愿意持续使用的细分用户是谁"],
      concreteness: "direction" as const,
    },
    cards: [
      {
        title: useSubjectInTitle ? `${subject} · 假设杀手` : "关键假设杀手",
        highlight: "在写代码前，先找出最可能让产品失败的那条假设。",
        targetUser: "正在筛选 AI 产品方向的独立开发者与小团队创始人",
        scenario: `用户已经有“${description}”这样的方向，但还不知道先验证什么。`,
        problem: "脑暴很容易制造兴奋感，却没有暴露最致命的未知点。",
        mechanism: "把方向拆成可证伪假设，自动生成最小访谈、搜索与落地页验证动作。",
        valueProposition: "用一轮短验证替代数周盲目开发。",
        whyItMayWork: "创始人已经在用时间和零散调研承担这项工作，结果却不可追踪。",
        assumptions: ["创始人愿意在开发前主动寻找反证"],
        unknowns: ["用户是否愿意让系统挑战自己最喜欢的假设"],
        mvp: {
          inScope: ["方向拆解", "关键假设排序", "最小验证动作"],
          outOfScope: ["自动投放广告", "代替用户做最终决策"],
        },
      },
      {
        title: useSubjectInTitle ? `${subject} · 证据拼图` : "市场证据拼图",
        highlight: "把散落的用户信号拼成一份能反驳、能追溯的判断。",
        targetUser: "已有访谈、评论和竞品材料但难以归纳的产品负责人",
        scenario: "研究材料分散在网页、文档和聊天记录里，复盘时找不到结论来源。",
        problem: "观点和证据混在一起，团队容易把重复转述误当成多份证据。",
        mechanism: "按 Claim 聚合独立证据与反证，并显式标出未知和冲突。",
        valueProposition: "让每个产品判断都能回到原始信号。",
        whyItMayWork: "研究工具多擅长搜集，较少帮助创始人维护可校准的判断链。",
        assumptions: ["用户会为了可追溯性整理少量关键证据"],
        unknowns: ["多轻的录入方式才能让用户持续维护证据"],
        mvp: {
          inScope: ["证据摘录", "Claim 聚合", "反证标记"],
          outOfScope: ["通用知识库", "多人权限"],
        },
      },
      {
        title: useSubjectInTitle ? `${subject} · 最小验证` : "最小验证编排器",
        highlight: "把最危险的未知点，排成一条低成本、可停止的验证路径。",
        targetUser: "资源有限、需要决定下一周做什么的早期创始人",
        scenario: "用户已经看到若干正向信号，但还不能判断应该访谈、做原型还是先找付费承诺。",
        problem: "验证动作彼此割裂，团队容易先做最顺手而不是最能改变决定的实验。",
        mechanism: "按照决策影响、证据缺口和执行成本，编排一组带停止条件的验证动作。",
        valueProposition: "每一步都明确回答什么，以及什么结果意味着不再继续。",
        whyItMayWork: "创始人不缺验证方法，缺的是与当前 Idea 和关键未知绑定的先后顺序。",
        assumptions: ["明确的停止条件能够降低创始人的沉没成本偏差"],
        unknowns: ["系统能否给出足够现实的停止条件"],
        mvp: {
          inScope: ["未知点排序", "验证动作建议", "停止条件"],
          outOfScope: ["自动联系用户", "自动发布实验"],
        },
      },
    ],
  };
}
