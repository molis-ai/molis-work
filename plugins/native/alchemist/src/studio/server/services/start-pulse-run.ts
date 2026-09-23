import type { PulseRun } from "../../domain/discovery/pulse.js";
import type { PulseSourceId } from "../../domain/discovery/source.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";

export const DISCOVERY_PULSE_JOB = "discovery.pulse.v1";

export interface DiscoveryPulseJobInput {
  pulseRunId: string;
  periodStart: string;
}

export class StartPulseRunError extends Error {
  readonly name = "StartPulseRunError";
}

interface Dependencies {
  database: SqliteDatabase;
  pulse: SqlitePulseRepository;
  jobs: SqliteJobRunner;
  idFactory: IdFactory;
  clock: Clock;
  workspaceId: string;
}

export function createStartPulseRunService(dependencies: Dependencies) {
  return (input: { sourceIds?: readonly PulseSourceId[] } = {}): PulseRun => {
    const enabledSourceIds = dependencies.pulse
      .listSourceSettings()
      .filter((setting) => setting.enabled)
      .map((setting) => setting.sourceId);
    const sourceIds = input.sourceIds
      ? input.sourceIds.filter((sourceId) => enabledSourceIds.includes(sourceId))
      : enabledSourceIds;
    if (sourceIds.length === 0) throw new StartPulseRunError("PULSE_NO_ENABLED_SOURCES");
    const now = dependencies.clock.now();
    const periodStart = new Date(Date.parse(now) - 7 * 24 * 60 * 60 * 1_000).toISOString();
    return dependencies.database.transaction(() => {
      const pulseRunId = dependencies.idFactory.next("pulse_run");
      const job = dependencies.jobs.enqueue({
        kind: DISCOVERY_PULSE_JOB,
        payload: { pulseRunId, periodStart } satisfies DiscoveryPulseJobInput,
      });
      return dependencies.pulse.createRun({
        id: pulseRunId,
        workspaceId: dependencies.workspaceId,
        status: "queued",
        stage: "planning",
        sourceIds,
        runtimeLabel: "真实公开来源 · 规则综合",
        jobId: job.id,
        now,
      });
    })();
  };
}

export type StartPulseRun = ReturnType<typeof createStartPulseRunService>;
