import type { PluginDatabase, PluginDatabaseReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingStoreErrors } from "./store-errors.js";
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

/** The Coding session tables, as one current schema; Coding declares them as its project database (`CODING_PROJECT_DATABASE`). */
export const CODING_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS coding_sessions (
      project_id TEXT NOT NULL REFERENCES project_root(project_id) ON DELETE CASCADE,
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
interface CodingRunningCommand { task_id: string; summary: string; started_at_ms: number }

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

/** What a write waits for before it begins: the original call is still current. The platform asks again at the transaction itself. */
export type CodingBeforeEffect = () => Promise<void>;

/**
 * A check of the plugin's own that must hold when the write lands (no round is starting on the session): it runs first in the
 * transaction body, after `BEGIN` and in the same turn as `COMMIT`, so nothing that happened while `beforeEffect` waited slips past
 * it. A throw writes nothing.
 */
export type CodingWriteGuard = () => void;

const sessionIn = (reader: PluginDatabaseReader, projectId: string, sessionId: string): CodingSessionRecord => {
  const row = reader.get("SELECT * FROM coding_sessions WHERE project_id = ? AND session_id = ?", [projectId, sessionId]);
  if (!row) throw codingStoreErrors.session_unknown(`找不到这条会话：${sessionId}`);
  return mapSession(row);
};

const planIn = (reader: PluginDatabaseReader, projectId: string, sessionId: string): CodingPlanDraft | null => {
  sessionIn(reader, projectId, sessionId);
  const row = reader.get("SELECT draft_json FROM coding_plan_drafts WHERE project_id = ? AND session_id = ?", [projectId, sessionId]);
  return row ? JSON.parse(String(row.draft_json)) as CodingPlanDraft : null;
};

/**
 * The session tables, over the project library the platform lends the plugin (`services.project_database`). Reads are
 * synchronous. Every write is one transaction that first waits for `beforeEffect`; the platform checks the original call again at
 * its start, before each statement and at the commit, so a call cancelled or revoked before the commit writes nothing. A write
 * that touches several rows or tables (a plan with its session, a round's name with its state) is one transaction.
 */
export class CodingSessionStore {
  /** The tables are already there: the platform made them when the project's library opened with Coding. */
  constructor(private readonly db: PluginDatabase) {}

  plan(projectId: string, sessionId: string): CodingPlanDraft | null {
    return planIn(this.db, projectId, sessionId);
  }

  async savePlan(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, expected: number, draft: CodingPlanDraft,
    guard?: CodingWriteGuard): Promise<CodingPlanDraft> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      sessionIn(tx, projectId, sessionId);
      if (!Number.isSafeInteger(expected) || expected < 0 || draft.revision !== expected + 1) throw new Error("计划修订无效");
      const result = expected === 0
        ? tx.run("INSERT OR IGNORE INTO coding_plan_drafts (project_id, session_id, revision, draft_json) VALUES (?, ?, ?, ?)",
          [projectId, sessionId, draft.revision, JSON.stringify(draft)])
        : tx.run("UPDATE coding_plan_drafts SET revision = ?, draft_json = ? WHERE project_id = ? AND session_id = ? AND revision = ?",
          [draft.revision, JSON.stringify(draft), projectId, sessionId, expected]);
      if (Number(result.changes) !== 1) throw new Error("计划已被另一页面修改，请重新打开后合并修改");
      return planIn(tx, projectId, sessionId)!;
    });
  }

  async confirmPlan(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, draft: CodingPlanDraft,
    guard?: CodingWriteGuard): Promise<CodingPlanDraft> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      const result = tx.run("UPDATE coding_plan_drafts SET draft_json = ? WHERE project_id = ? AND session_id = ? AND revision = ?",
        [JSON.stringify(draft), projectId, sessionId, draft.revision]);
      if (Number(result.changes) !== 1) throw new Error("计划已变化，请重新查看并确认当前修订");
      return planIn(tx, projectId, sessionId)!;
    });
  }

  async create(beforeEffect: CodingBeforeEffect, input: CreateCodingSessionInput): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      if (tx.get("SELECT session_id FROM coding_sessions WHERE project_id = ? AND session_id = ?", [input.project_id, input.session_id])) {
        throw codingStoreErrors.session_duplicate(`会话已存在：${input.session_id}`);
      }
      tx.run(`
        INSERT INTO coding_sessions
          (project_id, session_id, title, state, goal_id, runtime_id, runtime_session_id, created_at, updated_at)
        VALUES (?, ?, ?, 'idle', ?, ?, NULL, ?, ?)
      `, [input.project_id, input.session_id, input.title, input.goal_id ?? null, input.runtime_id, input.at, input.at]);
      return sessionIn(tx, input.project_id, input.session_id);
    });
  }

  get(projectId: string, sessionId: string): CodingSessionRecord {
    return sessionIn(this.db, projectId, sessionId);
  }

  /** The session behind a runtime session, archived or not. */
  byRuntimeSession(projectId: string, runtimeSessionId: string): CodingSessionRecord | null {
    const row = this.db.get("SELECT * FROM coding_sessions WHERE project_id = ? AND runtime_session_id = ?", [projectId, runtimeSessionId]);
    return row ? mapSession(row) : null;
  }

  /** Newest first, which is the order the directory shows. */
  list(projectId: string): CodingSessionRecord[] {
    return this.db.all("SELECT * FROM coding_sessions WHERE project_id = ? AND archived = 0 ORDER BY updated_at DESC, session_id", [projectId]).map(mapSession);
  }

  /** The sessions the person may have to come back to, newest first (the Home's background tasks, `home-background.ts`). */
  backgroundSessions(projectId: string): CodingBackgroundSession[] {
    return backgroundSessionsOf(this.db.all(`SELECT session_id, title, state, updated_at, steps_json, background_json FROM coding_sessions
      WHERE project_id = ? AND archived = 0 AND (state IN (${CODING_ACTIVE_STATES.map(() => "?").join(", ")}) OR steps_json IS NOT NULL OR background_json IS NOT NULL)
      ORDER BY updated_at DESC, session_id`, [projectId, ...CODING_ACTIVE_STATES]));
  }

  /** Record who holds the session's unfinished plan steps; null when none are open. Not a change to the session. */
  async setSteps(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, steps: CodingStepHolders | null): Promise<void> {
    await this.db.transaction(beforeEffect, tx => {
      tx.run("UPDATE coding_sessions SET steps_json = ? WHERE project_id = ? AND session_id = ?", [steps ? JSON.stringify(steps) : null, projectId, sessionId]);
    });
  }

  /** Record the background commands the session has running; null when none. Not a change to the session. */
  async setBackground(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, running: CodingRunningCommand[] | null): Promise<void> {
    await this.db.transaction(beforeEffect, tx => {
      tx.run("UPDATE coding_sessions SET background_json = ? WHERE project_id = ? AND session_id = ?", [running?.length ? JSON.stringify(running) : null, projectId, sessionId]);
    });
  }

  backgroundOf(projectId: string, sessionId: string): CodingRunningCommand[] | null {
    const row = this.db.get("SELECT background_json FROM coding_sessions WHERE project_id = ? AND session_id = ?", [projectId, sessionId]);
    return typeof row?.background_json === "string" ? JSON.parse(row.background_json) as CodingRunningCommand[] : null;
  }

  stepsOf(projectId: string, sessionId: string): CodingStepHolders | null {
    const row = this.db.get("SELECT steps_json FROM coding_sessions WHERE project_id = ? AND session_id = ?", [projectId, sessionId]);
    return typeof row?.steps_json === "string" ? JSON.parse(row.steps_json) as CodingStepHolders : null;
  }

  async setState(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, state: CodingSessionState, at: string): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET state = ?, updated_at = ? WHERE project_id = ? AND session_id = ?", [state, at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  /**
   * A round has started: the session shows as running, and one still named `rename.from` takes `rename.to` as its name. One
   * transaction, so the directory never shows the new name beside the old state.
   */
  async roundStarted(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, at: string,
    rename: { readonly from: string; readonly to: string } | null): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      const record = sessionIn(tx, projectId, sessionId);
      if (rename && record.title === rename.from) tx.run("UPDATE coding_sessions SET title = ? WHERE project_id = ? AND session_id = ?", [rename.to, projectId, sessionId]);
      tx.run("UPDATE coding_sessions SET state = 'running', updated_at = ? WHERE project_id = ? AND session_id = ?", [at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async rename(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, title: string, at: string, guard?: (current: CodingSessionRecord) => void): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      const current = sessionIn(tx, projectId, sessionId);
      guard?.(current);
      tx.run("UPDATE coding_sessions SET title = ?, updated_at = ? WHERE project_id = ? AND session_id = ?", [title, at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async archive(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, at: string, guard?: (current: CodingSessionRecord) => void, options?: { allowAlreadyArchived: true }): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      const current = sessionIn(tx, projectId, sessionId);
      guard?.(current);
      if (current.archived) {
        if (options?.allowAlreadyArchived) return current;
        throw codingStoreErrors.session_unknown("会话已归档");
      }
      tx.run("UPDATE coding_sessions SET archived = 1, updated_at = ? WHERE project_id = ? AND session_id = ?", [at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  /** Attaching a Goal is optional and reversible; passing null detaches. */
  async setGoal(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, goalId: string | null, at: string,
    guard?: CodingWriteGuard): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET goal_id = ?, updated_at = ? WHERE project_id = ? AND session_id = ?", [goalId, at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async setRuntimeSession(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, runtimeSessionId: string, at: string): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET runtime_session_id = ?, updated_at = ? WHERE project_id = ? AND session_id = ?", [runtimeSessionId, at, projectId, sessionId]);
      return sessionIn(tx, projectId, sessionId);
    });
  }
}

/** Session states in which a round is under way or waits on the person. */
export const CODING_ACTIVE_STATES = ["running", "paused", "waiting-answer", "waiting-approval", "reconcile-required", "queued"] as const satisfies readonly CodingSessionState[];

/** A session the person may have to come back to, as the list of background work shows it. */
export interface CodingBackgroundSession {
  session_id: string;
  title: string;
  state: CodingSessionState;
  updated_at: string;
  /** A round is under way or waiting (the state is one of CODING_ACTIVE_STATES). */
  active: boolean;
  steps?: CodingStepHolders;
  commands?: CodingRunningCommand[];
}

/**
 * The sessions of a project that are active, or whose round has ended while the person holds one of the open plan steps (or a
 * background command is left running), newest first. Reads the recorded states Coding keeps current while a round runs: nothing
 * here opens a runtime, writes or creates anything. A column that does not parse reads as absent: the list shows less rather than a guess.
 */
function backgroundSessionsOf(rows: readonly Row[]): CodingBackgroundSession[] {
  const sessions: CodingBackgroundSession[] = [];
  for (const row of rows) {
    const parse = <T>(value: unknown): T | undefined => {
      try { return typeof value === "string" ? JSON.parse(value) as T : undefined; } catch { return undefined; }
    };
    const steps = parse<CodingStepHolders>(row.steps_json), commands = parse<CodingRunningCommand[]>(row.background_json);
    const state = String(row.state) as CodingSessionState;
    const active = (CODING_ACTIVE_STATES as readonly string[]).includes(state);
    if (!active && !steps?.mine && !commands?.length) continue;
    sessions.push({ session_id: String(row.session_id), title: String(row.title), state, updated_at: String(row.updated_at), active,
      ...(steps ? { steps } : {}), ...(commands?.length ? { commands } : {}) });
  }
  return sessions;
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
