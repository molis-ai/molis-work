import { z } from "zod";
import type { ActionProposal } from "../../domain/calibration/calibration.js";
import type { PlaybookRule, TasteRule } from "../../domain/memory/rules.js";

export const createPlaybookProposalSchema = z
  .object({
    methodChange: z.string().trim().min(1).max(2_000),
    positiveExamples: z.array(z.string().trim().min(1).max(500)).max(20),
    negativeExamples: z.array(z.string().trim().min(1).max(500)).max(20),
    scopeKind: z.enum(["report", "direction", "global_market_space"]),
  })
  .strict();

export const createTasteRuleSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    statement: z.string().trim().min(1).max(1_000),
    appliesTo: z.string().trim().min(1).max(500),
    exceptions: z.array(z.string().trim().min(1).max(500)).max(20),
  })
  .strict();

export const memoryRuleParamsSchema = z.object({ id: z.string().min(1) }).strict();

export interface MemoryWorkspaceDto {
  taste: readonly TasteRule[];
  playbook: ReadonlyArray<PlaybookRule & { applications: ReadonlyArray<{ planId: string; runId?: string }> }>;
}

export type TasteRuleDto = TasteRule;
export type PlaybookRuleDto = PlaybookRule;
export type ActionProposalDto = ActionProposal;
