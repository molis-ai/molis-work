// @vitest-environment node

import { describe, expect, it } from "vitest";
import { SqliteDirectionRepository } from "../../src/studio/server/db/direction-repository.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { createJobHandlers } from "../../src/studio/server/jobs/job-handlers.js";
import { LocalWorker } from "../../src/studio/server/jobs/local-worker.js";
import { SqliteJobRunner } from "../../src/studio/server/jobs/sqlite-job-runner.js";
import { FixtureAiRuntimeAdapter } from "../../src/studio/server/runtime/fixture-ai-runtime.js";
import { createExplorationService } from "../../src/studio/server/services/create-exploration.js";
import { createTempDatabase } from "../db/helpers/temp-database.js";

describe("SqliteJobRunner recovery", () => {
  it("requeues an expired job from its checkpoint without duplicating persisted cards", async () => {
    const temp = createTempDatabase();
    const database = openDatabase(temp.path);
    try {
      migrate(database);
      const mutableClock = new MutableClock("2026-07-31T09:00:00.000Z");
      let nextId = 0;
      const idFactory = { next: (prefix: string) => `${prefix}-${++nextId}` };
      seedWorkspace(database, mutableClock.now());
      const directions = new SqliteDirectionRepository(database);
      const direction = directions.create({
        id: "direction-recovery",
        workspaceId: "workspace-local",
        title: "研究复盘助手",
        description: "把访谈材料变成可追踪的产品判断",
        source: { kind: "user_input" },
        status: "active",
        createdAt: mutableClock.now(),
        updatedAt: mutableClock.now(),
      });
      const explorations = new SqliteExplorationRepository(database);
      const firstRunner = new SqliteJobRunner(database, {
        workerId: "worker-before-restart",
        clock: mutableClock,
        idFactory,
        leaseMs: 1_000,
      });
      const createExploration = createExplorationService({
        database,
        directions,
        explorations,
        jobs: firstRunner,
        idFactory,
        clock: mutableClock,
      });
      const receipt = createExploration({ directionId: direction.id });
      const claimed = firstRunner.claimNext();
      expect(claimed?.id).toBe(receipt.jobId);

      const checkpoint = FixtureAiRuntimeAdapter.exampleCheckpoint({
        direction,
        explorationRunId: receipt.runId,
        idFactory,
        now: mutableClock.now(),
      });
      firstRunner.saveCheckpoint(receipt.jobId, checkpoint);
      explorations.saveResult(receipt.runId, checkpoint.understanding, checkpoint.cards);
      expect(explorations.get(receipt.runId)?.cards).toHaveLength(checkpoint.cards.length);

      mutableClock.set("2026-07-31T09:00:02.000Z");
      const restartedRunner = new SqliteJobRunner(database, {
        workerId: "worker-after-restart",
        clock: mutableClock,
        idFactory,
        leaseMs: 1_000,
      });
      expect(restartedRunner.recoverExpired()).toBe(1);
      expect(restartedRunner.get(receipt.jobId)).toMatchObject({
        status: "queued",
        checkpoint,
      });

      const worker = new LocalWorker(
        restartedRunner,
        createJobHandlers({
          explorations,
          runtime: new FixtureAiRuntimeAdapter(),
          idFactory,
          clock: mutableClock,
        }),
      );
      await worker.runNext();
      await worker.runNext();

      expect(restartedRunner.get(receipt.jobId)?.status).toBe("completed");
      expect(explorations.get(receipt.runId)?.cards).toHaveLength(checkpoint.cards.length);
      expect(restartedRunner.listEvents(receipt.jobId).map((event) => event.type)).toEqual([
        "queued",
        "running",
        "checkpoint_saved",
        "interrupted",
        "queued",
        "running",
        "completed",
      ]);
    } finally {
      database.close();
      temp.cleanup();
    }
  });
});

class MutableClock {
  constructor(private value: string) {}
  now() {
    return this.value;
  }
  set(value: string) {
    this.value = value;
  }
}

function seedWorkspace(database: ReturnType<typeof openDatabase>, now: string) {
  database
    .prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
    .run("workspace-local", "本地工作区", now);
  database
    .prepare("INSERT INTO workspace_actors (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("actor-local", "workspace-local", "local_user", "本地创始人", now);
}
