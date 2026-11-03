import { ZodError } from "zod";
import type { IdeaVersion } from "../../domain/ideas/idea.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { LensKind, ResearchPlan } from "../../domain/research/lens.js";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";
import { evidenceSchema, lensReportSchema } from "../../shared/contracts/research.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type {
  LensExecutionCheckpoint,
  ResearchExecutionRuntimePort,
} from "../runtime/research-runtime-port.js";
import { RESEARCH_LENS_JOB, type ResearchLensJobInput } from "../services/start-lens-run.js";
import { JobExecutionError, type JobHandler, type JobHandlerControl } from "./local-worker.js";
import type { PersistedJob } from "./sqlite-job-runner.js";

import { lensInputSchema, readLensProgress } from "./lens-progress.js";

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
    input = lensInputSchema.parse(job.input);
    const run = dependencies.repository.runs.getRun(input.lensRunId);
    const plan = dependencies.repository.plans.getPlan(input.planId);
    if (!run || !plan || run.planId !== plan.id) throw new Error("alchemist.lens_run_input_invalid");
    const ideaVersion = dependencies.ideas.getVersion(plan.key.ideaId, plan.key.ideaVersion);
    if (!ideaVersion) throw new Error("alchemist.idea_version_not_found");
    await dependencies.workReuse?.validate(plan, control.signal);
    if (control.isCancelled()) return;
    const progress = readLensProgress(job, plan, control.events());
    let callsUsed = progress.callsUsed;
    let checkpoint = progress.checkpoint;
    await control.commit(() => dependencies.repository.runs.updateRun(run.id, {
      status: "running", stage: run.stage, now: dependencies.clock.now(),
    }));
    if (!checkpoint) {
      checkpoint = { stage: "planning_complete" };
      await saveStage(control, checkpoint, "planning");
      await control.commit(() => dependencies.repository.runs.updateRun(run.id, { stage: "collecting", now: dependencies.clock.now() }));
    }
    if (checkpoint.stage === "planning_complete") {
      await beginCall(control, "collecting", ++callsUsed, plan.budget.limit, checkpoint);
      const evidence = await dependencies.runtime.collect(runtimeInput(plan, ideaVersion, dependencies, control));
      if (control.isCancelled()) return;
      checkpoint = { stage: "collecting_complete", evidence };
      await saveStage(control, checkpoint, "collecting");
      await control.commit(() => dependencies.repository.runs.updateRun(run.id, { stage: "cross_checking", now: dependencies.clock.now() }));
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
        await saveStage(control, checkpoint, "synthesizing");
      } else {
        await beginCall(control, "cross_checking", ++callsUsed, plan.budget.limit, checkpoint);
        let corrected = false;
        const beforeCorrection = plan.budget.limit - callsUsed >= 2 ? async () => {
          if (corrected) throw new Error("alchemist.research_budget_invalid");
          corrected = true;
          await dependencies.workReuse?.validate(plan, control.signal);
          await beginCall(control, "cross_checking_format_correction", ++callsUsed, plan.budget.limit, checkpoint!);
        } : undefined;
        const claims = await dependencies.runtime.crossCheck({
          ...runtimeInput(plan, ideaVersion, dependencies, control),
          evidence: checkpoint.evidence,
          beforeCorrection,
        });
        if (control.isCancelled()) return;
        await dependencies.workReuse?.validate(plan, control.signal);
        await control.commit(() => dependencies.workReuse?.recordConsumed(plan, run.id));
        checkpoint = { stage: "cross_checking_complete", evidence: checkpoint.evidence, claims };
        await saveStage(control, checkpoint, "cross_checking");
        await control.commit(() => dependencies.repository.runs.updateRun(run.id, {
          stage: "synthesizing",
          now: dependencies.clock.now(),
        }));
      }
    }
    if (checkpoint.stage === "cross_checking_complete") {
      if (plan.budget.limit > 2) await beginCall(control, "synthesizing", ++callsUsed, plan.budget.limit, checkpoint);
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
      await saveStage(control, checkpoint, "synthesizing");
    }
    if (checkpoint.stage === "ready_to_persist") {
      if (control.isCancelled()) return;
      await dependencies.workReuse?.validate(plan, control.signal);
      const result = checkpoint;
      await control.commit(() => dependencies.repository.reports.saveReport({
        report: lensReportSchema.parse(result.report),
        evidence: result.evidence.map((item) => evidenceSchema.parse(item)),
      }));
      // Repairing missing relations never repeats a model call. The persisted receipt exposes pending links.
      await dependencies.workReuse?.reconcile(plan.id, control.signal, { beforeEffect: control.beforeEffect,
        assert_authority_current: control.assertCurrent, commit: control.commit }).catch(error => {
          if (control.isCancelled()) throw error;
          // An unavailable optional relation stays pending; the saved report remains valid.
        });
    }
  } catch (error) {
    if (control.isCancelled()) return;
    const code = error instanceof ZodError ? "alchemist.research_output_invalid" : classifyError(error);
    if (input) {
      const current = dependencies.repository.runs.getRun(input.lensRunId);
      if (current) {
        await control.commit(() => dependencies.repository.runs.updateRun(current.id, {
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
  return { plan, ideaVersion, idFactory: dependencies.idFactory, now: dependencies.clock.now(), signal: control.signal, beforeModelDispatch: control.beforeEffect, assertCurrent: control.assertCurrent };
}

async function beginCall(control: JobHandlerControl, operation: string, callsUsed: number, limit: number, previous: LensExecutionCheckpoint): Promise<void> {
  await control.beforeEffect();
  if (callsUsed > limit) throw new Error("alchemist.research_budget_exhausted");
  await control.saveCheckpoint({ stage: "call_dispatched", operation, callsUsed, previous }, { type: "call_started", payload: { operation, callsUsed, limit } });
}

async function saveStage(
  control: JobHandlerControl,
  checkpoint: LensExecutionCheckpoint,
  stage: "planning" | "collecting" | "cross_checking" | "synthesizing",
): Promise<void> {
  await control.saveCheckpoint(checkpoint, { type: "stage_completed", payload: { stage } });
}

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    const hostCode = (error as Error & { code?: unknown }).code;
    // The Host port refuses a prompt over its data position with this code; keep that reason apart from a generic runtime failure so the
    // page can say the material is too long (the character excess itself stays at the port for now; carrying it to the page needs a
    // dedicated error-detail field, a separate change).
    if (hostCode === "alchemist.prompt_too_long") return "alchemist.prompt_too_long";
    if (typeof hostCode === "string" && hostCode.startsWith("alchemist.reuse_")) return hostCode;
    if (typeof hostCode === "string" && (hostCode === "alchemist.research_no_sources" || /^alchemist\.research_search_[a-z0-9_]{1,80}$/u.test(hostCode))) return hostCode;
    if (["alchemist.lens_run_input_invalid", "alchemist.idea_version_not_found", "alchemist.ai_output_invalid", "alchemist.research_call_interrupted", "alchemist.research_no_sources", "alchemist.research_budget_invalid", "alchemist.research_budget_exhausted", "alchemist.research_budget_history_invalid", "alchemist.runtime_model_unavailable", "alchemist.runtime_not_configured", "alchemist.runtime_shutdown"].includes(error.message)) {
      return error.message;
    }
  }
  return "alchemist.research_runtime_failed";
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
