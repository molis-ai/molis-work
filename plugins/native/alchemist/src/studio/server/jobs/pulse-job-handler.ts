import { z } from "zod";
import type { PulseReport } from "../../domain/discovery/pulse.js";
import type { PulseSourceId, SourceCollectionResult, SourcePort } from "../../domain/discovery/source.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { PulseSynthesizerPort } from "../runtime/pulse-synthesizer.js";
import { DISCOVERY_PULSE_JOB, type DiscoveryPulseJobInput } from "../services/start-pulse-run.js";
import { JobExecutionError, type JobHandler, type JobHandlerControl } from "./local-worker.js";
import type { PersistedJob } from "./sqlite-job-runner.js";

const inputSchema = z.object({ pulseRunId: z.string().min(1), periodStart: z.string().datetime(), actorId: z.string().min(1).optional() }).strict();

type PulseCheckpoint =
  | { stage: "planning_complete" }
  | { stage: "collecting"; completedSourceIds: PulseSourceId[] }
  | { stage: "collecting_complete" }
  | { stage: "cross_checking_complete"; report: PulseReport; opportunities: unknown[] }
  | { stage: "ready_to_persist"; reportId: string };

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
    let run = dependencies.repository.getRun(input.pulseRunId);
    if (!run || run.jobId !== job.id) throw new Error("PULSE_RUN_INPUT_INVALID");
    control.commit(() => dependencies.repository.updateRun(run!.id, {
      status: "running",
      stage: run!.stage,
      now: dependencies.clock.now(),
    }));
    let checkpoint = parseCheckpoint(job.checkpoint);
    if (!checkpoint) {
      checkpoint = { stage: "planning_complete" };
      saveStage(control, checkpoint, "planning");
      run = control.commit(() => dependencies.repository.updateRun(run!.id, {
        stage: "collecting",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "planning_complete" || checkpoint.stage === "collecting") {
      const collected = new Set(
        dependencies.repository.listSourceCollections(run.id).map((result) => result.sourceId),
      );
      for (const sourceId of run.sourceIds) {
        if (collected.has(sourceId)) continue;
        const source = dependencies.sources.find((candidate) => candidate.sourceId === sourceId);
        const result = source
          ? await collectSafely(source, { since: input.periodStart, limit: 20 })
          : missingAdapter(sourceId, dependencies.clock.now());
        if (control.isCancelled()) return;
        control.commit(() => dependencies.repository.saveSourceCollection(
          run!.id,
          dependencies.idFactory.next("source_fetch"),
          result,
        ));
        collected.add(sourceId);
        checkpoint = { stage: "collecting", completedSourceIds: [...collected] };
        control.saveCheckpoint(checkpoint);
      }
      checkpoint = { stage: "collecting_complete" };
      saveStage(control, checkpoint, "collecting");
      run = control.commit(() => dependencies.repository.updateRun(run!.id, {
        stage: "cross_checking",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "collecting_complete") {
      const collections = dependencies.repository.listSourceCollections(run.id);
      if (!collections.some((collection) => collection.status === "completed")) {
        throw new Error("PULSE_ALL_SOURCES_FAILED");
      }
      const synthesis = await dependencies.synthesizer.synthesize({
        run,
        collections,
        signals: dependencies.repository.listSignals(run.id),
        periodStart: input.periodStart,
        now: dependencies.clock.now(),
        idFactory: dependencies.idFactory,
      });
      if (control.isCancelled()) return;
      checkpoint = {
        stage: "cross_checking_complete",
        report: synthesis.report,
        opportunities: [...synthesis.opportunities],
      };
      saveStage(control, checkpoint, "cross_checking");
      run = control.commit(() => dependencies.repository.updateRun(run!.id, {
        stage: "synthesizing",
        now: dependencies.clock.now(),
      }));
    }
    if (checkpoint.stage === "cross_checking_complete") {
      const result = checkpoint;
      control.commit(() => dependencies.repository.saveReport({
        report: result.report,
        opportunities: result.opportunities as Parameters<
          SqlitePulseRepository["saveReport"]
        >[0]["opportunities"],
      }));
      checkpoint = { stage: "ready_to_persist", reportId: checkpoint.report.id };
      saveStage(control, checkpoint, "synthesizing");
    }
    if (checkpoint.stage === "ready_to_persist") {
      const report = dependencies.repository.getReport(checkpoint.reportId);
      if (!report) throw new Error("PULSE_REPORT_NOT_FOUND");
      control.commit(() => dependencies.repository.updateRun(run!.id, {
        status: report.status,
        stage: "synthesizing",
        now: dependencies.clock.now(),
      }));
    }
  } catch (error) {
    if (control.isCancelled()) return;
    const code = classifyError(error);
    if (input) {
      const run = dependencies.repository.getRun(input.pulseRunId);
      if (run) {
        control.commit(() => dependencies.repository.updateRun(run.id, {
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
): Promise<SourceCollectionResult> {
  try {
    return await source.collect(query);
  } catch {
    return missingAdapter(source.sourceId, new Date().toISOString(), "SOURCE_ADAPTER_FAILED");
  }
}

function missingAdapter(
  sourceId: PulseSourceId,
  now: string,
  errorCode = "SOURCE_ADAPTER_MISSING",
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
  if (!value || typeof value !== "object" || !("stage" in value)) return undefined;
  const stage = (value as { stage?: unknown }).stage;
  if (
    stage === "planning_complete" ||
    stage === "collecting" ||
    stage === "collecting_complete" ||
    stage === "cross_checking_complete" ||
    stage === "ready_to_persist"
  ) {
    return value as PulseCheckpoint;
  }
  throw new Error("PULSE_CHECKPOINT_INVALID");
}

function saveStage(
  control: JobHandlerControl,
  checkpoint: PulseCheckpoint,
  stage: "planning" | "collecting" | "cross_checking" | "synthesizing",
): void {
  control.saveCheckpoint(checkpoint, { type: "stage_completed", payload: { stage } });
}

function classifyError(error: unknown): string {
  if (error instanceof Error && error.message.startsWith("PULSE_")) return error.message;
  return "PULSE_RUNTIME_FAILED";
}
