import { ZodError, z } from "zod";
import type { IdeaVersion } from "../../domain/ideas/idea.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { LensKind, ResearchPlan } from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";
import { claimSchema, evidenceSchema, lensReportSchema } from "../../shared/contracts/research.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type {
  LensExecutionCheckpoint,
  ResearchExecutionRuntimePort,
} from "../runtime/fixture-research-runtime.js";
import { RESEARCH_LENS_JOB, type ResearchLensJobInput } from "../services/start-lens-run.js";
import { JobExecutionError, type JobHandler, type JobHandlerControl } from "./local-worker.js";
import type { PersistedJob } from "./sqlite-job-runner.js";

const inputSchema = z.object({ lensRunId: z.string().min(1), planId: z.string().min(1), actorId: z.string().min(1).optional() }).strict();
const checkpointSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("planning_complete") }).strict(),
  z.object({ stage: z.literal("collecting_complete"), evidence: z.array(evidenceSchema) }).strict(),
  z
    .object({
      stage: z.literal("cross_checking_complete"),
      evidence: z.array(evidenceSchema),
      claims: z.array(claimSchema),
      callsUsed: z.number().int().min(2).max(3).optional(),
    })
    .strict(),
  z
    .object({
      stage: z.literal("ready_to_persist"),
      evidence: z.array(evidenceSchema),
      report: lensReportSchema,
    })
    .strict(),
]);

import type { WorkReuseService } from "../../../work-reuse/service.js";

export interface LensJobDependencies {
  workReuse?: WorkReuseService;
  repository: SqliteResearchRepository;
  ideas: SqliteIdeaRepository;
  runtime: ResearchExecutionRuntimePort;
  idFactory: IdFactory;
  clock: Clock;
}

export function createLensJobHandler(dependencies: LensJobDependencies): {
  kind: typeof RESEARCH_LENS_JOB;
  handler: JobHandler;
} {
  return {
    kind: RESEARCH_LENS_JOB,
    handler: (job, control) => handleLensJob(job, control, dependencies),
  };
}

