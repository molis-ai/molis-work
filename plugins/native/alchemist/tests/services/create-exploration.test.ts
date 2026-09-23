// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
  AiRuntimePort,
  GenerationResult,
  StructuredGenerationRequest,
} from "../../src/studio/domain/kernel/ports.js";
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

describe("createExplorationService", () => {
  it("reuses the latest viable run when a Direction is resumed from another surface", () => {
    const fixture = createFixture();
    try {
      const first = fixture.createExploration({ directionId: fixture.direction.id });
      const resumed = fixture.createExploration({
        directionId: fixture.direction.id,
        reuseExisting: true,
      });

      expect(resumed).toEqual({ runId: first.runId, reused: true });
      expect(fixture.explorations.list()).toHaveLength(1);
    } finally {
      fixture.close();
    }
  });

  it("persists understanding and only valuable schema-valid cards", async () => {
    const fixture = createFixture();
    try {
      const result = fixture.createExploration({ directionId: fixture.direction.id });

      await fixture.worker.runNext();

      const run = fixture.explorations.get(result.runId);
      expect(run?.status).toBe("completed");
      expect(run?.runtimeLabel).toBe("演示运行时");
      expect(run?.understanding?.summary).toContain("AI 产品");
      expect(run?.cards.length).toBeGreaterThan(0);
      expect(
        run?.cards.every(
          (card) =>
            card.targetUser.length > 0 &&
            card.problem.length > 0 &&
            card.mechanism.length > 0 &&
            card.valueProposition.length > 0,
        ),
      ).toBe(true);
      expect(fixture.jobs.get(result.jobId)?.status).toBe("completed");
    } finally {
      fixture.close();
    }
  });

  it("fails without persisting cards when the runtime violates the structured contract", async () => {
    const invalidRuntime: AiRuntimePort = {
      async listModels() {
        return [];
      },
      async generateStructured<Result>(
        input: StructuredGenerationRequest<Result>,
      ): Promise<GenerationResult<Result>> {
        return {
          operationId: input.operationId,
          runtimeLabel: "损坏的测试运行时",
          value: { cards: [{ title: "缺少必要字段" }] } as Result,
        };
      },
    };
    const fixture = createFixture(invalidRuntime);
    try {
      const result = fixture.createExploration({ directionId: fixture.direction.id });

      await fixture.worker.runNext();

      expect(fixture.explorations.get(result.runId)).toMatchObject({
        status: "failed",
        errorCode: "AI_OUTPUT_INVALID",
        cards: [],
      });
      expect(fixture.jobs.get(result.jobId)).toMatchObject({
        status: "failed",
        errorCode: "AI_OUTPUT_INVALID",
      });
    } finally {
      fixture.close();
    }
  });
});

function createFixture(runtime: AiRuntimePort = new FixtureAiRuntimeAdapter()) {
  const temp = createTempDatabase();
  const database = openDatabase(temp.path);
  migrate(database);
  const now = "2026-07-31T09:00:00.000Z";
  database
    .prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)")
    .run("workspace-local", "本地工作区", now);
  database
    .prepare("INSERT INTO workspace_actors (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run("actor-local", "workspace-local", "local_user", "本地创始人", now);

  const directions = new SqliteDirectionRepository(database);
  const direction = directions.create({
    id: "direction-1",
    workspaceId: "workspace-local",
    title: "AI 产品验证",
    description: "帮助独立开发者在投入开发前验证 AI 产品方向",
    source: { kind: "user_input" },
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const explorations = new SqliteExplorationRepository(database);
  let nextId = 0;
  const idFactory = { next: (prefix: string) => `${prefix}-${++nextId}` };
  const clock = { now: () => now };
  const jobs = new SqliteJobRunner(database, { workerId: "worker-1", clock, idFactory });
  const worker = new LocalWorker(jobs, createJobHandlers({ explorations, runtime, idFactory, clock }));
  const createExploration = createExplorationService({
    database,
    directions,
    explorations,
    jobs,
    idFactory,
    clock,
  });

  return {
    database,
    direction,
    explorations,
    jobs,
    worker,
    createExploration,
    close() {
      database.close();
      temp.cleanup();
    },
  };
}
