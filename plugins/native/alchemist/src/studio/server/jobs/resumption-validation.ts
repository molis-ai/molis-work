import type { SqliteExplorationRepository } from "../db/exploration-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { SqliteJobRunner, PersistedJob } from "./sqlite-job-runner.js";
import { DISCOVERY_BRAINSTORM_JOB } from "../services/create-exploration.js";
import { RESEARCH_LENS_JOB } from "../services/start-lens-run.js";
import { DISCOVERY_PULSE_JOB } from "../services/start-pulse-run.js";
import { validateBrainstormJob } from "./job-handlers.js";
import { validatePulseJob } from "./pulse-job-handler.js";
import { lensInputSchema, readLensProgress, inspectLensProgress } from "./lens-progress.js";

export function validateResumption(job: PersistedJob, d: { jobs: SqliteJobRunner; explorations: SqliteExplorationRepository;
  research: SqliteResearchRepository; pulse: SqlitePulseRepository }, inspectBudget = false) {
  if (job.kind === DISCOVERY_BRAINSTORM_JOB) {
    const input = validateBrainstormJob(job), run = d.explorations.get(input.explorationRunId);
    if (!run || run.directionId !== input.directionId) throw new Error("alchemist.exploration_input_invalid");
  } else if (job.kind === RESEARCH_LENS_JOB) {
    const input = lensInputSchema.parse(job.input), run = d.research.getRun(input.lensRunId), plan = d.research.getPlan(input.planId);
    if (!run || !plan || run.jobId !== job.id || run.planId !== plan.id) throw new Error("alchemist.lens_run_input_invalid");
    const { budget, unknownCall, exhausted } = (inspectBudget ? inspectLensProgress : readLensProgress)(job, plan, d.jobs.listEvents(job.id));
    return { budget, unknownCall, exhausted, modelId: plan.modelId };
  } else if (job.kind === DISCOVERY_PULSE_JOB) {
    const input = validatePulseJob(job), run = d.pulse.getRun(input.pulseRunId);
    if (!run || run.jobId !== job.id) throw new Error("alchemist.pulse_run_input_invalid");
  }
}
