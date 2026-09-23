import { describe, expect, it } from "vitest";
import {
  discardCard,
  type IdeaCard,
  IdeaCardTransitionError,
  restoreCard,
} from "../../src/studio/domain/discovery/idea-card";

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

describe("Idea Card state transitions", () => {
  it("discards a candidate without mutating the original card", () => {
    const discarded = discardCard(candidate, "2026-07-31T00:01:00.000Z");

    expect(discarded).toMatchObject({
      status: "discarded",
      discardedAt: "2026-07-31T00:01:00.000Z",
    });
    expect(candidate.status).toBe("candidate");
  });

  it("restores an explicitly discarded card", () => {
    const discarded = discardCard(candidate, "2026-07-31T00:01:00.000Z");

    expect(restoreCard(discarded)).toEqual(candidate);
  });

  it("rejects discarding a card that is no longer a candidate", () => {
    const discarded = discardCard(candidate, "2026-07-31T00:01:00.000Z");

    expect(() => discardCard(discarded, "2026-07-31T00:02:00.000Z")).toThrowError(
      new IdeaCardTransitionError("IDEA_CARD_NOT_CANDIDATE"),
    );
  });
});
