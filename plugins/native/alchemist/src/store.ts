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

const CHOICES = new Set<AlchemistDecisionChoice>(["build", "hold", "drop"]);

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

  create(input: { title?: string; description?: string; project_id: string }): {
    direction: AlchemistDirection;
    cards: AlchemistCard[];
  } {
    const now = new Date().toISOString();
    const project_id = normalizeProjectId(input.project_id);
    const title = normalizeTitle(input.title);
    const description = normalizeDescription(input.description);
    const direction: AlchemistDirection = {
      id: crypto.randomUUID(),
      project_id,
      title,
      description,
      created_at: now,
      updated_at: now,
    };
    const drafts = demoIdeaCards(title, description);
    const cards: AlchemistCard[] = drafts.map((draft) => ({
      ...draft,
      id: crypto.randomUUID(),
      direction_id: direction.id,
      project_id,
      created_at: now,
      updated_at: now,
    }));
    this.db.exec("BEGIN");
    try {
      this.db.prepare(
        "INSERT INTO directions (id, project_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(direction.id, direction.project_id, direction.title, direction.description, direction.created_at, direction.updated_at);
      const insert = this.db.prepare(`
        INSERT INTO cards (
          id, direction_id, project_id, origin, status, title, highlight, target_user, scenario,
          core_problem, core_mechanism, value_proposition, why_it_may_work,
          assumptions_json, unknowns_json, mvp_in_json, mvp_out_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const card of cards) insert.run(...cardParams(card));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { direction, cards };
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

  setCardStatus(cardId: string, status: AlchemistCardStatus, projectId: string): AlchemistCard {
    const card = this.card(cardId, projectId);
    if (card.status === status) return card;
    const next: AlchemistCard = { ...card, status, updated_at: new Date().toISOString() };
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE cards SET status = ?, updated_at = ? WHERE id = ?").run(next.status, next.updated_at, next.id);
      if (status !== "kept") {
        this.db.prepare("DELETE FROM decisions WHERE card_id = ?").run(next.id);
      }
      this.touchDirection(card.direction_id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return next;
  }

  decide(cardId: string, choice: string, reason: string | undefined, projectId: string): AlchemistDecision {
    const card = this.card(cardId, projectId);
    if (card.status !== "kept") throw new AlchemistError("alchemist.invalid", "先保留这张，再做决定");
    if (!CHOICES.has(choice as AlchemistDecisionChoice)) {
      throw new AlchemistError("alchemist.invalid", "决定只能是去做、先放着或不做");
    }
    const text = normalizeReason(reason);
    const now = new Date().toISOString();
    const existing = this.db.prepare("SELECT * FROM decisions WHERE card_id = ?").get(card.id) as unknown as DecisionRow | undefined;
    const decision: AlchemistDecision = {
      id: existing?.id ?? crypto.randomUUID(),
      card_id: card.id,
      project_id: card.project_id,
      choice: choice as AlchemistDecisionChoice,
      reason: text,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.db.prepare(`
      INSERT INTO decisions (id, card_id, direction_id, project_id, choice, reason, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(card_id) DO UPDATE SET
        choice = excluded.choice,
        reason = excluded.reason,
        updated_at = excluded.updated_at
    `).run(
      decision.id, decision.card_id, card.direction_id, decision.project_id,
      decision.choice, decision.reason, decision.created_at, decision.updated_at,
    );
    this.touchDirection(card.direction_id);
    return decision;
  }

  deleteDirection(id: string, projectId: string): void {
    const direction = this.direction(id, projectId);
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM decisions WHERE direction_id = ?").run(direction.id);
      this.db.prepare("DELETE FROM cards WHERE direction_id = ?").run(direction.id);
      this.db.prepare("DELETE FROM directions WHERE id = ?").run(direction.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private direction(id: string, projectId: string): AlchemistDirection {
    const project_id = normalizeProjectId(projectId);
    const row = this.db.prepare("SELECT * FROM directions WHERE id = ?").get(id) as unknown as DirectionRow | undefined;
    if (!row || row.project_id !== project_id) throw new AlchemistError("alchemist.not_found", "找不到这个方向");
    return fromDirection(row);
  }

  private card(id: string, projectId: string): AlchemistCard {
    const project_id = normalizeProjectId(projectId);
    const row = this.db.prepare("SELECT * FROM cards WHERE id = ?").get(id) as unknown as CardRow | undefined;
    if (!row || row.project_id !== project_id) throw new AlchemistError("alchemist.not_found", "找不到这张卡");
    return fromCard(row);
  }

  private touchDirection(id: string): void {
    this.db.prepare("UPDATE directions SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
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

export function demoIdeaCards(title: string, description: string): Array<Omit<AlchemistCard, "id" | "direction_id" | "project_id" | "created_at" | "updated_at">> {
  const subject = title.trim();
  const note = description.trim();
  const shared = note ? `你写的是：${note}` : "说明还空着，卡上的判断只来自标题。";
  return [
    card(subject, "先做最小闭环", "只验证一个人是否愿意为这件事再回来一次。", {
      target_user: "已经在用替代办法硬撑的人",
      scenario: "一个人，一周，做完就能拿给别人看",
      core_problem: `${subject} 现在靠记忆和散落的笔记撑着`,
      core_mechanism: "把一次方向收成三张可比较的卡，并留下明确决定",
      value_proposition: "少写一份没人看的长报告，先知道值不值得继续",
      why_it_may_work: shared,
      assumptions: ["用户能用一句话说清方向", "比较三张卡比读一份报告更快"],
      unknowns: ["有没有人愿意为这个决定付费", "一周之后还会不会打开"],
      mvp_in: ["写下方向", "看三张卡", "留下或丢掉", "记下决定"],
      mvp_out: ["市场采集", "自动研究", "多人协作"],
    }),
    card(subject, "换一种使用者", "先别服务所有人，只服务已经付过替代成本的那一个。", {
      target_user: "每周都要自己做这个判断的人",
      scenario: "在现有工具旁边，多一步比较，而不是再开一个后台",
      core_problem: "方向一多，取舍就混进聊天记录里",
      core_mechanism: "同一方向给出不同用户和不同第一刀",
      value_proposition: "看见另一条更窄、更容易验证的做法",
      why_it_may_work: shared,
      assumptions: ["更窄的用户比更大的市场更容易验证", "创始人愿意放弃一部分想象"],
      unknowns: ["窄用户是否真的存在", "换用户之后机制还成不成立"],
      mvp_in: ["写清这一个用户", "只做一个场景"],
      mvp_out: ["平台化", "开放给所有角色"],
    }),
    card(subject, "先不要做的版本", "把最容易让人兴奋、也最容易做重的部分明确排除。", {
      target_user: "想马上看到完整产品的创始人本人",
      scenario: "决定之前，先写下这次不做什么",
      core_problem: "兴奋点会把第一刀撑成一个平台",
      core_mechanism: "用一张卡专门记录不做的范围和未知",
      value_proposition: "决定不做，也是一个可追溯的结果",
      why_it_may_work: shared,
      assumptions: ["明确不做能减少后续返工", "未知写出来比藏在报告里有用"],
      unknowns: ["排除的部分会不会其实才是需求", "演示卡会不会被当成研究结论"],
      mvp_in: ["写明不做", "要求决定附带原因"],
      mvp_out: ["自动生成商业证明", "替用户做决定"],
    }),
  ];
}

function card(
  subject: string,
  angle: string,
  highlight: string,
  fields: Omit<AlchemistCard, "id" | "direction_id" | "project_id" | "origin" | "status" | "title" | "highlight" | "created_at" | "updated_at">,
): Omit<AlchemistCard, "id" | "direction_id" | "project_id" | "created_at" | "updated_at"> {
  return {
    origin: "demo",
    status: "candidate",
    title: `${subject}：${angle}`,
    highlight,
    ...fields,
  };
}

function cardParams(cardRecord: AlchemistCard): string[] {
  return [
    cardRecord.id, cardRecord.direction_id, cardRecord.project_id, cardRecord.origin, cardRecord.status,
    cardRecord.title, cardRecord.highlight, cardRecord.target_user, cardRecord.scenario,
    cardRecord.core_problem, cardRecord.core_mechanism, cardRecord.value_proposition, cardRecord.why_it_may_work,
    JSON.stringify(cardRecord.assumptions), JSON.stringify(cardRecord.unknowns),
    JSON.stringify(cardRecord.mvp_in), JSON.stringify(cardRecord.mvp_out),
    cardRecord.created_at, cardRecord.updated_at,
  ];
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

function normalizeTitle(value: string | undefined): string {
  const title = (value ?? "").trim();
  if (!title) throw new AlchemistError("alchemist.invalid", "先写下方向");
  if (title.length > 200) throw new AlchemistError("alchemist.invalid", "方向太长");
  return title;
}

function normalizeDescription(value: string | undefined): string {
  const description = (value ?? "").trim();
  if (description.length > 4000) throw new AlchemistError("alchemist.invalid", "说明太长");
  return description;
}

function normalizeReason(value: string | undefined): string {
  const reason = (value ?? "").trim();
  if (!reason) throw new AlchemistError("alchemist.invalid", "写下为什么");
  if (reason.length > 2000) throw new AlchemistError("alchemist.invalid", "原因太长");
  return reason;
}
