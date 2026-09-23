import type { DirectionUnderstanding, ExplorationRun } from "../../domain/discovery/exploration.js";
import type { IdeaCard } from "../../domain/discovery/idea-card.js";
import type { RunStatus } from "../../domain/kernel/run.js";
import type { SqliteDatabase } from "./open-database.js";

interface ExplorationRow {
  id: string;
  direction_id: string;
  status: RunStatus;
  runtime_label: string;
  understanding_json: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface IdeaCardRow {
  id: string;
  exploration_run_id: string;
  direction_id: string;
  status: IdeaCard["status"];
  title: string;
  highlight: string;
  target_user: string;
  scenario: string;
  problem: string;
  mechanism: string;
  value_proposition: string;
  why_it_may_work: string;
  assumptions_json: string;
  position: number;
  unknowns_json: string;
  mvp_json: string;
  discarded_at: string | null;
  kept_at: string | null;
  kept_idea_id: string | null;
  created_at: string;
}

export class SqliteExplorationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(run: ExplorationRun): ExplorationRun {
    this.database
      .prepare(
        `INSERT INTO exploration_runs (
          id, direction_id, status, runtime_label, understanding_json, error_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        run.id,
        run.directionId,
        run.status,
        run.runtimeLabel,
        run.understanding ? JSON.stringify(run.understanding) : null,
        run.errorCode ?? null,
        run.createdAt,
        run.updatedAt,
      );
    return run;
  }

  get(id: string): ExplorationRun | undefined {
    const row = this.database.prepare("SELECT * FROM exploration_runs WHERE id = ?").get(id) as
      | ExplorationRow
      | undefined;
    if (!row) return undefined;
    const cards = this.database
      .prepare("SELECT * FROM idea_cards WHERE exploration_run_id = ? ORDER BY position, id")
      .all(id) as IdeaCardRow[];
    return mapExploration(row, cards.map(mapIdeaCard));
  }

  list(): ExplorationRun[] {
    const rows = this.database
      .prepare("SELECT * FROM exploration_runs ORDER BY created_at DESC, id DESC")
      .all() as ExplorationRow[];
    return rows.map((row) => {
      const cards = this.database
        .prepare("SELECT * FROM idea_cards WHERE exploration_run_id = ? ORDER BY position, id")
        .all(row.id) as IdeaCardRow[];
      return mapExploration(row, cards.map(mapIdeaCard));
    });
  }

  getLatestForDirection(directionId: string): ExplorationRun | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM exploration_runs
         WHERE direction_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(directionId) as ExplorationRow | undefined;
    if (!row) return undefined;
    const cards = this.database
      .prepare("SELECT * FROM idea_cards WHERE exploration_run_id = ? ORDER BY position, id")
      .all(row.id) as IdeaCardRow[];
    return mapExploration(row, cards.map(mapIdeaCard));
  }

  markRunning(id: string, updatedAt: string): ExplorationRun {
    const current = this.get(id);
    if (!current) throw new Error("EXPLORATION_NOT_FOUND");
    if (current.status === "completed") return current;
    const update = this.database
      .prepare(
        `UPDATE exploration_runs
         SET status = 'running', error_code = NULL, updated_at = ?
         WHERE id = ? AND status IN ('queued', 'interrupted', 'running')`,
      )
      .run(updatedAt, id);
    if (update.changes !== 1) throw new Error("EXPLORATION_NOT_RUNNABLE");
    const running = this.get(id);
    if (!running) throw new Error("EXPLORATION_NOT_FOUND");
    return running;
  }

  saveResult(
    id: string,
    understanding: DirectionUnderstanding,
    cards: readonly IdeaCard[],
    completedAt?: string,
    runtimeLabel?: string,
  ): ExplorationRun {
    const existing = this.get(id);
    if (!existing) throw new Error("EXPLORATION_NOT_FOUND");
    if (existing.status === "completed") {
      const existingIds = existing.cards.map((card) => card.id);
      const incomingIds = cards.map((card) => card.id);
      if (JSON.stringify(existingIds) !== JSON.stringify(incomingIds)) {
        throw new Error("EXPLORATION_RESULT_CONFLICT");
      }
      return existing;
    }
    this.database.transaction(() => {
      const update = this.database
        .prepare(
          `UPDATE exploration_runs
           SET status = 'completed', understanding_json = ?, runtime_label = COALESCE(?, runtime_label),
               error_code = NULL, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          JSON.stringify(understanding),
          runtimeLabel ?? null,
          completedAt ?? latestTimestamp(cards, existing.updatedAt),
          id,
        );
      if (update.changes !== 1) throw new Error("EXPLORATION_NOT_FOUND");

