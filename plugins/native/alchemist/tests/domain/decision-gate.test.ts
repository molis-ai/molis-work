import { describe, expect, it } from "vitest";
import { createDecision, inspectDecisionGate } from "../../src/studio/domain/decision/decision";
import type { LensReport } from "../../src/studio/domain/research/report";

function report(input: {
  id: string;
  lens: "market_space" | "build_cost";
  ideaVersion?: number;
  mvpScopeVersion?: number;
  status?: "completed" | "partial";
}): LensReport {
  return {
    id: input.id,
    runId: `run_${input.id}`,
    revision: 1,
    key: {
      ideaId: "idea_01",
      ideaVersion: input.ideaVersion ?? 1,
      ...(input.mvpScopeVersion ? { mvpScopeVersion: input.mvpScopeVersion } : {}),
      lens: input.lens,
    },
    status: input.status ?? "completed",
    runtimeLabel: "演示运行时",
    summary: "结论",
    judgments: [],
    createdAt: "2026-07-31T10:00:00.000Z",
  };
}

describe("Decision gate", () => {
  it("requires both complete, compatible Lens reports", () => {
    expect(
      inspectDecisionGate({
        ideaId: "idea_01",
        ideaVersion: 1,
        mvpScopeVersion: 1,
        marketReport: report({ id: "market_01", lens: "market_space" }),
        costReport: report({ id: "cost_01", lens: "build_cost", mvpScopeVersion: 1 }),
      }),
    ).toEqual({ ready: true });
  });

  it.each([
    ["market missing", undefined, report({ id: "cost_01", lens: "build_cost", mvpScopeVersion: 1 })],
    [
      "partial market",
      report({ id: "market_01", lens: "market_space", status: "partial" }),
      report({ id: "cost_01", lens: "build_cost", mvpScopeVersion: 1 }),
    ],
    [
      "stale cost scope",
      report({ id: "market_01", lens: "market_space" }),
      report({ id: "cost_01", lens: "build_cost", mvpScopeVersion: 2 }),
    ],
  ])("blocks %s", (_name, marketReport, costReport) => {
    const gate = inspectDecisionGate({
      ideaId: "idea_01",
      ideaVersion: 1,
      mvpScopeVersion: 1,
      marketReport,
      costReport,
    });
    expect(gate.ready).toBe(false);
  });

  it("freezes both exact report revisions in the Decision", () => {
    const decision = createDecision({
      id: "decision_01",
      ideaId: "idea_01",
      ideaVersion: 1,
      mvpScopeVersion: 1,
      outcome: "build",
      reason: "先做最小验证",
      revisitCondition: "完成 10 次真实用户验证后复盘",
      sourceKind: "direct",
      actorId: "actor-local",
      now: "2026-07-31T12:00:00.000Z",
      marketReport: report({ id: "market_01", lens: "market_space" }),
      costReport: report({ id: "cost_01", lens: "build_cost", mvpScopeVersion: 1 }),
    });

    expect(decision.reportBindings).toEqual([
      { reportId: "market_01", revision: 1, lens: "market_space" },
      { reportId: "cost_01", revision: 1, lens: "build_cost" },
    ]);
    expect(decision.outcome).toBe("build");
    expect(decision.revisitCondition).toBe("完成 10 次真实用户验证后复盘");
    expect(decision.sourceKind).toBe("direct");
  });
});
