import {CODING_HISTORY_SCHEMA_SQL,readCodingSavedHistory} from './saved-history.js';
import { OVERVIEW_ROW_LIMIT, type PluginDatabase, type PluginDatabaseReader, type PluginDatabaseTransaction, type PluginOverviewClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingOverviewRow } from "./home-background.js";
import { codingStoreErrors } from "./store-errors.js";
import { tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codingLocalFailure } from "./words.js";
import {CodingInputStore,CODING_INPUTS_SCHEMA_SQL} from './inputs.js';
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
      session_id TEXT PRIMARY KEY,
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
      background_json TEXT
    );
    CREATE INDEX IF NOT EXISTS coding_sessions_updated_idx
      ON coding_sessions(updated_at DESC, session_id);
    CREATE TABLE IF NOT EXISTS coding_plan_drafts (
      session_id TEXT PRIMARY KEY REFERENCES coding_sessions(session_id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      draft_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coding_plan_versions (
      session_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL CHECK (revision > 0)
    );



${CODING_INPUTS_SCHEMA_SQL}
${CODING_HISTORY_SCHEMA_SQL}
`;

type Row = Record<string, unknown>;

/** A background command a session left running. */
interface CodingRunningCommand { task_id: string; summary: string; started_at_ms: number }

function mapSession(row: Row, projectId: string): CodingSessionRecord {
  return {
    project_id: projectId,
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
  const row = reader.get("SELECT * FROM coding_sessions WHERE session_id = ?", [sessionId]);
  if (!row) throw codingStoreErrors.session_unknown(`找不到这条会话：${sessionId}`);
  return mapSession(row, projectId);
};

const planIn = (reader: PluginDatabaseReader, projectId: string, sessionId: string): CodingPlanDraft | null => {
  sessionIn(reader, projectId, sessionId);
  const row = reader.get("SELECT draft_json FROM coding_plan_drafts WHERE session_id = ?", [sessionId]);
  return row ? JSON.parse(String(row.draft_json)) as CodingPlanDraft : null;
};

/**
 * The session tables, over the project library the platform lends the plugin (`services.project_database`). Reads are
 * synchronous. Every write is one transaction that first waits for `beforeEffect`; the platform checks the original call again at
 * its start, before each statement and at the commit, so a call cancelled or revoked before the commit writes nothing. A write
 * that touches several rows or tables (a plan with its session, a round's name with its state) is one transaction.
 */
export class CodingSessionStore {
  readonly inputs: CodingInputStore;
  /** `overview` is the platform's summary table in the partition's main database (V17); without it (a test's bare store) no row is kept. */
  constructor(private readonly db: PluginDatabase, private readonly overview?: PluginOverviewClient) {
    this.inputs = new CodingInputStore(db);
  }

  /** Writes the session's overview row, or removes it when the list of background work has nothing to show for it, in the session's transaction. */
  private summed(tx: PluginDatabaseTransaction, sessionId: string): void {
    if (!this.overview) return;
    // The partition's main database holds this one project, so the session id alone finds the row.
    const row = tx.get("SELECT session_id, runtime_session_id, title, state, updated_at, steps_json, background_json, archived FROM coding_sessions WHERE session_id = ?", [sessionId]);
    const session = row && Number(row.archived) === 0 ? backgroundSessionsOf([row])[0] : undefined;
    this.overview.join(tx, rows => {
      if (!session) {
        rows.remove("background_task", sessionId);
        return;
      }
      const activeMarks = CODING_ACTIVE_STATES.map(() => "?").join(", ");
      const total = Number((tx.get(
        `SELECT count(*) AS total FROM coding_sessions WHERE archived = 0 AND (state IN (${activeMarks}) OR steps_json IS NOT NULL OR background_json IS NOT NULL)`,
        [...CODING_ACTIVE_STATES],
      ) as { total: number }).total);
      if (total > OVERVIEW_ROW_LIMIT) {
        // Bound background_task rows to OVERVIEW_ROW_LIMIT: keep active sessions first, then newest updated_at, evicting older overflow rows before upserting.
        const all = backgroundSessionsOf(tx.all(
          `SELECT session_id, runtime_session_id, title, state, updated_at, steps_json, background_json FROM coding_sessions WHERE archived = 0 AND (state IN (${activeMarks}) OR steps_json IS NOT NULL OR background_json IS NOT NULL)`,
          [...CODING_ACTIVE_STATES],
        )).sort((a, b) => Number(b.active) - Number(a.active) || b.updated_at.localeCompare(a.updated_at) || a.session_id.localeCompare(b.session_id));
        const evicted = all.slice(OVERVIEW_ROW_LIMIT);
        let evictedCurrent = false;
        for (const dropped of evicted) {
          rows.remove("background_task", dropped.session_id);
          if (dropped.session_id === sessionId) evictedCurrent = true;
        }
        if (evictedCurrent) return;
      }
      rows.upsert("background_task", codingOverviewRow(session));
    });
  }

  savedHistory(projectId:string,sessionId:string):string[] {const record=this.get(projectId,sessionId);return readCodingSavedHistory(this.db,sessionId,record.runtime_session_id);}

  plan(projectId: string, sessionId: string): CodingPlanDraft | null {
    return planIn(this.db, projectId, sessionId);
  }

  planRevision(projectId: string, sessionId: string): number {
    this.get(projectId, sessionId);
    const row=this.db.get("SELECT revision FROM coding_plan_versions WHERE session_id=?", [sessionId]) as Row|undefined;
    return row?Number(row.revision):0;
  }

  async savePlan(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, expected: number, draft: CodingPlanDraft,
    guard?: CodingWriteGuard): Promise<CodingPlanDraft> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      sessionIn(tx, projectId, sessionId);
      if (!Number.isSafeInteger(expected) || expected < 0 || draft.revision !== expected + 1) throw codingLocalFailure("coding.server.plan-revision", "计划修订无效");
      const clock = tx.get("SELECT revision FROM coding_plan_versions WHERE session_id=?", [sessionId]);
      if (Number(clock?.revision ?? 0) !== expected) throw codingStoreErrors.plan_conflict(tryUiText("coding.server.plan-conflict-merge") ?? "计划已被另一页面修改，请重新打开后合并修改");
      const exists = planIn(tx, projectId, sessionId);
      const result = !exists
        ? tx.run("INSERT OR IGNORE INTO coding_plan_drafts (session_id, revision, draft_json) VALUES (?, ?, ?)",
          [sessionId, draft.revision, JSON.stringify(draft)])
        : tx.run("UPDATE coding_plan_drafts SET revision = ?, draft_json = ? WHERE session_id = ? AND revision = ?",
          [draft.revision, JSON.stringify(draft), sessionId, expected]);
      if (Number(result.changes) !== 1) throw codingStoreErrors.plan_conflict(tryUiText("coding.server.plan-conflict-merge") ?? "计划已被另一页面修改，请重新打开后合并修改");
      tx.run("INSERT INTO coding_plan_versions VALUES (?,?) ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision", [sessionId,draft.revision]);
      return planIn(tx, projectId, sessionId)!;
    });
  }

  async confirmPlan(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, draft: CodingPlanDraft,
    guard?: CodingWriteGuard): Promise<CodingPlanDraft> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      const result = tx.run("UPDATE coding_plan_drafts SET draft_json = ? WHERE session_id = ? AND revision = ?",
        [JSON.stringify(draft), sessionId, draft.revision]);
      if (Number(result.changes) !== 1) throw codingStoreErrors.plan_conflict(tryUiText("coding.server.plan-changed-confirm") ?? "计划已变化，请重新查看并确认当前修订");
      return planIn(tx, projectId, sessionId)!;
    });
  }

  async create(beforeEffect: CodingBeforeEffect, input: CreateCodingSessionInput): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      if (tx.get("SELECT session_id FROM coding_sessions WHERE session_id = ?", [input.session_id])) {
        throw codingStoreErrors.session_duplicate(`会话已存在：${input.session_id}`);
      }
      tx.run(`
        INSERT INTO coding_sessions
          (session_id, title, state, goal_id, runtime_id, runtime_session_id, created_at, updated_at)
        VALUES (?, ?, 'idle', ?, ?, NULL, ?, ?)
      `, [input.session_id, input.title, input.goal_id ?? null, input.runtime_id, input.at, input.at]);
      return sessionIn(tx, input.project_id, input.session_id);
    });
  }

  get(projectId: string, sessionId: string): CodingSessionRecord {
    return sessionIn(this.db, projectId, sessionId);
  }

  /** The session behind a runtime session, archived or not. */
  byRuntimeSession(projectId: string, runtimeSessionId: string): CodingSessionRecord | null {
    const row = this.db.get("SELECT * FROM coding_sessions WHERE runtime_session_id = ?", [runtimeSessionId]);
    return row ? mapSession(row, projectId) : null;
  }

  /** Newest first, which is the order the directory shows. */
  list(projectId: string): CodingSessionRecord[] {
    return this.db.all("SELECT * FROM coding_sessions WHERE archived = 0 ORDER BY updated_at DESC, session_id").map(row => mapSession(row, projectId));
  }

  /** Bounded owner-only directory; its cursor binds scope, archive choice and the original ordering position. */
  page(projectId: string, archived: boolean, limit = 50, cursor?: string): { sessions: CodingSessionRecord[]; next_cursor: string | null } {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw codingStoreErrors.session_unknown("会话分页数量无效");
    let position: [string, string] | undefined;
    if (cursor !== undefined) {
      try {
        const value: unknown = JSON.parse(decodeURIComponent(cursor));
        if (!Array.isArray(value) || value.length !== 4 || value[0] !== projectId || value[1] !== archived
          || typeof value[2] !== "string" || typeof value[3] !== "string" || !value[2] || !value[3]) throw new Error("cursor");
        position = [value[2], value[3]];
      } catch { throw codingStoreErrors.session_unknown("会话分页位置不属于当前项目或目录，请刷新"); }
    }
    const rows = this.db.all(`SELECT * FROM coding_sessions WHERE archived = ?
      ${position ? "AND (updated_at < ? OR (updated_at = ? AND session_id > ?))" : ""}
      ORDER BY updated_at DESC, session_id LIMIT ?`, [archived ? 1 : 0,
      ...(position ? [position[0], position[0], position[1]] : []), limit + 1]).map(row => mapSession(row, projectId));
    const sessions = rows.slice(0, limit), last = sessions.at(-1);
    return { sessions, next_cursor: rows.length > limit && last ? encodeURIComponent(JSON.stringify([projectId, archived, last.updated_at, last.session_id])) : null };
  }

  /** The sessions the person may have to come back to, newest first (the Home's background tasks, `home-background.ts`). */
  backgroundSessions(): CodingBackgroundSession[] {
    return backgroundSessionsOf(this.db.all(`SELECT session_id, runtime_session_id, title, state, updated_at, steps_json, background_json FROM coding_sessions
      WHERE archived = 0 AND (state IN (${CODING_ACTIVE_STATES.map(() => "?").join(", ")}) OR steps_json IS NOT NULL OR background_json IS NOT NULL)
      ORDER BY updated_at DESC, session_id`, [...CODING_ACTIVE_STATES]));
  }

  /** Record who holds the session's unfinished plan steps; null when none are open. Not a change to the session. */
  async setSteps(beforeEffect: CodingBeforeEffect, _projectId: string, sessionId: string, steps: CodingStepHolders | null): Promise<void> {
    await this.db.transaction(beforeEffect, tx => {
      tx.run("UPDATE coding_sessions SET steps_json = ? WHERE session_id = ?", [steps ? JSON.stringify(steps) : null, sessionId]);
      this.summed(tx, sessionId);
    });
  }

  /** Record the background commands the session has running; null when none. Not a change to the session. */
  async setBackground(beforeEffect: CodingBeforeEffect, _projectId: string, sessionId: string, running: CodingRunningCommand[] | null): Promise<void> {
    await this.db.transaction(beforeEffect, tx => {
      tx.run("UPDATE coding_sessions SET background_json = ? WHERE session_id = ?", [running?.length ? JSON.stringify(running) : null, sessionId]);
      this.summed(tx, sessionId);
    });
  }

  backgroundOf(_projectId: string, sessionId: string): CodingRunningCommand[] | null {
    const row = this.db.get("SELECT background_json FROM coding_sessions WHERE session_id = ?", [sessionId]);
    return typeof row?.background_json === "string" ? JSON.parse(row.background_json) as CodingRunningCommand[] : null;
  }

  stepsOf(_projectId: string, sessionId: string): CodingStepHolders | null {
    const row = this.db.get("SELECT steps_json FROM coding_sessions WHERE session_id = ?", [sessionId]);
    return typeof row?.steps_json === "string" ? JSON.parse(row.steps_json) as CodingStepHolders : null;
  }

  async setState(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, state: CodingSessionState, at: string, guard?: CodingWriteGuard): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET state = ?, updated_at = ? WHERE session_id = ?", [state, at, sessionId]);
      this.summed(tx, sessionId);
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
      if (rename && record.title === rename.from) tx.run("UPDATE coding_sessions SET title = ? WHERE session_id = ?", [rename.to, sessionId]);
      tx.run("UPDATE coding_sessions SET state = 'running', updated_at = ? WHERE session_id = ?", [at, sessionId]);
      this.summed(tx, sessionId);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async rename(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, title: string, at: string): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET title = ?, updated_at = ? WHERE session_id = ?", [title, at, sessionId]);
      this.summed(tx, sessionId);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async archive(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, at: string, guard?: CodingWriteGuard, archived = true): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      // Archiving an archived session (or restoring an active one) is refused, never a silent success.
      if (sessionIn(tx, projectId, sessionId).archived === archived) throw codingStoreErrors.session_unknown(archived ? "会话已归档" : "会话没有归档");
      tx.run("UPDATE coding_sessions SET archived = ?, updated_at = ? WHERE session_id = ?", [archived ? 1 : 0, at, sessionId]);
      this.summed(tx, sessionId);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  /** Attaching a Goal is optional and reversible; passing null detaches. */
  async setGoal(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, goalId: string | null, at: string,
    guard?: CodingWriteGuard): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      guard?.();
      sessionIn(tx, projectId, sessionId);
      tx.run("UPDATE coding_sessions SET goal_id = ?, updated_at = ? WHERE session_id = ?", [goalId, at, sessionId]);
      this.summed(tx, sessionId);
      return sessionIn(tx, projectId, sessionId);
    });
  }

  async setRuntimeSession(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, runtimeSessionId: string, at: string): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      const current = sessionIn(tx, projectId, sessionId);
      if (typeof runtimeSessionId !== "string" || !runtimeSessionId.trim() || current.runtime_session_id !== null && current.runtime_session_id !== runtimeSessionId)
        throw codingStoreErrors.session_binding_conflict("原执行会话已经固定，不能改绑或清空");
      if (current.runtime_session_id === runtimeSessionId) return current;
      tx.run("UPDATE coding_sessions SET runtime_session_id = ?, updated_at = ? WHERE session_id = ?", [runtimeSessionId, at, sessionId]);
      this.summed(tx, sessionId);
      return sessionIn(tx, projectId, sessionId);
    });
  }
}

/** Session states in which a round is under way or waits on the person. */
export const CODING_ACTIVE_STATES = ["running", "paused", "waiting-answer", "waiting-approval", "reconcile-required", "queued"] as const satisfies readonly CodingSessionState[];

/** A session the person may have to come back to, as the list of background work shows it. */
export interface CodingBackgroundSession {
  session_id: string;
  runtime_session_id?: string;
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
      ...(typeof row.runtime_session_id === "string" ? { runtime_session_id: row.runtime_session_id } : {}),
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
