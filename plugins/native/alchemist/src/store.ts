import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type {
  AlchemistCard,
  AlchemistCardStatus,
  AlchemistDecision,
  AlchemistDecisionChoice,
  AlchemistDirection,
  AlchemistDirectionSummary,
} from "@molis-ai/molis-work-contracts/modules/alchemist";
import { AlchemistError } from "./error.js";

interface DirectionRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
  card_count?: number;
  kept_count?: number;
  decision_count?: number;
}

interface CardRow {
  id: string;
  direction_id: string;
  project_id: string;
  origin: string;
  status: string;
  title: string;
  highlight: string;
  target_user: string;
  scenario: string;
  core_problem: string;
  core_mechanism: string;
  value_proposition: string;
  why_it_may_work: string;
  assumptions_json: string;
  unknowns_json: string;
  mvp_in_json: string;
  mvp_out_json: string;
  created_at: string;
  updated_at: string;
}

interface DecisionRow {
  id: string;
  card_id: string;
  project_id: string;
  choice: string;
  reason: string;
  created_at: string;
  updated_at: string;
}

export class AlchemistStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): AlchemistDirectionSummary[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM cards c WHERE c.direction_id = d.id) AS card_count,
        (SELECT COUNT(*) FROM cards c WHERE c.direction_id = d.id AND c.status = 'kept') AS kept_count,
        (SELECT COUNT(*) FROM decisions x WHERE x.direction_id = d.id) AS decision_count
      FROM directions d
      WHERE d.project_id = ?
      ORDER BY d.created_at DESC, d.rowid DESC
    `).all(project_id) as unknown as DirectionRow[];
    return rows.map(fromDirectionSummary);
  }

  get(id: string, projectId: string): {
    direction: AlchemistDirection;
    cards: AlchemistCard[];
    decisions: AlchemistDecision[];
  } {
    const direction = this.direction(id, projectId);
    const cards = (this.db.prepare(
      "SELECT * FROM cards WHERE direction_id = ? ORDER BY created_at ASC, rowid ASC",
    ).all(direction.id) as unknown as CardRow[]).map(fromCard);
    const decisions = (this.db.prepare(
      "SELECT * FROM decisions WHERE direction_id = ? ORDER BY updated_at DESC",
    ).all(direction.id) as unknown as DecisionRow[]).map(fromDecision);
    return { direction, cards, decisions };
  }

  private direction(id: string, projectId: string): AlchemistDirection {
    const project_id = normalizeProjectId(projectId);
    const row = this.db.prepare("SELECT * FROM directions WHERE id = ?").get(id) as unknown as DirectionRow | undefined;
    if (!row || row.project_id !== project_id) throw new AlchemistError("alchemist.not_found", "找不到这个方向");
    return fromDirection(row);
  }


}

export function openAlchemistStore(homeDirectory: string): AlchemistStore {
  const db = openHomeSqliteDatabase(homeDirectory, "alchemist");
  db.exec(`
    CREATE TABLE IF NOT EXISTS directions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS directions_project_idx ON directions(project_id, created_at);
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      direction_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      highlight TEXT NOT NULL,
      target_user TEXT NOT NULL,
      scenario TEXT NOT NULL,
      core_problem TEXT NOT NULL,
      core_mechanism TEXT NOT NULL,
      value_proposition TEXT NOT NULL,
      why_it_may_work TEXT NOT NULL,
      assumptions_json TEXT NOT NULL,
      unknowns_json TEXT NOT NULL,
      mvp_in_json TEXT NOT NULL,
      mvp_out_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_direction_idx ON cards(direction_id, created_at);
    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL UNIQUE,
      direction_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      choice TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return new AlchemistStore(db);
}

function fromDirection(row: DirectionRow): AlchemistDirection {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function fromDirectionSummary(row: DirectionRow): AlchemistDirectionSummary {
  return {
    ...fromDirection(row),
    card_count: Number(row.card_count ?? 0),
    kept_count: Number(row.kept_count ?? 0),
    decision_count: Number(row.decision_count ?? 0),
  };
}

function fromCard(row: CardRow): AlchemistCard {
  return {
    id: row.id,
    direction_id: row.direction_id,
    project_id: row.project_id,
    origin: "demo",
    status: row.status as AlchemistCardStatus,
    title: row.title,
    highlight: row.highlight,
    target_user: row.target_user,
    scenario: row.scenario,
    core_problem: row.core_problem,
    core_mechanism: row.core_mechanism,
    value_proposition: row.value_proposition,
    why_it_may_work: row.why_it_may_work,
    assumptions: parseList(row.assumptions_json),
    unknowns: parseList(row.unknowns_json),
    mvp_in: parseList(row.mvp_in_json),
    mvp_out: parseList(row.mvp_out_json),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function fromDecision(row: DecisionRow): AlchemistDecision {
  return {
    id: row.id,
    card_id: row.card_id,
    project_id: row.project_id,
    choice: row.choice as AlchemistDecisionChoice,
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseList(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function normalizeProjectId(value: string): string {
  const project_id = value.trim();
  if (!project_id) throw new AlchemistError("alchemist.invalid", "缺少项目");
  return project_id;
}
