import { z } from "zod";
import { pulseReport, opportunity } from "../../shared/contracts/actions.js";
import { pulseSourceIds } from "../../domain/discovery/source.js";
import type { PulseSourceId, SourceCollectionResult, SourcePort } from "../../domain/discovery/source.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { PulseSynthesizerPort } from "../runtime/pulse-synthesizer.js";
import { DISCOVERY_PULSE_JOB, type DiscoveryPulseJobInput } from "../services/start-pulse-run.js";
import { JobExecutionError, type JobHandler, type JobHandlerControl } from "./local-worker.js";
import type { PersistedJob } from "./sqlite-job-runner.js";

const inputSchema = z.object({ pulseRunId: z.string().min(1), periodStart: z.string().datetime(), actorId: z.string().min(1).optional() }).strict();

const checkpointSchema = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("planning_complete") }).strict(),
  z.object({ stage: z.literal("collecting"), completedSourceIds: z.array(z.enum(pulseSourceIds)) }).strict(),
  z.object({ stage: z.literal("collecting_complete") }).strict(),
  z.object({ stage: z.literal("cross_checking_complete"), report: pulseReport, opportunities: z.array(opportunity) }).strict(),
  z.object({ stage: z.literal("ready_to_persist"), reportId: z.string().min(1) }).strict(),
]);
type PulseCheckpoint = z.infer<typeof checkpointSchema>;
export function validatePulseJob(job: PersistedJob) {
  const input = inputSchema.parse(job.input);
  parseCheckpoint(job.checkpoint);
  return input;
}

export interface PulseJobDependencies {
  repository: SqlitePulseRepository;
  sources: readonly SourcePort[];
  synthesizer: PulseSynthesizerPort;
  idFactory: IdFactory;
  clock: Clock;
}

export function createPulseJobHandler(dependencies: PulseJobDependencies): {
  kind: typeof DISCOVERY_PULSE_JOB;
  handler: JobHandler;
} {
  return {
    kind: DISCOVERY_PULSE_JOB,
    handler: (job, control) => handlePulseJob(job, control, dependencies),
  };
}

