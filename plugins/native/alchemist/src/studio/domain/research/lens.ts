import type { RunStage, RunStatus } from "../kernel/run.js";
import type { ResearchBudget } from "./budget.js";

export const lensKinds = ["market_space", "build_cost"] as const;
export type LensKind = (typeof lensKinds)[number];

export interface LensCompatibilityKey {
  ideaId: string;
  ideaVersion: number;
  mvpScopeVersion?: number;
  lens: LensKind;
}

export interface MvpScopeVersion {
  id: string;
  ideaId: string;
  version: number;
  ideaVersion: number;
  inScope: readonly string[];
  outOfScope: readonly string[];
  platformAssumptions: readonly string[];
  integrationAssumptions: readonly string[];
  createdAt: string;
}

export interface ResearchPlan {
  id: string;
  key: LensCompatibilityKey;
  scopeSummary: string;
  modelPolicy: "auto" | "fixed";
  modelId: string;
  runtimeLabel: string;
  estimatedDuration: { minMinutes: number; maxMinutes: number };
  budget: ResearchBudget;
  appliedPlaybookRuleIds: readonly string[];
  createdAt: string;
}

export interface LensRun {
  id: string;
  planId: string;
  key: LensCompatibilityKey;
  status: RunStatus;
  stage: RunStage;
  runtimeLabel: string;
  jobId: string;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
}

export function marketLensCompatibilityKey(ideaId: string, ideaVersion: number): LensCompatibilityKey {
  assertVersion(ideaVersion);
  return { ideaId, ideaVersion, lens: "market_space" };
}

export function buildLensCompatibilityKey(
  ideaId: string,
  ideaVersion: number,
  mvpScopeVersion: number,
): LensCompatibilityKey {
  assertVersion(ideaVersion);
  assertVersion(mvpScopeVersion);
  return { ideaId, ideaVersion, mvpScopeVersion, lens: "build_cost" };
}

export function lensKeysMatch(left: LensCompatibilityKey, right: LensCompatibilityKey): boolean {
  return (
    left.ideaId === right.ideaId &&
    left.ideaVersion === right.ideaVersion &&
    left.mvpScopeVersion === right.mvpScopeVersion &&
    left.lens === right.lens
  );
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) throw new Error("LENS_VERSION_INVALID");
}
