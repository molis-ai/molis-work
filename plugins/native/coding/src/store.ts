import type { CodingSessionEntry, CodingSessionState } from "./projection.js";
import type { CodingPlanDraft } from "./plans.js";

/**
 * Coding's own table in the project database.
 *
 * It stores what Coding owns and nothing else. In particular it keeps a Goal's
 * **id but never its title**: the title belongs to Goals, and a copy here would
 * drift the moment someone renames the Goal. Titles are resolved at read time
 * from Goals, through the Capabilities that Plugin already registers.
 */

export interface CodingSqliteDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  };
}

export interface CodingSessionRecord {
  board_id: string;
  session_id: string;
  title: string;
  state: CodingSessionState;
  archived: boolean;
  /** Null when the user did not attach a Goal. Attaching one is optional by design. */
  goal_id: string | null;
  runtime_id: string;
  /** The Runtime's own session id, once one exists. */
  runtime_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCodingSessionInput {
  board_id: string;
  session_id: string;
  title: string;
  runtime_id: string;
  goal_id?: string | null;
  at: string;
}

export class CodingStoreError extends Error {
  constructor(readonly code: "coding.session_unknown" | "coding.session_duplicate", message: string) {
    super(message);
    this.name = "CodingStoreError";
  }
}

export function migrateCodingSessions(db: CodingSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coding_sessions (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      goal_id TEXT,
      runtime_id TEXT NOT NULL,
      runtime_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS coding_sessions_board_updated_idx
      ON coding_sessions(board_id, updated_at DESC, session_id);
    CREATE TABLE IF NOT EXISTS coding_plan_drafts (
      board_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      draft_json TEXT NOT NULL,
      PRIMARY KEY (board_id, session_id),
      FOREIGN KEY (board_id, session_id) REFERENCES coding_sessions(board_id, session_id) ON DELETE CASCADE
    );
  `);
  const columns = db.prepare("PRAGMA table_info(coding_sessions)").all() as Array<{ name: string }>;
  if (!columns.some(column => column.name === "archived")) db.exec("ALTER TABLE coding_sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1))");
}

type Row = Record<string, unknown>;

function mapSession(row: Row): CodingSessionRecord {
  return {
    board_id: String(row.board_id),
    session_id: String(row.session_id),
    title: String(row.title),
    state: String(row.state) as CodingSessionState,
    archived: Number(row.archived) === 1,
    goal_id: row.goal_id === null || row.goal_id === undefined ? null : String(row.goal_id),
    runtime_id: String(row.runtime_id),
    runtime_session_id: row.runtime_session_id === null || row.runtime_session_id === undefined
      ? null
      : String(row.runtime_session_id),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export class CodingSessionStore {
  constructor(private readonly db: CodingSqliteDatabase) {
    migrateCodingSessions(db);
  }

  plan(boardId: string, sessionId: string): CodingPlanDraft | null {
    this.get(boardId, sessionId);
    const row = this.db.prepare("SELECT draft_json FROM coding_plan_drafts WHERE board_id = ? AND session_id = ?").get(boardId, sessionId) as Row | undefined;
    return row ? JSON.parse(String(row.draft_json)) as CodingPlanDraft : null;
  }

  savePlan(boardId: string, sessionId: string, expected: number, draft: CodingPlanDraft): CodingPlanDraft {
    this.get(boardId, sessionId);
    if (!Number.isSafeInteger(expected) || expected < 0 || draft.revision !== expected + 1) throw new Error("计划修订无效");
    const result = expected === 0
      ? this.db.prepare("INSERT OR IGNORE INTO coding_plan_drafts (board_id, session_id, revision, draft_json) VALUES (?, ?, ?, ?)")
        .run(boardId, sessionId, draft.revision, JSON.stringify(draft))
      : this.db.prepare("UPDATE coding_plan_drafts SET revision = ?, draft_json = ? WHERE board_id = ? AND session_id = ? AND revision = ?")
        .run(draft.revision, JSON.stringify(draft), boardId, sessionId, expected);
    if ((result as { changes: number }).changes !== 1) throw new Error("计划已被另一页面修改，请重新打开后合并修改");
    return this.plan(boardId, sessionId)!;
  }

  confirmPlan(boardId: string, sessionId: string, draft: CodingPlanDraft): CodingPlanDraft {
    const result = this.db.prepare("UPDATE coding_plan_drafts SET draft_json = ? WHERE board_id = ? AND session_id = ? AND revision = ?")
      .run(JSON.stringify(draft), boardId, sessionId, draft.revision);
    if ((result as { changes: number }).changes !== 1) throw new Error("计划已变化，请重新查看并确认当前修订");
    return this.plan(boardId, sessionId)!;
  }

  create(input: CreateCodingSessionInput): CodingSessionRecord {
    const existing = this.db.prepare(
      "SELECT session_id FROM coding_sessions WHERE board_id = ? AND session_id = ?",
    ).get(input.board_id, input.session_id);
    if (existing !== undefined && existing !== null) {
      throw new CodingStoreError("coding.session_duplicate", `会话已存在：${input.session_id}`);
    }
    this.db.prepare(`
      INSERT INTO coding_sessions
        (board_id, session_id, title, state, goal_id, runtime_id, runtime_session_id, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?, NULL, ?, ?)
    `).run(
      input.board_id,
      input.session_id,
      input.title,
      input.goal_id ?? null,
      input.runtime_id,
      input.at,
      input.at,
    );
    return this.get(input.board_id, input.session_id);
  }

  get(boardId: string, sessionId: string): CodingSessionRecord {
    const row = this.db.prepare(
      "SELECT * FROM coding_sessions WHERE board_id = ? AND session_id = ?",
    ).get(boardId, sessionId) as Row | undefined;
    if (!row) throw new CodingStoreError("coding.session_unknown", `找不到这条会话：${sessionId}`);
    return mapSession(row);
  }

  /** Newest first, which is the order the directory shows. */
  list(boardId: string): CodingSessionRecord[] {
    return (this.db.prepare(
      "SELECT * FROM coding_sessions WHERE board_id = ? AND archived = 0 ORDER BY updated_at DESC, session_id",
    ).all(boardId) as Row[]).map(mapSession);
  }

  setState(boardId: string, sessionId: string, state: CodingSessionState, at: string): CodingSessionRecord {
    this.get(boardId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET state = ?, updated_at = ? WHERE board_id = ? AND session_id = ?",
    ).run(state, at, boardId, sessionId);
    return this.get(boardId, sessionId);
  }

  rename(boardId: string, sessionId: string, title: string, at: string): CodingSessionRecord {
    this.get(boardId, sessionId);
    this.db.prepare("UPDATE coding_sessions SET title = ?, updated_at = ? WHERE board_id = ? AND session_id = ?")
      .run(title, at, boardId, sessionId);
    return this.get(boardId, sessionId);
  }

  archive(boardId: string, sessionId: string, at: string): CodingSessionRecord {
    const record = this.get(boardId, sessionId);
    if (record.archived) throw new CodingStoreError("coding.session_unknown", "会话已归档");
    this.db.prepare("UPDATE coding_sessions SET archived = 1, updated_at = ? WHERE board_id = ? AND session_id = ?")
      .run(at, boardId, sessionId);
    return this.get(boardId, sessionId);
  }

  /** Attaching a Goal is optional and reversible; passing null detaches. */
  setGoal(boardId: string, sessionId: string, goalId: string | null, at: string): CodingSessionRecord {
    this.get(boardId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET goal_id = ?, updated_at = ? WHERE board_id = ? AND session_id = ?",
    ).run(goalId, at, boardId, sessionId);
    return this.get(boardId, sessionId);
  }

  setRuntimeSession(boardId: string, sessionId: string, runtimeSessionId: string, at: string): CodingSessionRecord {
    this.get(boardId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET runtime_session_id = ?, updated_at = ? WHERE board_id = ? AND session_id = ?",
    ).run(runtimeSessionId, at, boardId, sessionId);
    return this.get(boardId, sessionId);
  }
}

/**
 * Turn stored rows into what the directory renders.
 *
 * `goalTitle` resolves a Goal's current title. A Goal that cannot be resolved
 * keeps its id as the label rather than vanishing: the session is still real,
 * and hiding it would lose the user's work.
 */
export function toDirectoryEntries(
  records: readonly CodingSessionRecord[],
  goalTitle: (goalId: string) => string | undefined,
): CodingSessionEntry[] {
  return records.map((record) => ({
    session_id: record.session_id,
    title: record.title,
    state: record.state,
    updated_at: record.updated_at,
    ...(record.goal_id === null
      ? {}
      : { goal_id: record.goal_id, goal_title: goalTitle(record.goal_id) ?? record.goal_id }),
  }));
}
