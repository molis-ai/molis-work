import { z } from "zod";
import type { ResearchPlan } from "../../domain/research/lens.js";
import { claimSchema, evidenceSchema, lensReportSchema } from "../../shared/contracts/research.js";
import type { LensExecutionCheckpoint } from "../runtime/research-runtime-port.js";
import type { PersistedJob, PersistedJobEvent } from "./sqlite-job-runner.js";

export const lensInputSchema = z.object({ lensRunId: z.string().min(1), planId: z.string().min(1), actorId: z.string().min(1).optional() }).strict();
const checkpointSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("planning_complete") }).strict(),
  z.object({ stage: z.literal("collecting_complete"), evidence: z.array(evidenceSchema) }).strict(),
  z.object({ stage: z.literal("cross_checking_complete"), evidence: z.array(evidenceSchema), claims: z.array(claimSchema),
    callsUsed: z.number().int().min(2).max(3).optional() }).strict(),
  z.object({ stage: z.literal("ready_to_persist"), evidence: z.array(evidenceSchema), report: lensReportSchema }).strict(),
]);
const operation = z.enum(["collecting", "cross_checking", "cross_checking_format_correction", "synthesizing"]);
const startedSchema = z.object({ operation, callsUsed: z.number().int().positive(), limit: z.number().int().positive() }).strict();
const dispatchedSchema = z.object({ stage: z.literal("call_dispatched"), operation,
  callsUsed: z.number().int().positive(), previous: checkpointSchema }).strict();

/** Full event history is the reservation ledger; a stage checkpoint is never a replacement count. */
export function inspectLensProgress(job: PersistedJob, plan: ResearchPlan, events: readonly PersistedJobEvent[]) {
  if (plan.budget.kind !== "calls" || !Number.isInteger(plan.budget.limit) || plan.budget.limit < 1) throw new Error("alchemist.research_budget_invalid");
  const calls = events.filter(event => event.type === "call_started").map(event => startedSchema.parse(event.payload));
  for (let index = 0; index < calls.length; index++) {
    if (calls[index]!.callsUsed !== index + 1 || calls[index]!.limit !== plan.budget.limit) throw new Error("alchemist.research_budget_history_invalid");
  }
  const used = calls.length, last = calls.at(-1);
  if (used > plan.budget.limit) throw new Error("alchemist.research_budget_history_invalid");
  let checkpoint: LensExecutionCheckpoint | undefined;
  let unknownCall: { operation: z.infer<typeof operation> } | undefined;
  const interrupted = (job.checkpoint as { stage?: string } | undefined)?.stage === "call_dispatched";
  if (interrupted) {
    const marker = dispatchedSchema.parse(job.checkpoint);
    if (!last || marker.callsUsed !== used || marker.operation !== last.operation) throw new Error("alchemist.research_budget_history_invalid");
    const expected = marker.previous.stage === "planning_complete" ? ["collecting"]
      : marker.previous.stage === "collecting_complete" ? ["cross_checking", "cross_checking_format_correction"]
      : marker.previous.stage === "cross_checking_complete" ? ["synthesizing"] : [];
    if (!expected.includes(marker.operation)) throw new Error("alchemist.research_budget_history_invalid");
    checkpoint = marker.previous;
    unknownCall = { operation: marker.operation };
  } else {
    checkpoint = job.checkpoint === undefined ? undefined : checkpointSchema.parse(job.checkpoint);
    if ((!checkpoint || checkpoint.stage === "planning_complete") && used !== 0) throw new Error("alchemist.research_budget_history_invalid");
    if (checkpoint?.stage === "collecting_complete" && last?.operation !== "collecting") throw new Error("alchemist.research_budget_history_invalid");
    if (checkpoint?.stage === "cross_checking_complete") {
      if (!last || !["cross_checking", "cross_checking_format_correction"].includes(last.operation)
        || (checkpoint.callsUsed !== undefined && checkpoint.callsUsed !== used)) throw new Error("alchemist.research_budget_history_invalid");
    }
    if (checkpoint?.stage === "ready_to_persist" && !last) throw new Error("alchemist.research_budget_history_invalid");
  }
  const needsCall = !checkpoint || checkpoint.stage === "planning_complete"
    || (checkpoint.stage === "collecting_complete" && plan.budget.limit !== 1)
    || (checkpoint.stage === "cross_checking_complete" && plan.budget.limit !== 2);
  return { checkpoint, callsUsed: used, interrupted, unknownCall,
    budget: { limit: plan.budget.limit, reserved: used, remaining: plan.budget.limit - used },
    exhausted: needsCall && used === plan.budget.limit };
}

export function readLensProgress(job: PersistedJob, plan: ResearchPlan, events: readonly PersistedJobEvent[]) {
  const progress = inspectLensProgress(job, plan, events);
  if (progress.exhausted) throw new Error("alchemist.research_budget_exhausted");
  return progress;
}