async function handlePulseJob(
  job: PersistedJob,
  control: JobHandlerControl,
  dependencies: PulseJobDependencies,
): Promise<void> {
  let input: DiscoveryPulseJobInput | undefined;
  try {
    input = inputSchema.parse(job.input);
    let run = dependencies.repository.runs.getRun(input.pulseRunId);
    if (!run || run.jobId !== job.id) throw new Error("alchemist.pulse_run_input_invalid");
    await control.commit(() => dependencies.repository.runs.updateRun(run!.id, {
      status: "running",
      stage: run!.stage,
      now: dependencies.clock.now(),
    }));
    let checkpoint = parseCheckpoint(job.checkpoint);
    if (!checkpoint) {
      checkpoint = { stage: "planning_complete" };
      await saveStage(control, checkpoint, "planning");
      run = await control.commit(() => dependencies.repository.runs.updateRun(run!.id, {
        stage: "collecting",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "planning_complete" || checkpoint.stage === "collecting") {
      const collected = new Set(
        dependencies.repository.sources.listSourceCollections(run.id).map((result) => result.sourceId),
      );
      for (const sourceId of run.sourceIds) {
        if (collected.has(sourceId)) continue;
        const source = dependencies.sources.find((candidate) => candidate.sourceId === sourceId);
        await control.beforeEffect();
        const result = source
          ? await collectSafely(source, { since: input.periodStart, limit: 20 }, control.signal)
          : missingAdapter(sourceId, dependencies.clock.now());
        if (control.isCancelled()) return;
        await control.commit(() => dependencies.repository.sources.saveSourceCollection(
          run!.id,
          dependencies.idFactory.next("source_fetch"),
          result,
        ));
        collected.add(sourceId);
        checkpoint = { stage: "collecting", completedSourceIds: [...collected] };
        await control.saveCheckpoint(checkpoint);
      }
      checkpoint = { stage: "collecting_complete" };
      await saveStage(control, checkpoint, "collecting");
      run = await control.commit(() => dependencies.repository.runs.updateRun(run!.id, {
        stage: "cross_checking",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "collecting_complete") {
      const collections = dependencies.repository.sources.listSourceCollections(run.id);
      if (!collections.some((collection) => collection.status === "completed")) {
        throw new Error("alchemist.pulse_all_sources_failed");
      }
      const synthesis = await dependencies.synthesizer.synthesize({
        run,
        collections,
        signals: dependencies.repository.sources.listSignals(run.id),
        periodStart: input.periodStart,
        now: dependencies.clock.now(),
        idFactory: dependencies.idFactory,
      });
      if (control.isCancelled()) return;
      checkpoint = {
        stage: "cross_checking_complete",
        report: pulseReport.parse(synthesis.report),
        opportunities: synthesis.opportunities.map(value => opportunity.parse(value)),
      };
      await saveStage(control, checkpoint, "cross_checking");
      run = await control.commit(() => dependencies.repository.runs.updateRun(run!.id, {
        stage: "synthesizing",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "cross_checking_complete") {
      const result = checkpoint;
      await control.commit(() => dependencies.repository.reports.saveReport({
        report: result.report,
        opportunities: result.opportunities as Parameters<
          SqlitePulseRepository["reports"]["saveReport"]
        >[0]["opportunities"],
      }));
      checkpoint = { stage: "ready_to_persist", reportId: checkpoint.report.id };
      await saveStage(control, checkpoint, "synthesizing");
    }
    if (checkpoint.stage === "ready_to_persist") {
      const report = dependencies.repository.reports.getReport(checkpoint.reportId);
      if (!report) throw new Error("alchemist.pulse_report_not_found");
      await control.commit(() => dependencies.repository.runs.updateRun(run!.id, {
        status: report.status,
        stage: "synthesizing",
        now: dependencies.clock.now(),
      }));
    }
  } catch (error) {
    if (control.isCancelled()) return;
    const code = classifyError(error);
    if (input) {
      const run = dependencies.repository.runs.getRun(input.pulseRunId);
      if (run) {
        await control.commit(() => dependencies.repository.runs.updateRun(run.id, {
          status: "failed",
          errorCode: code,
          now: dependencies.clock.now(),
        }));
      }
    }
    throw new JobExecutionError(code);
  }
}

async function collectSafely(
  source: SourcePort,
  query: { since: string; limit: number },
  signal: AbortSignal,
): Promise<SourceCollectionResult> {
  try {
    return await source.collect(query, signal);
  } catch {
    return missingAdapter(source.sourceId, new Date().toISOString(), "alchemist.source_adapter_failed");
  }
}

function missingAdapter(
  sourceId: PulseSourceId,
  now: string,
  errorCode = "alchemist.source_adapter_missing",
): SourceCollectionResult {
  return {
    sourceId,
    status: "error",
    requestUrl: `source://${sourceId}`,
    fetchedAt: now,
    errorCode,
    signals: [],
  };
}

function parseCheckpoint(value: unknown): PulseCheckpoint | undefined {
  return value === undefined ? undefined : checkpointSchema.parse(value);
}

async function saveStage(
  control: JobHandlerControl,
  checkpoint: PulseCheckpoint,
  stage: "planning" | "collecting" | "cross_checking" | "synthesizing",
): Promise<void> {
  await control.saveCheckpoint(checkpoint, { type: "stage_completed", payload: { stage } });
}

function classifyError(error: unknown): string {
  if (error instanceof Error && (error.message.startsWith("alchemist.pulse_") || error.message === "alchemist.pulse_report_not_found" || error.message === "alchemist.pulse_no_enabled_sources")) return error.message;
  return "alchemist.pulse_runtime_failed";
}
