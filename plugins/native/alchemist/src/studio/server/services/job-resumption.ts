import type { RetainedActionAuthority } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TasteRule } from "../../domain/memory/rules.js";
import type { JobAcceptance, LocalWorker } from "../jobs/local-worker.js";
import type { validateResumption } from "../jobs/resumption-validation.js";
import type { PersistedJob, SqliteJobRunner } from "../jobs/sqlite-job-runner.js";
import type { RuntimeSelector } from "../runtime/runtime-selector.js";
import type { AlchemistEffectControl } from "./action-operations.js";
import { DISCOVERY_BRAINSTORM_JOB } from "./create-exploration.js";
import { RESEARCH_LENS_JOB } from "./start-lens-run.js";
import { DISCOVERY_PULSE_JOB } from "./start-pulse-run.js";

export interface ResumeView {
  jobId: string;
  kind: string;
  status: string;
  canContinue: boolean;
  reason?: string;
  leaseExpiresAt?: string;
  modelId?: string;
  tasteTitles?: string[];
  confirmation?: string;
  budget?: { limit: number; reserved: number; remaining: number };
  unknownCall?: { operation: "collecting" | "cross_checking" | "cross_checking_format_correction" | "synthesizing" };
}
interface Dependencies {
  jobs: SqliteJobRunner;
  worker: LocalWorker;
  runtime: RuntimeSelector;
  actorId(): string;
  taste(): readonly TasteRule[];
  now(): string;
  validate(job: PersistedJob, inspectBudget?: boolean): ReturnType<typeof validateResumption>;
  initialize(): void;
}

export class JobResumption {
  constructor(private readonly d: Dependencies) {}

  isAccepted(jobId: string): boolean { return this.d.worker.isAccepted(jobId); }

  async view(jobId: string): Promise<ResumeView> {
    const job = this.require(jobId);
    const result: ResumeView = { jobId, kind: job.kind, status: job.status, canContinue: false };
    try {
      const { exhausted, ...details } = this.validate(job, true) ?? {};
      Object.assign(result, details);
      if (exhausted) return { ...result, reason: "alchemist.research_budget_exhausted" };
    }
    catch (error) { return { ...result, reason: error instanceof Error ? error.message : "alchemist.job_not_resumable", leaseExpiresAt: job.leaseExpiresAt }; }
    if (!needsExplorationModel(job)) return { ...result, canContinue: true };
    try {
      const snapshot = await this.explorationSnapshot();
      return { ...result, canContinue: true, modelId: snapshot.modelId,
        tasteTitles: snapshot.taste.map(rule => rule.title), confirmation: snapshot.confirmation };
    } catch (error) { return { ...result, reason: error instanceof Error ? error.message : "alchemist.runtime_model_unavailable" }; }
  }

  async prepareStart(kind: string, control?: AlchemistEffectControl): Promise<JobAcceptance> {
    const authority = retain(control, kind);
    const actorId = this.d.actorId();
    let exploration: JobAcceptance["exploration"];
    if (kind === DISCOVERY_BRAINSTORM_JOB) {
      try { exploration = await this.explorationSnapshot(); }
      catch (error) {
        if (!(error instanceof Error) || !["alchemist.runtime_model_unavailable", "alchemist.runtime_not_configured"].includes(error.message)) throw error;
        exploration = { modelId: "", taste: structuredClone(this.d.taste()), errorCode: error.message };
      }
    }
    await control!.beforeEffect(); authority.assertCurrent();
    return { authority, actorId, exploration };
  }

  accept(jobId: string, acceptance: JobAcceptance): void { this.d.worker.accept(jobId, acceptance); }

  async continue(jobId: string, confirmation: string | undefined, control?: AlchemistEffectControl): Promise<{ jobId: string; accepted: boolean }> {
    const job = this.require(jobId);
    this.validate(job);
    const authority = retain(control, job.kind), actorId = this.d.actorId();
    const acceptance: JobAcceptance = { authority, actorId, validate: () => this.validate(this.require(jobId)) };
    if (!this.d.worker.accept(jobId, acceptance, false)) return { jobId, accepted: false };
    try {
      if (needsExplorationModel(job)) {
        const snapshot = await this.explorationSnapshot();
        if (snapshot.confirmation !== confirmation) throw new Error("alchemist.resume_context_changed");
        acceptance.exploration = snapshot;
      }
      await control!.beforeEffect(); authority.assertCurrent();
      this.validate(this.require(jobId));
      this.d.initialize();
      this.d.worker.activate(jobId);
      return { jobId, accepted: true };
    } catch (error) { this.d.worker.cancel(jobId); throw error; }
  }

  private require(jobId: string): PersistedJob {
    const job = this.d.jobs.get(jobId);
    if (!job) throw new Error("alchemist.job_not_found");
    return job;
  }
  private validate(job: PersistedJob, inspectBudget = false) {
    if (![DISCOVERY_BRAINSTORM_JOB, RESEARCH_LENS_JOB, DISCOVERY_PULSE_JOB].includes(job.kind)) throw new Error("alchemist.job_kind_unsupported");
    if (!["queued", "running", "interrupted", "failed"].includes(job.status)) throw new Error("alchemist.job_not_resumable");
    if (job.status === "running" && (!job.leaseExpiresAt || job.leaseExpiresAt > this.d.now())) throw new Error("alchemist.job_lease_active");
    if (job.status === "failed" && !["alchemist.ai_call_interrupted", "alchemist.research_call_interrupted", "alchemist.runtime_shutdown", "alchemist.job_execution_failed", "alchemist.research_budget_exhausted"].includes(job.errorCode ?? "")) throw new Error("alchemist.job_not_resumable");
    return this.d.validate(job, inspectBudget);
  }
  private async explorationSnapshot() {
    const taste = structuredClone(this.d.taste());
    const tasteIdentity = JSON.stringify(taste);
    const selected = await this.d.runtime.captureSelection();
    if (tasteIdentity !== JSON.stringify(this.d.taste())) throw new Error("alchemist.resume_context_changed");
    return { modelId: selected.modelId, taste,
      confirmation: JSON.stringify([selected.modelId, selected.identity, taste.map(rule => [rule.id, rule.version, rule.updatedAt])]) };
  }
}

function retain(control: AlchemistEffectControl | undefined, kind: string): RetainedActionAuthority {
  if (!control?.retainBackgroundAuthority) throw new Error("alchemist.background_authority_required");
  control.assert_authority_current?.();
  return control.retainBackgroundAuthority([kind === DISCOVERY_PULSE_JOB ? "alchemist:collect" : "alchemist:generate"]);
}
function needsExplorationModel(job: PersistedJob): boolean {
  return job.kind === DISCOVERY_BRAINSTORM_JOB && (job.checkpoint as { stage?: string } | undefined)?.stage !== "ready_to_persist";
}
