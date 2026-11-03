import type { SqliteExplorationRepository } from "../db/exploration-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { SqliteJobRunner, PersistedJob } from "./sqlite-job-runner.js";
import { DISCOVERY_BRAINSTORM_JOB } from "../services/create-exploration.js";
import { RESEARCH_LENS_JOB } from "../services/start-lens-run.js";
import { DISCOVERY_PULSE_JOB } from "../services/start-pulse-run.js";
import { validateBrainstormJob } from "./job-handlers.js";
import { validatePulseJob } from "./pulse-job-handler.js";
import { lensInputSchema, inspectLensProgress } from "./lens-progress.js";

export function validateResumption(job: PersistedJob, d: { jobs: SqliteJobRunner; explorations: SqliteExplorationRepository;
  research: SqliteResearchRepository; pulse: SqlitePulseRepository }) {
  if (job.kind === DISCOVERY_BRAINSTORM_JOB) {
    const input = validateBrainstormJob(job), run = d.explorations.get(input.explorationRunId);
    if (!run || run.directionId !== input.directionId) throw new Error("alchemist.exploration_input_invalid");
    // The checkpoint is saved just before the model is called, so a run stopped here may have been charged and continuing calls it again.
    if ((job.checkpoint as { stage?: string } | undefined)?.stage === "generating") return { unknownCall: { operation: "generating" as const } };
  } else if (job.kind === RESEARCH_LENS_JOB) {
    const input = lensInputSchema.parse(job.input), run = d.research.runs.getRun(input.lensRunId), plan = d.research.plans.getPlan(input.planId);
    if (!run || !plan || run.jobId !== job.id || run.planId !== plan.id) throw new Error("alchemist.lens_run_input_invalid");
    const { budget, unknownCall, exhausted } = inspectLensProgress(job, plan, d.jobs.listEvents(job.id));
    return { budget, unknownCall, exhausted, modelId: plan.modelId };
  } else if (job.kind === DISCOVERY_PULSE_JOB) {
    const input = validatePulseJob(job), run = d.pulse.runs.getRun(input.pulseRunId);
    if (!run || run.jobId !== job.id) throw new Error("alchemist.pulse_run_input_invalid");
  }
}
