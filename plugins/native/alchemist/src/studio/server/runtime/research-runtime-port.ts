import type { IdeaVersion } from "../../domain/ideas/idea.js";
import type { IdFactory } from "../../domain/kernel/identity.js";
import type { ResearchPlan } from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";

/** What a research stage asks of the runtime that executes it; the host adapter implements it. */
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
