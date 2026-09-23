// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import type { Direction } from "../../src/studio/domain/discovery/direction.js";
import type { DirectionUnderstanding, ExplorationRun } from "../../src/studio/domain/discovery/exploration.js";
import type { IdeaCard } from "../../src/studio/domain/discovery/idea-card.js";
import { SqliteDirectionRepository } from "../../src/studio/server/db/direction-repository.js";
import { SqliteExplorationRepository } from "../../src/studio/server/db/exploration-repository.js";
import { SqliteIdeaRepository } from "../../src/studio/server/db/idea-repository.js";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
  database = undefined;
  temporary = undefined;
});

describe("SQLite Idea repository", () => {
  it("preserves Idea v1 and exact card provenance after process restart", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);
    migrate(database);
    seedLocalIdentity(database);

    const directions = new SqliteDirectionRepository(database);
    const explorations = new SqliteExplorationRepository(database);
    const ideas = new SqliteIdeaRepository(database);
    directions.create(directionFixture());
    explorations.create(explorationFixture());
    explorations.saveResult("exploration_01", understandingFixture(), [cardFixture()]);

    const kept = ideas.keepCard({
      cardId: "card_assumption_killer",
      ideaId: "idea_assumption_killer",
      ideaVersionId: "idea_version_assumption_killer_1",
      actorId: "actor_local",
      now: "2026-07-31T00:02:00.000Z",
    });
    expect(kept.version.sourceCardId).toBe("card_assumption_killer");

    database.close();
    database = openDatabase(temporary.path);
    migrate(database);

    const restored = new SqliteIdeaRepository(database).getVersion("idea_assumption_killer", 1);
    expect(restored).toMatchObject({
      id: "idea_version_assumption_killer_1",
      sourceCardId: "card_assumption_killer",
      sourceExplorationRunId: "exploration_01",
      revision: { version: 1, actorId: "actor_local" },
    });
  });

  it("keeps a card atomically and rejects a duplicate Idea", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);
    migrate(database);
    seedLocalIdentity(database);

    new SqliteDirectionRepository(database).create(directionFixture());
    const explorations = new SqliteExplorationRepository(database);
    explorations.create(explorationFixture());
    explorations.saveResult("exploration_01", understandingFixture(), [cardFixture()]);
    const ideas = new SqliteIdeaRepository(database);
    const input = {
      cardId: "card_assumption_killer",
      ideaId: "idea_assumption_killer",
      ideaVersionId: "idea_version_assumption_killer_1",
      actorId: "actor_local",
      now: "2026-07-31T00:02:00.000Z",
    };

    ideas.keepCard(input);

    expect(() => ideas.keepCard(input)).toThrowError("IDEA_CARD_NOT_CANDIDATE");
    expect(database.prepare("SELECT COUNT(*) AS count FROM ideas").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM idea_versions").get()).toEqual({ count: 1 });
  });
});

function seedLocalIdentity(db: SqliteDatabase): void {
  db.prepare("INSERT INTO workspaces (id, name, created_at) VALUES (?, ?, ?)").run(
    "workspace_local",
    "本地 Workspace",
    "2026-07-31T00:00:00.000Z",
  );
  db.prepare(
    "INSERT INTO workspace_actors (id, workspace_id, kind, name, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("actor_local", "workspace_local", "local_user", "本地创始人", "2026-07-31T00:00:00.000Z");
}

function directionFixture(): Direction {
  return {
    id: "direction_01",
    workspaceId: "workspace_local",
    title: "更便宜地验证 AI Idea",
    description: "帮助独立开发者更便宜地验证 AI Idea",
    source: { kind: "user_input" },
    status: "active",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  };
}

function explorationFixture(): ExplorationRun {
  return {
    id: "exploration_01",
    directionId: "direction_01",
    status: "queued",
    runtimeLabel: "演示运行时",
    cards: [],
    createdAt: "2026-07-31T00:00:30.000Z",
    updatedAt: "2026-07-31T00:00:30.000Z",
  };
}

function understandingFixture(): DirectionUnderstanding {
  return {
    summary: "为独立开发者降低早期 AI 产品方向的验证成本",
    assumptions: ["用户愿意先验证再开发"],
    unknowns: ["最危险的假设是什么"],
    concreteness: "direction",
  };
}

function cardFixture(): IdeaCard {
  return {
    id: "card_assumption_killer",
    explorationRunId: "exploration_01",
    directionId: "direction_01",
    status: "candidate",
    title: "先找到最便宜的反证实验",
    highlight: "先用最小代价找出最可能推翻想法的事实。",
    targetUser: "还没有决定投入方向的独立创始人",
    scenario: "创始人准备验证一个仍有关键未知的产品方向",
    problem: "团队常把验证等同于尽快造出 MVP",
    mechanism: "把核心假设排成成本递增的反证实验",
    valueProposition: "在投入开发前先暴露最危险的错误假设",
    whyItMayWork: "验证成本与决策影响被放在同一张卡里",
    assumptions: ["用户愿意在开发前验证"],
    unknowns: ["建议能否足够具体", "用户是否愿意记录反证"],
    mvp: {
      inScope: ["假设清单", "三档反证实验"],
      outOfScope: ["自动投放", "替用户做决定"],
    },
    createdAt: "2026-07-31T00:01:00.000Z",
  };
}
