import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqliteDirectionRepository } from "../db/direction-repository.js";
import type { SqliteExplorationRepository } from "../db/exploration-repository.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqliteJobRunner } from "../jobs/sqlite-job-runner.js";

export const DISCOVERY_BRAINSTORM_JOB = "discovery.brainstorm.v1";

export interface DiscoveryBrainstormJobInput {
  explorationRunId: string;
  directionId: string;
  directionTitle: string;
  directionDescription: string;
}

interface CreateExplorationDependencies {
  database: SqliteDatabase;
  directions: SqliteDirectionRepository;
  explorations: SqliteExplorationRepository;
  jobs: SqliteJobRunner;
  idFactory: IdFactory;
  clock: Clock;
}

export interface CreateExploration {
  (input: {
    directionId: string;
    reuseExisting: true;
  }): {
    runId: string;
    jobId?: string;
    reused: boolean;
  };
  (input: {
    directionId: string;
    reuseExisting?: false;
  }): {
    runId: string;
    jobId: string;
    reused?: false;
  };
  (input: {
    directionId: string;
    reuseExisting: boolean;
  }): {
    runId: string;
    jobId?: string;
    reused?: boolean;
  };
}

export function createExplorationService(dependencies: CreateExplorationDependencies): CreateExploration {
  const create = (input: {
    directionId: string;
    reuseExisting?: boolean;
  }): { runId: string; jobId?: string; reused?: boolean } => {
    const direction = dependencies.directions.get(input.directionId);
    if (!direction) throw new Error("DIRECTION_NOT_FOUND");
    if (direction.status === "archived") throw new Error("DIRECTION_ARCHIVED");
    if (input.reuseExisting) {
      const existing = dependencies.explorations.getLatestForDirection(direction.id);
      if (existing && !["failed", "cancelled"].includes(existing.status)) {
        return { runId: existing.id, reused: true };
      }
    }
    const now = dependencies.clock.now();
    return dependencies.database.transaction(() => {
      const runId = dependencies.idFactory.next("exploration");
      dependencies.explorations.create({
        id: runId,
        directionId: direction.id,
        status: "queued",
        runtimeLabel: "Prologue · 等待执行",
        cards: [],
        createdAt: now,
        updatedAt: now,
      });
      const job = dependencies.jobs.enqueue({
        kind: DISCOVERY_BRAINSTORM_JOB,
        payload: {
          explorationRunId: runId,
          directionId: direction.id,
          directionTitle: direction.title,
          directionDescription: direction.description,
        } satisfies DiscoveryBrainstormJobInput,
      });
      return { runId, jobId: job.id };
    })();
  };
  return create as CreateExploration;
}