async function handleLensJob(
  job: PersistedJob,
  control: JobHandlerControl,
  dependencies: LensJobDependencies,
): Promise<void> {
  let input: ResearchLensJobInput | undefined;
  try {
    input = inputSchema.parse(job.input);
    const run = dependencies.repository.getRun(input.lensRunId);
    const plan = dependencies.repository.getPlan(input.planId);
    if (!run || !plan || run.planId !== plan.id) throw new Error("LENS_RUN_INPUT_INVALID");
    const ideaVersion = dependencies.ideas.getVersion(plan.key.ideaId, plan.key.ideaVersion);
    if (!ideaVersion) throw new Error("IDEA_VERSION_NOT_FOUND");
    await dependencies.workReuse?.validate(plan, control.signal);
    if (control.isCancelled()) return;
    // A crash after dispatch can have incurred a charge even without a result.
    // Retain the marker and fail visibly; a fresh user-approved plan is required.
    if ((job.checkpoint as { stage?: string } | undefined)?.stage === "call_dispatched") throw new Error("RESEARCH_CALL_INTERRUPTED");
    if (plan.budget.kind !== "calls" || !Number.isInteger(plan.budget.limit) || plan.budget.limit < 1) throw new Error("RESEARCH_BUDGET_INVALID");
    control.commit(() => dependencies.repository.updateRun(run.id, {
      status: "running",
      stage: run.stage,
      now: dependencies.clock.now(),
    }));
    let checkpoint = job.checkpoint
      ? (checkpointSchema.parse(job.checkpoint) as LensExecutionCheckpoint)
      : undefined;
    if (!checkpoint) {
      checkpoint = { stage: "planning_complete" };
      saveStage(control, checkpoint, "planning");
      control.commit(() => dependencies.repository.updateRun(run.id, { stage: "collecting", now: dependencies.clock.now() }));
    }
    if (checkpoint.stage === "planning_complete") {
      beginCall(control, "collecting", 1, plan.budget.limit, checkpoint);
      const evidence = await dependencies.runtime.collect(runtimeInput(plan, ideaVersion, dependencies, control));
      if (control.isCancelled()) return;
      checkpoint = { stage: "collecting_complete", evidence };
      saveStage(control, checkpoint, "collecting");
      control.commit(() => dependencies.repository.updateRun(run.id, { stage: "cross_checking", now: dependencies.clock.now() }));
    }
    if (checkpoint.stage === "collecting_complete") {
      if (plan.budget.limit === 1) {
        const report = createPartialReport({
          plan,
          runId: run.id,
          evidence: checkpoint.evidence,
          dependencies,
        });
        checkpoint = { stage: "ready_to_persist", evidence: checkpoint.evidence, report };
        saveStage(control, checkpoint, "synthesizing");
      } else {
        beginCall(control, "cross_checking", 2, plan.budget.limit, checkpoint);
        let callsUsed = 2;
        const beforeCorrection = plan.budget.limit >= 4 ? async () => {
          if (callsUsed !== 2) throw new Error("RESEARCH_BUDGET_INVALID");
          await dependencies.workReuse?.validate(plan, control.signal);
          beginCall(control, "cross_checking_format_correction", 3, plan.budget.limit, checkpoint!);
          callsUsed = 3;
        } : undefined;
        const claims = await dependencies.runtime.crossCheck({
          ...runtimeInput(plan, ideaVersion, dependencies, control),
          evidence: checkpoint.evidence,
          beforeCorrection,
        });
        if (control.isCancelled()) return;
        await dependencies.workReuse?.validate(plan, control.signal);
        control.commit(() => dependencies.workReuse?.recordConsumed(plan, run.id));
        checkpoint = { stage: "cross_checking_complete", evidence: checkpoint.evidence, claims, callsUsed };
        saveStage(control, checkpoint, "cross_checking");
        control.commit(() => dependencies.repository.updateRun(run.id, {
          stage: "synthesizing",
          now: dependencies.clock.now(),
        }));
      }
    }
    if (checkpoint.stage === "cross_checking_complete") {
      if (plan.budget.limit > 2) beginCall(control, "synthesizing", (checkpoint.callsUsed ?? 2) + 1, plan.budget.limit, checkpoint);
      const report =
        plan.budget.limit === 2
          ? createPartialReport({
              plan,
              runId: run.id,
              evidence: checkpoint.evidence,
              claims: checkpoint.claims,
              dependencies,
            })
          : await dependencies.runtime.synthesize({
              ...runtimeInput(plan, ideaVersion, dependencies, control),
              evidence: checkpoint.evidence,
              claims: checkpoint.claims,
              runId: run.id,
            });
      if (control.isCancelled()) return;
      checkpoint = { stage: "ready_to_persist", evidence: checkpoint.evidence, report };
      saveStage(control, checkpoint, "synthesizing");
    }
    if (checkpoint.stage === "ready_to_persist") {
      if (control.isCancelled()) return;
      await dependencies.workReuse?.validate(plan, control.signal);
      const result = checkpoint;
      control.commit(() => dependencies.repository.saveReport({
        report: lensReportSchema.parse(result.report),
        evidence: result.evidence.map((item) => evidenceSchema.parse(item)),
      }));
      // Repairing missing relations never repeats a model call. The persisted receipt exposes pending links.
      await dependencies.workReuse?.reconcile(plan.id, control.signal).catch(() => undefined);
    }
  } catch (error) {
    if (control.isCancelled()) return;
    const code = error instanceof ZodError ? "RESEARCH_OUTPUT_INVALID" : classifyError(error);
    if (input) {
      const current = dependencies.repository.getRun(input.lensRunId);
      if (current) {
        control.commit(() => dependencies.repository.updateRun(current.id, {
          status: "failed",
          errorCode: code,
          now: dependencies.clock.now(),
        }));
      }
    }
    throw new JobExecutionError(code);
  }
}

function runtimeInput(plan: ResearchPlan, ideaVersion: IdeaVersion, dependencies: LensJobDependencies, control: JobHandlerControl) {
  return { plan, ideaVersion, idFactory: dependencies.idFactory, now: dependencies.clock.now(), signal: control.signal };
}

