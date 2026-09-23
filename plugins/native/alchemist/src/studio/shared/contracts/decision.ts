import { z } from "zod";
import type { Decision, DecisionOutcome, DecisionSourceKind } from "../../domain/decision/decision.js";
import type { IdeaLifecycle } from "../../domain/ideas/idea.js";
import type { LensViewStatus } from "./research.js";

export const decisionParamsSchema = z
  .object({ id: z.string().min(1), version: z.coerce.number().int().positive() })
  .strict();

export const createDecisionRequestSchema = z
  .object({
    outcome: z.enum(["build", "hold", "drop"]),
    reason: z.string().trim().min(2).max(1_000),
    revisitCondition: z.string().trim().max(1_000).optional(),
  })
  .strict();

export interface DecisionMaterialDto {
  status: LensViewStatus;
  summary?: string;
  reportId?: string;
}

export interface DecisionWorkspaceDto {
  ideaId: string;
  ideaVersion: number;
  currentVersion: number;
  title: string;
  lifecycle: IdeaLifecycle;
  gate: { ready: true } | { ready: false; code: string; message: string };
  materials: {
    market_space: DecisionMaterialDto;
    build_cost: DecisionMaterialDto;
  };
  decision?: Pick<
    Decision,
    "id" | "outcome" | "reason" | "revisitCondition" | "sourceKind" | "createdAt" | "reportBindings"
  >;
}

export type DecisionOutcomeDto = DecisionOutcome;

export type DecisionCaseStatus = "pending" | "decided" | "old_version";

export interface DecisionCaseDto extends DecisionWorkspaceDto {
  status: DecisionCaseStatus;
  nextPanel: "market" | "cost" | "decision";
  nextAction: string;
}

export interface DecisionsSurfaceDto {
  cases: DecisionCaseDto[];
  log: DecisionLogEntryDto[];
  activities: ActivityEventDto[];
}

export interface DecisionLogEntryDto extends Decision {
  title: string;
  destination: string;
  sourceKind: DecisionSourceKind;
}

export interface ActivityEventDto {
  id: string;
  workspaceId: string;
  kind: string;
  targetKind: string;
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
