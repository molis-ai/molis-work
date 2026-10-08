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
  project_id: string;
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

/** Unfinished plan steps by who holds them: the person, subtasks, no one. */
export interface CodingStepHolders { mine: number; subtasks: number; unowned: number }

export interface CreateCodingSessionInput {
  project_id: string;
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

/** The Coding session tables, as one current schema; the host composes them into the project database baseline. */
export const CODING_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS coding_sessions (
      project_id TEXT NOT NULL REFERENCES boards(project_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
      goal_id TEXT,
      runtime_id TEXT NOT NULL,
      runtime_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      -- Who holds the unfinished plan steps, as last read: lets a list across projects show what waits on the person.
      steps_json TEXT,
      -- Background commands the session left running, as last read: lets the list across projects show and stop them.
      background_json TEXT,
      PRIMARY KEY (project_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS coding_sessions_project_updated_idx
      ON coding_sessions(project_id, updated_at DESC, session_id);
    CREATE TABLE IF NOT EXISTS coding_plan_drafts (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      draft_json TEXT NOT NULL,
      PRIMARY KEY (project_id, session_id),
      FOREIGN KEY (project_id, session_id) REFERENCES coding_sessions(project_id, session_id) ON DELETE CASCADE
    );
`;

type Row = Record<string, unknown>;

/** A background command a session left running. */
export interface CodingRunningCommand { task_id: string; summary: string; started_at_ms: number }

function mapSession(row: Row): CodingSessionRecord {
  return {
    project_id: String(row.project_id),
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
    db.exec(CODING_SCHEMA_SQL);
  }

  plan(projectId: string, sessionId: string): CodingPlanDraft | null {
    this.get(projectId, sessionId);
    const row = this.db.prepare("SELECT draft_json FROM coding_plan_drafts WHERE project_id = ? AND session_id = ?").get(projectId, sessionId) as Row | undefined;
    return row ? JSON.parse(String(row.draft_json)) as CodingPlanDraft : null;
  }

  savePlan(projectId: string, sessionId: string, expected: number, draft: CodingPlanDraft): CodingPlanDraft {
    this.get(projectId, sessionId);
    if (!Number.isSafeInteger(expected) || expected < 0 || draft.revision !== expected + 1) throw new Error("计划修订无效");
    const result = expected === 0
      ? this.db.prepare("INSERT OR IGNORE INTO coding_plan_drafts (project_id, session_id, revision, draft_json) VALUES (?, ?, ?, ?)")
        .run(projectId, sessionId, draft.revision, JSON.stringify(draft))
      : this.db.prepare("UPDATE coding_plan_drafts SET revision = ?, draft_json = ? WHERE project_id = ? AND session_id = ? AND revision = ?")
        .run(draft.revision, JSON.stringify(draft), projectId, sessionId, expected);
    if ((result as { changes: number }).changes !== 1) throw new Error("计划已被另一页面修改，请重新打开后合并修改");
    return this.plan(projectId, sessionId)!;
  }

  confirmPlan(projectId: string, sessionId: string, draft: CodingPlanDraft): CodingPlanDraft {
    const result = this.db.prepare("UPDATE coding_plan_drafts SET draft_json = ? WHERE project_id = ? AND session_id = ? AND revision = ?")
      .run(JSON.stringify(draft), projectId, sessionId, draft.revision);
    if ((result as { changes: number }).changes !== 1) throw new Error("计划已变化，请重新查看并确认当前修订");
    return this.plan(projectId, sessionId)!;
  }

  create(input: CreateCodingSessionInput): CodingSessionRecord {
    const existing = this.db.prepare(
      "SELECT session_id FROM coding_sessions WHERE project_id = ? AND session_id = ?",
    ).get(input.project_id, input.session_id);
    if (existing !== undefined && existing !== null) {
      throw new CodingStoreError("coding.session_duplicate", `会话已存在：${input.session_id}`);
    }
    this.db.prepare(`
      INSERT INTO coding_sessions
        (project_id, session_id, title, state, goal_id, runtime_id, runtime_session_id, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?, NULL, ?, ?)
    `).run(
      input.project_id,
      input.session_id,
      input.title,
      input.goal_id ?? null,
      input.runtime_id,
      input.at,
      input.at,
    );
    return this.get(input.project_id, input.session_id);
  }

  get(projectId: string, sessionId: string): CodingSessionRecord {
    const row = this.db.prepare(
      "SELECT * FROM coding_sessions WHERE project_id = ? AND session_id = ?",
    ).get(projectId, sessionId) as Row | undefined;
    if (!row) throw new CodingStoreError("coding.session_unknown", `找不到这条会话：${sessionId}`);
    return mapSession(row);
  }

  /** The session behind a runtime session, archived or not. */
  byRuntimeSession(projectId: string, runtimeSessionId: string): CodingSessionRecord | null {
    const row = this.db.prepare(
      "SELECT * FROM coding_sessions WHERE project_id = ? AND runtime_session_id = ?",
    ).get(projectId, runtimeSessionId) as Row | undefined;
    return row ? mapSession(row) : null;
  }

  /** Newest first, which is the order the directory shows. */
  list(projectId: string): CodingSessionRecord[] {
    return (this.db.prepare(
      "SELECT * FROM coding_sessions WHERE project_id = ? AND archived = 0 ORDER BY updated_at DESC, session_id",
    ).all(projectId) as Row[]).map(mapSession);
  }

  /** Record who holds the session's unfinished plan steps; null when none are open. Not a change to the session. */
  setSteps(projectId: string, sessionId: string, steps: CodingStepHolders | null): void {
    this.db.prepare("UPDATE coding_sessions SET steps_json = ? WHERE project_id = ? AND session_id = ?")
      .run(steps ? JSON.stringify(steps) : null, projectId, sessionId);
  }

  /** Record the background commands the session has running; null when none. Not a change to the session. */
  setBackground(projectId: string, sessionId: string, running: CodingRunningCommand[] | null): void {
    this.db.prepare("UPDATE coding_sessions SET background_json = ? WHERE project_id = ? AND session_id = ?")
      .run(running?.length ? JSON.stringify(running) : null, projectId, sessionId);
  }

  backgroundOf(projectId: string, sessionId: string): CodingRunningCommand[] | null {
    const row = this.db.prepare("SELECT background_json FROM coding_sessions WHERE project_id = ? AND session_id = ?").get(projectId, sessionId) as Row | undefined;
    return typeof row?.background_json === "string" ? JSON.parse(row.background_json) as CodingRunningCommand[] : null;
  }

  stepsOf(projectId: string, sessionId: string): CodingStepHolders | null {
    const row = this.db.prepare("SELECT steps_json FROM coding_sessions WHERE project_id = ? AND session_id = ?").get(projectId, sessionId) as Row | undefined;
    return typeof row?.steps_json === "string" ? JSON.parse(row.steps_json) as CodingStepHolders : null;
  }

  setState(projectId: string, sessionId: string, state: CodingSessionState, at: string): CodingSessionRecord {
    this.get(projectId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET state = ?, updated_at = ? WHERE project_id = ? AND session_id = ?",
    ).run(state, at, projectId, sessionId);
    return this.get(projectId, sessionId);
  }

  rename(projectId: string, sessionId: string, title: string, at: string): CodingSessionRecord {
    this.get(projectId, sessionId);
    this.db.prepare("UPDATE coding_sessions SET title = ?, updated_at = ? WHERE project_id = ? AND session_id = ?")
      .run(title, at, projectId, sessionId);
    return this.get(projectId, sessionId);
  }

  archive(projectId: string, sessionId: string, at: string): CodingSessionRecord {
    const record = this.get(projectId, sessionId);
    if (record.archived) throw new CodingStoreError("coding.session_unknown", "会话已归档");
    this.db.prepare("UPDATE coding_sessions SET archived = 1, updated_at = ? WHERE project_id = ? AND session_id = ?")
      .run(at, projectId, sessionId);
    return this.get(projectId, sessionId);
  }

  /** Attaching a Goal is optional and reversible; passing null detaches. */
  setGoal(projectId: string, sessionId: string, goalId: string | null, at: string): CodingSessionRecord {
    this.get(projectId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET goal_id = ?, updated_at = ? WHERE project_id = ? AND session_id = ?",
    ).run(goalId, at, projectId, sessionId);
    return this.get(projectId, sessionId);
  }

  setRuntimeSession(projectId: string, sessionId: string, runtimeSessionId: string, at: string): CodingSessionRecord {
    this.get(projectId, sessionId);
    this.db.prepare(
      "UPDATE coding_sessions SET runtime_session_id = ?, updated_at = ? WHERE project_id = ? AND session_id = ?",
    ).run(runtimeSessionId, at, projectId, sessionId);
    return this.get(projectId, sessionId);
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