      const insertCard = this.database.prepare(
        `INSERT INTO idea_cards (
          id, exploration_run_id, direction_id, status, title, highlight, target_user, scenario,
          problem, mechanism, value_proposition, why_it_may_work, unknowns_json, mvp_json,
          assumptions_json, position, discarded_at, kept_at, kept_idea_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const [position, card] of cards.entries()) {
        insertCard.run(
          card.id,
          card.explorationRunId,
          card.directionId,
          card.status,
          card.title,
          card.highlight,
          card.targetUser,
          card.scenario,
          card.problem,
          card.mechanism,
          card.valueProposition,
          card.whyItMayWork,
          JSON.stringify(card.unknowns),
          JSON.stringify(card.mvp),
          JSON.stringify(card.assumptions),
          position,
          card.status === "discarded" ? card.discardedAt : null,
          card.status === "kept" ? card.keptAt : null,
          card.status === "kept" ? card.keptIdeaId : null,
          card.createdAt,
        );
      }
    })();
    const saved = this.get(id);
    if (!saved) throw new Error("EXPLORATION_NOT_FOUND");
    return saved;
  }

  saveFailure(id: string, errorCode: string, updatedAt: string): ExplorationRun {
    const update = this.database
      .prepare("UPDATE exploration_runs SET status = 'failed', error_code = ?, updated_at = ? WHERE id = ?")
      .run(errorCode, updatedAt, id);
    if (update.changes !== 1) throw new Error("EXPLORATION_NOT_FOUND");
    const failed = this.get(id);
    if (!failed) throw new Error("EXPLORATION_NOT_FOUND");
    return failed;
  }
}

function latestTimestamp(cards: readonly IdeaCard[], fallback: string): string {
  return cards.at(-1)?.createdAt ?? fallback;
}

function mapExploration(row: ExplorationRow, cards: IdeaCard[]): ExplorationRun {
  return {
    id: row.id,
    directionId: row.direction_id,
    status: row.status,
    runtimeLabel: row.runtime_label,
    ...(row.understanding_json
      ? { understanding: JSON.parse(row.understanding_json) as DirectionUnderstanding }
      : {}),
    cards,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIdeaCard(row: IdeaCardRow): IdeaCard {
  const base = {
    id: row.id,
    explorationRunId: row.exploration_run_id,
    directionId: row.direction_id,
    title: row.title,
    highlight: row.highlight,
    targetUser: row.target_user,
    scenario: row.scenario,
    problem: row.problem,
    mechanism: row.mechanism,
    valueProposition: row.value_proposition,
    whyItMayWork: row.why_it_may_work,
    assumptions: JSON.parse(row.assumptions_json) as string[],
    unknowns: JSON.parse(row.unknowns_json) as string[],
    mvp: JSON.parse(row.mvp_json) as IdeaCard["mvp"],
    createdAt: row.created_at,
  };
  if (row.status === "discarded" && row.discarded_at) {
    return { ...base, status: "discarded", discardedAt: row.discarded_at };
  }
  if (row.status === "kept" && row.kept_at && row.kept_idea_id) {
    return { ...base, status: "kept", keptAt: row.kept_at, keptIdeaId: row.kept_idea_id };
  }
  return { ...base, status: "candidate" };
}
