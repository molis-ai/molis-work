import { describe, expect, it } from "vitest";
import { type IdeaCard, keepCard } from "../../src/studio/domain/discovery/idea-card";

const candidate: IdeaCard = {
  id: "card_assumption_killer",
  explorationRunId: "exploration_01",
  directionId: "direction_01",
  status: "candidate",
  title: "先找到最便宜的反证实验",
  highlight: "先用最小代价找出最可能推翻想法的事实。",
  targetUser: "还没有决定投入方向的独立创始人",
  scenario: "创始人准备验证一个仍有关键未知的产品方向",
  problem: "团队常把验证等同于尽快造出 MVP",
  mechanism: "把核心假设排成成本递增的反证实验",
  valueProposition: "在投入开发前先暴露最危险的错误假设",
  whyItMayWork: "验证成本与决策影响被放在同一张卡里",
  assumptions: ["用户愿意在开发前验证"],
  unknowns: ["建议能否足够具体", "用户是否愿意记录反证"],
  mvp: {
    inScope: ["假设清单", "三档反证实验"],
    outOfScope: ["自动投放", "替用户做决定"],
  },
  createdAt: "2026-07-31T00:00:00.000Z",
};

describe("keeping an Idea Card", () => {
  it("forms Idea v1 with exact card and exploration provenance", () => {
    const result = keepCard(candidate, {
      ideaId: "idea_assumption_killer",
      ideaVersionId: "idea_version_assumption_killer_1",
      actorId: "actor_local",
      now: "2026-07-31T00:02:00.000Z",
    });

    expect(result.card).toMatchObject({
      id: candidate.id,
      status: "kept",
      keptIdeaId: "idea_assumption_killer",
    });
    expect(result.idea).toEqual({
      id: "idea_assumption_killer",
      directionId: "direction_01",
      lifecycle: "exploring",
      currentVersion: 1,
      createdAt: "2026-07-31T00:02:00.000Z",
      updatedAt: "2026-07-31T00:02:00.000Z",
    });
    expect(result.version).toMatchObject({
      id: "idea_version_assumption_killer_1",
      ideaId: "idea_assumption_killer",
      sourceCardId: candidate.id,
      sourceExplorationRunId: candidate.explorationRunId,
      revision: {
        version: 1,
        actorId: "actor_local",
        reason: "kept_idea_card",
        createdAt: "2026-07-31T00:02:00.000Z",
      },
      content: {
        title: candidate.title,
        targetUser: candidate.targetUser,
        coreMechanism: candidate.mechanism,
      },
    });
  });

  it("rejects keeping a discarded card", () => {
    const discarded: IdeaCard = {
      ...candidate,
      status: "discarded",
      discardedAt: "2026-07-31T00:01:00.000Z",
    };

    expect(() =>
      keepCard(discarded, {
        ideaId: "idea_assumption_killer",
        ideaVersionId: "idea_version_assumption_killer_1",
        actorId: "actor_local",
        now: "2026-07-31T00:02:00.000Z",
      }),
    ).toThrowError("IDEA_CARD_NOT_CANDIDATE");
  });
});
