import {
  discardCard as discardCandidate,
  keepCard as formIdeaFromCard,
  type IdeaCard,
  restoreCard as restoreCandidate,
} from "../../domain/discovery/idea-card.js";
import type { Idea, IdeaVersion, IdeaVersionContent } from "../../domain/ideas/idea.js";
import type { RevisionMeta } from "../../domain/kernel/revision.js";
import type { SqliteDatabase } from "./open-database.js";

interface CardRow {
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
  unknowns_json: string;
  mvp_json: string;
  discarded_at: string | null;
  kept_at: string | null;
  kept_idea_id: string | null;
  created_at: string;
}

interface IdeaVersionRow {
  id: string;
  idea_id: string;
  version: number;
  parent_version: number | null;
  actor_id: string;
  reason: string;
  created_at: string;
  source_card_id: string;
  source_exploration_run_id: string;
  content_json: string;
}

interface IdeaRow {
  id: string;
  direction_id: string;
  lifecycle: Idea["lifecycle"];
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface KeepIdeaCardInput {
  cardId: string;
  ideaId: string;
  ideaVersionId: string;
  actorId: string;
  now: string;
}

export class SqliteIdeaRepository {
  constructor(private readonly database: SqliteDatabase) {}

  keepCard(input: KeepIdeaCardInput): { idea: Idea; version: IdeaVersion } {
    const card = this.getCard(input.cardId);
    if (!card) throw new Error("IDEA_CARD_NOT_FOUND");
    const formed = formIdeaFromCard(card, input);

    return this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO ideas (id, direction_id, lifecycle, current_version, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          formed.idea.id,
          formed.idea.directionId,
          formed.idea.lifecycle,
          formed.idea.currentVersion,
          formed.idea.createdAt,
          formed.idea.updatedAt,
        );

      const cardUpdate = this.database
        .prepare(
          `UPDATE idea_cards SET status = 'kept', kept_at = ?, kept_idea_id = ?
           WHERE id = ? AND status = 'candidate'`,
        )
        .run(input.now, input.ideaId, input.cardId);
      if (cardUpdate.changes !== 1) throw new Error("IDEA_CARD_NOT_CANDIDATE");

      this.database
        .prepare(
          `INSERT INTO idea_versions (
            id, idea_id, version, parent_version, actor_id, reason, created_at,
            source_card_id, source_exploration_run_id, content_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          formed.version.id,
          formed.version.ideaId,
          formed.version.revision.version,
          formed.version.revision.parentVersion ?? null,
          formed.version.revision.actorId,
          formed.version.revision.reason,
          formed.version.revision.createdAt,
          formed.version.sourceCardId,
          formed.version.sourceExplorationRunId,
          JSON.stringify(formed.version.content),
        );

      const workspace = this.database
        .prepare(
          `SELECT directions.workspace_id AS workspace_id
           FROM directions WHERE directions.id = ?`,
        )
        .get(formed.idea.directionId) as { workspace_id: string };
      this.database
        .prepare(
          `INSERT INTO activity_events (
            id, workspace_id, kind, target_kind, target_id, payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `activity_${formed.idea.id}_v1`,
          workspace.workspace_id,
          "idea.created",
          "idea",
          formed.idea.id,
          JSON.stringify({ sourceCardId: formed.version.sourceCardId, version: 1 }),
          input.now,
        );

      return { idea: formed.idea, version: formed.version };
    })();
  }

  getVersion(ideaId: string, version: number): IdeaVersion | undefined {
    const row = this.database
      .prepare("SELECT * FROM idea_versions WHERE idea_id = ? AND version = ?")
      .get(ideaId, version) as IdeaVersionRow | undefined;
    if (!row) return undefined;
    const revision: RevisionMeta = {
      version: row.version,
      ...(row.parent_version === null ? {} : { parentVersion: row.parent_version }),
      actorId: row.actor_id,
      reason: row.reason,
      createdAt: row.created_at,
    };
    return {
      id: row.id,
      ideaId: row.idea_id,
      sourceCardId: row.source_card_id,
      sourceExplorationRunId: row.source_exploration_run_id,
      revision,
      content: JSON.parse(row.content_json) as IdeaVersionContent,
    };
  }

