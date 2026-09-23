import { z } from "zod";
import type { RuntimeModel } from "../../domain/kernel/ports.js";
import type { LensKind, LensRun, ResearchPlan } from "../../domain/research/lens.js";
import { lensKinds } from "../../domain/research/lens.js";
import type { Evidence, LensReport } from "../../domain/research/report.js";

export const lensParamsSchema = z.object({ id: z.string().min(1), lens: z.enum(lensKinds) }).strict();

export const researchPlanRequestSchema = z
  .object({
    ideaVersion: z.number().int().positive(),
    modelPolicy: z.enum(["auto", "fixed"]),
    modelId: z.string().min(1).optional(),
    budget: z.object({ kind: z.literal("calls"), limit: z.number().int().min(1).max(40) }).strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.modelPolicy === "fixed" && !value.modelId) {
      context.addIssue({ code: "custom", path: ["modelId"], message: "指定模型时必须选择模型" });
    }
  });

export const startLensRunRequestSchema = z.object({ planId: z.string().min(1) }).strict();

export const ideaResearchParamsSchema = z
  .object({ id: z.string().min(1), version: z.coerce.number().int().positive() })
  .strict();

export type LensViewStatus =
  | "not_started"
  | "planned"
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export interface LensWorkspaceDto {
  lens: LensKind;
  status: LensViewStatus;
  plan?: ResearchPlan;
  run?: LensRun;
  report?: LensReport;
  evidence?: Evidence[];
}

export interface IdeaResearchWorkspaceDto {
  ideaId: string;
  ideaVersion: number;
  models: readonly RuntimeModel[];
  lenses: Record<LensKind, LensWorkspaceDto>;
}

export type RuntimeModelDto = RuntimeModel;
export type ResearchPlanDto = ResearchPlan;
export type LensRunDto = LensRun;
export type LensReportDto = LensReport;
export type EvidenceDto = Evidence;

export const lensCompatibilityKeySchema = z
  .object({
    ideaId: z.string().min(1),
    ideaVersion: z.number().int().positive(),
    mvpScopeVersion: z.number().int().positive().optional(),
    lens: z.enum(lensKinds),
  })
  .strict();

export const evidenceSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    sourceType: z.enum(["official", "user_signal", "independent_analysis", "repository"]),
    title: z.string().min(1),
    url: z.string().min(1),
    excerpt: z.string().min(1),
    capturedAt: z.string().datetime(),
    contentHash: z.string().min(1),
  })
  .strict();

export const claimSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(["supported", "tentative", "disputed", "unknown"]),
    conclusion: z.string().min(1),
    rationale: z.string().min(1),
    supportingEvidenceIds: z.array(z.string().min(1)),
    counterEvidenceIds: z.array(z.string().min(1)),
    unknowns: z.array(z.string().min(1)),
    changeConditions: z.array(z.string().min(1)),
  })
  .strict();

export const lensReportSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    revision: z.number().int().positive(),
    key: lensCompatibilityKeySchema,
    status: z.enum(["completed", "partial"]),
    runtimeLabel: z.string().min(1),
    summary: z.string().min(1),
    judgments: z.array(claimSchema),
    createdAt: z.string().datetime(),
  })
  .strict();
