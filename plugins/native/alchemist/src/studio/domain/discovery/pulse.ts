import { alchemistStateErrors } from "../../errors.js";
import type { RunStage, RunStatus } from "../kernel/run.js";
import type { PulseSourceId, SourceCollectionResult } from "./source.js";

export type OpportunityStatus = "new" | "saved_for_later" | "converted_to_direction" | "dismissed";

export interface PulseRun {
  id: string;
  workspaceId: string;
  status: RunStatus;
  stage: RunStage;
  sourceIds: readonly PulseSourceId[];
  runtimeLabel: string;
  jobId: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PulseFinding {
  id: string;
  title: string;
  fact: string;
  whyItMatters: string;
  demandInference: string;
  counterSignals: readonly string[];
  unknowns: readonly string[];
  sourceSignalIds: readonly string[];
}

export interface PulseReport {
  id: string;
  runId: string;
  revision: number;
  status: "completed" | "partial";
  title: string;
  summary: string;
  periodStart: string;
  periodEnd: string;
  runtimeLabel: string;
  successfulSourceIds: readonly PulseSourceId[];
  failedSourceIds: readonly PulseSourceId[];
  coverageGaps: readonly string[];
  findings: readonly PulseFinding[];
  createdAt: string;
}

export interface Opportunity {
  id: string;
  reportId: string;
  title: string;
  highlight: string;
  rationale: string;
  demandInference: string;
  counterSignals: readonly string[];
  unknowns: readonly string[];
  sourceSignalIds: readonly string[];
  status: OpportunityStatus;
  savedAt?: string;
  dismissedAt?: string;
  convertedAt?: string;
  convertedDirectionId?: string;
  createdAt: string;
}

export interface PulseCoverage {
  status: "completed" | "partial";
  successfulSourceIds: readonly PulseSourceId[];
  failedSourceIds: readonly PulseSourceId[];
  coverageGaps: readonly string[];
}

const sourceLabels: Record<PulseSourceId, string> = {
  toolify: "Toolify",
  watcha: "观猹",
  github: "GitHub",
};

export function inspectPulseCoverage(
  results: readonly SourceCollectionResult[],
  expectedSourceIds: readonly PulseSourceId[],
): PulseCoverage {
  const bySource = new Map(results.map((result) => [result.sourceId, result]));
  const successfulSourceIds = expectedSourceIds.filter(
    (sourceId) => bySource.get(sourceId)?.status === "completed",
  );
  const failedSourceIds = expectedSourceIds.filter(
    (sourceId) => bySource.get(sourceId)?.status !== "completed",
  );
  return {
    status: failedSourceIds.length === 0 ? "completed" : "partial",
    successfulSourceIds,
    failedSourceIds,
    coverageGaps: failedSourceIds.map(
      (sourceId) => `${sourceLabels[sourceId]}抓取失败，不能判断该来源当前是否存在信号。`,
    ),
  };
}

type OpportunityAction =
  | { action: "save_for_later"; now: string }
  | { action: "dismiss"; now: string }
  | { action: "convert_to_direction"; directionId: string; now: string };

export function transitionOpportunity(opportunity: Opportunity, action: OpportunityAction): Opportunity {
  if (opportunity.status === "converted_to_direction") {
    throw alchemistStateErrors.opportunity_already_converted("alchemist.opportunity_already_converted");
  }
  if (action.action === "save_for_later") {
    if (opportunity.status !== "new") {
      throw alchemistStateErrors.opportunity_cannot_be_saved("alchemist.opportunity_cannot_be_saved");
    }
    return { ...opportunity, status: "saved_for_later", savedAt: action.now };
  }
  if (action.action === "dismiss") {
    if (opportunity.status !== "new" && opportunity.status !== "saved_for_later") {
      throw alchemistStateErrors.opportunity_cannot_be_dismissed("alchemist.opportunity_cannot_be_dismissed");
    }
    return { ...opportunity, status: "dismissed", dismissedAt: action.now };
  }
  if (opportunity.status !== "new" && opportunity.status !== "saved_for_later") {
    throw alchemistStateErrors.opportunity_cannot_be_converted("alchemist.opportunity_cannot_be_converted");
  }
  return {
    ...opportunity,
    status: "converted_to_direction",
    convertedDirectionId: action.directionId,
    convertedAt: action.now,
  };
}