  listVersions(): IdeaVersion[] {
    const rows = this.database
      .prepare("SELECT * FROM idea_versions ORDER BY created_at DESC, idea_id, version DESC")
      .all() as IdeaVersionRow[];
    return rows.map((row) => {
      const revision: RevisionMeta = {
        version: row.version,
        ...(row.parent_version === null ? {} : { parentVersion: row.parent_version }),
        actorId: row.actor_id,
        reason: row.reason,
        createdAt: row.created_at,
      };
      return {
        id: row.id,
        ideaId: row.idea_id,
        sourceCardId: row.source_card_id,
        sourceExplorationRunId: row.source_exploration_run_id,
        revision,
        content: JSON.parse(row.content_json) as IdeaVersionContent,
      };
    });
  }

  getIdea(id: string): Idea | undefined {
    const row = this.database.prepare("SELECT * FROM ideas WHERE id = ?").get(id) as IdeaRow | undefined;
    return row
      ? {
          id: row.id,
          directionId: row.direction_id,
          lifecycle: row.lifecycle,
          currentVersion: row.current_version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : undefined;
  }

  listIdeas(): Idea[] {
    const rows = this.database.prepare("SELECT * FROM ideas ORDER BY updated_at DESC, id").all() as IdeaRow[];
    return rows.map((row) => ({
      id: row.id,
      directionId: row.direction_id,
      lifecycle: row.lifecycle,
      currentVersion: row.current_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getCard(cardId: string): IdeaCard | undefined {
    const row = this.database.prepare("SELECT * FROM idea_cards WHERE id = ?").get(cardId) as
      | CardRow
      | undefined;
    return row ? mapCard(row) : undefined;
  }

  discardCard(input: { cardId: string; activityId: string; now: string }): IdeaCard {
    const card = this.getCard(input.cardId);
    if (!card) throw new Error("IDEA_CARD_NOT_FOUND");
    const discarded = discardCandidate(card, input.now);
    return this.database.transaction(() => {
      const update = this.database
        .prepare(
          `UPDATE idea_cards SET status = 'discarded', discarded_at = ?
           WHERE id = ? AND status = 'candidate'`,
        )
        .run(input.now, input.cardId);
      if (update.changes !== 1) throw new Error("IDEA_CARD_NOT_CANDIDATE");
      this.recordCardActivity(input.activityId, discarded, "idea_card.discarded", input.now);
      return discarded;
    })();
  }

  restoreCard(input: { cardId: string; activityId: string; now: string }): IdeaCard {
    const card = this.getCard(input.cardId);
    if (!card) throw new Error("IDEA_CARD_NOT_FOUND");
    const restored = restoreCandidate(card);
    return this.database.transaction(() => {
      const update = this.database
        .prepare(
          `UPDATE idea_cards SET status = 'candidate', discarded_at = NULL
           WHERE id = ? AND status = 'discarded'`,
        )
        .run(input.cardId);
      if (update.changes !== 1) throw new Error("IDEA_CARD_NOT_DISCARDED");
      this.recordCardActivity(input.activityId, restored, "idea_card.restored", input.now);
      return restored;
    })();
  }

  private recordCardActivity(id: string, card: IdeaCard, kind: string, now: string): void {
    const workspace = this.database
      .prepare("SELECT workspace_id FROM directions WHERE id = ?")
      .get(card.directionId) as { workspace_id: string };
    this.database
      .prepare(
        `INSERT INTO activity_events
         (id, workspace_id, kind, target_kind, target_id, payload_json, created_at)
         VALUES (?, ?, ?, 'idea_card', ?, '{}', ?)`,
      )
      .run(id, workspace.workspace_id, kind, card.id, now);
  }
}

function mapCard(row: CardRow): IdeaCard {
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