function beginCall(control: JobHandlerControl, operation: string, callsUsed: number, limit: number, previous: LensExecutionCheckpoint): void {
  control.signal.throwIfAborted();
  if (callsUsed > limit) throw new Error("RESEARCH_BUDGET_INVALID");
  control.saveCheckpoint({ stage: "call_dispatched", operation, callsUsed, previous }, { type: "call_started", payload: { operation, callsUsed, limit } });
}

function saveStage(
  control: JobHandlerControl,
  checkpoint: LensExecutionCheckpoint,
  stage: "planning" | "collecting" | "cross_checking" | "synthesizing",
): void {
  control.saveCheckpoint(checkpoint, { type: "stage_completed", payload: { stage } });
}

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    const hostCode = (error as Error & { code?: unknown }).code;
    if (typeof hostCode === "string" && hostCode.startsWith("REUSE_")) return hostCode;
    if (typeof hostCode === "string" && (hostCode === "RESEARCH_NO_SOURCES" || /^RESEARCH_SEARCH_[A-Z0-9_]{1,80}$/u.test(hostCode))) return hostCode;
    if (["LENS_RUN_INPUT_INVALID", "IDEA_VERSION_NOT_FOUND", "AI_OUTPUT_INVALID", "RESEARCH_CALL_INTERRUPTED", "RESEARCH_NO_SOURCES", "RESEARCH_BUDGET_INVALID", "RUNTIME_MODEL_UNAVAILABLE", "RUNTIME_NOT_CONFIGURED", "RUNTIME_SHUTDOWN"].includes(error.message)) {
      return error.message;
    }
    if (
      [
        "OPENAI_TIMEOUT",
        "OPENAI_NETWORK_FAILED",
        "OPENAI_AUTH_FAILED",
        "OPENAI_RATE_LIMITED",
        "OPENAI_RESEARCH_NO_CITATIONS",
        "REAL_RESEARCH_RUNTIME_DISABLED",
        "OPENAI_SECRET_MISSING",
      ].includes(error.message) ||
      /^OPENAI_HTTP_\d+$/.test(error.message)
    ) {
      return error.message;
    }
  }
  return "RESEARCH_RUNTIME_FAILED";
}

function createPartialReport(input: {
  plan: ResearchPlan;
  runId: string;
  evidence: readonly Evidence[];
  claims?: readonly Claim[];
  dependencies: LensJobDependencies;
}): LensReport {
  const claims = input.claims ?? unknownClaims(input.plan.key.lens, input.dependencies);
  return {
    id: input.dependencies.idFactory.next("lens_report"),
    runId: input.runId,
    revision: 1,
    key: input.plan.key,
    status: "partial",
    runtimeLabel: input.plan.runtimeLabel,
    summary:
      input.plan.budget.limit === 1
        ? `严格调用上限为 1；已收集 ${input.evidence.length} 条可追溯证据，但尚未进行交叉验证。`
        : `严格调用上限为 2；已完成证据交叉验证，但未再调用模型综合最终摘要。`,
    judgments: claims,
    createdAt: input.dependencies.clock.now(),
  };
}

function unknownClaims(lens: LensKind, dependencies: LensJobDependencies): Claim[] {
  const labels =
    lens === "market_space"
      ? ["需求强度", "付出意愿", "竞争压力", "切入缝隙", "触达与时机"]
      : ["MVP 边界", "前后端工作", "模型与数据", "集成与部署", "持续成本", "运维与合规", "最便宜验证"];
  return labels.map((label) => ({
    id: dependencies.idFactory.next("claim"),
    label,
    status: "unknown",
    conclusion: "已有材料尚不足以形成这个维度的交叉验证结论。",
    rationale: "严格调用上限已到，系统没有继续调用模型补齐判断。",
    supportingEvidenceIds: [],
    counterEvidenceIds: [],
    unknowns: ["当前证据之间的支持、冲突与独立性"],
    changeConditions: ["提高本次研究调用上限并重新运行 Lens"],
  }));
}
