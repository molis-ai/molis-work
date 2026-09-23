import { buildLensCompatibilityKey, lensKeysMatch, marketLensCompatibilityKey } from "../research/lens.js";
import type { LensReport } from "../research/report.js";

export type DecisionOutcome = "build" | "hold" | "drop";
export type DecisionSourceKind = "direct" | "annotation" | "conversation";

export interface DecisionReportBinding {
  reportId: string;
  revision: number;
  lens: "market_space" | "build_cost";
}

export interface Decision {
  id: string;
  ideaId: string;
  ideaVersion: number;
  mvpScopeVersion: number;
  outcome: DecisionOutcome;
  reason: string;
  revisitCondition: string;
  sourceKind: DecisionSourceKind;
  reportBindings: readonly [DecisionReportBinding, DecisionReportBinding];
  actorId: string;
  createdAt: string;
}

export type DecisionGate = { ready: true } | { ready: false; code: string; message: string };

export interface DecisionMaterials {
  ideaId: string;
  ideaVersion: number;
  mvpScopeVersion: number;
  marketReport?: LensReport;
  costReport?: LensReport;
}

export function inspectDecisionGate(materials: DecisionMaterials): DecisionGate {
  if (!materials.marketReport || !materials.costReport) {
    return { ready: false, code: "DECISION_REPORTS_INCOMPLETE", message: "两条研究材料尚未齐全" };
  }
  if (materials.marketReport.status !== "completed" || materials.costReport.status !== "completed") {
    return { ready: false, code: "DECISION_REPORTS_PARTIAL", message: "部分研究还不足以形成正式决策" };
  }
  const marketKey = marketLensCompatibilityKey(materials.ideaId, materials.ideaVersion);
  const costKey = buildLensCompatibilityKey(
    materials.ideaId,
    materials.ideaVersion,
    materials.mvpScopeVersion,
  );
  if (
    !lensKeysMatch(materials.marketReport.key, marketKey) ||
    !lensKeysMatch(materials.costReport.key, costKey)
  ) {
    return { ready: false, code: "DECISION_REPORTS_STALE", message: "研究材料与当前 Idea 版本不一致" };
  }
  return { ready: true };
}

export function createDecision(
  input: DecisionMaterials & {
    id: string;
    outcome: DecisionOutcome;
    reason: string;
    revisitCondition?: string;
    sourceKind: DecisionSourceKind;
    actorId: string;
    now: string;
  },
): Decision {
  const gate = inspectDecisionGate(input);
  if (!gate.ready) throw new Error(gate.code);
  if (input.reason.trim().length === 0) throw new Error("DECISION_REASON_REQUIRED");
  const marketReport = input.marketReport as LensReport;
  const costReport = input.costReport as LensReport;
  return {
    id: input.id,
    ideaId: input.ideaId,
    ideaVersion: input.ideaVersion,
    mvpScopeVersion: input.mvpScopeVersion,
    outcome: input.outcome,
    reason: input.reason.trim(),
    revisitCondition: input.revisitCondition?.trim() ?? "",
    sourceKind: input.sourceKind,
    reportBindings: [
      { reportId: marketReport.id, revision: marketReport.revision, lens: "market_space" },
      { reportId: costReport.id, revision: costReport.revision, lens: "build_cost" },
    ],
    actorId: input.actorId,
    createdAt: input.now,
  };
}

export function decisionDestination(outcome: DecisionOutcome): string {
  return {
    build: "Ideas · Build / MVP 验证",
    hold: "Ideas · Hold / 稍后再评估",
    drop: "Ideas · Drop / 已归档",
  }[outcome];
}
