import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { existsSync } from "node:fs";
import { inspectExistingSqlitePath, homeSqlitePath, openBaselineHomeSqlite, openExistingBaselineSqlite } from "@molis-ai/molis-work-storage";
import { AssistantRelations, identity } from "./assistant-relations.js";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME, type StoredWork } from "./assistant-store.js";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSessionOwner, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ownerOf } from "./assistant-round-start.js";
import type { LedgerConnection } from "../context-ledger-database.js";
import { assistantErrors } from "./assistant-errors.js";

const uncertainWork = () => assistantErrors.conflict("助理保留的工作、项目关联或会话归属无法确认");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Decode only the original identity and association fields used by this owner query, before filtering any Work. */
function projectSessionWork(row: unknown): StoredWork {
  if (!object(row) || typeof row.body !== "string") throw uncertainWork();
  let work: StoredWork;
  try { work = JSON.parse(row.body) as StoredWork; } catch { throw uncertainWork(); }
  if (!object(work) || !text(work.work_id) || work.work_id !== row.work_id || work.actor_id !== row.actor_id
    || work.actor_id !== LOCAL_PERSON_ACTOR_ID || work.revision !== row.revision || !Number.isSafeInteger(work.revision) || work.revision < 1
    || !object(work.scope) || !(work.session_id === null || text(work.session_id))) throw uncertainWork();
  if (work.scope.kind === "project") { if (!text(work.scope.project_id)) throw uncertainWork(); }
  else if (work.scope.kind !== "personal" || "project_id" in work.scope) throw uncertainWork();
  if (work.project_ref !== undefined && (!object(work.project_ref) || !text(work.project_ref.project_id)
    || work.scope.kind === "project" && work.scope.project_id !== work.project_ref.project_id)) throw uncertainWork();
  return work;
}

/** MEM-40-FRAME-06: existing Work facts only; an association does not grant purge authority or redefine ownerOf. */
export function readAssistantProjectSessions(db: Pick<ReturnType<typeof openBaselineHomeSqlite>, "prepare">, projectId: string): Array<{ session: AgentSessionRef; owner: AgentSessionOwner }> {
  if (!text(projectId)) throw uncertainWork();
  const sessions: Array<{ session: AgentSessionRef; owner: AgentSessionOwner }> = [];
  for (const row of db.prepare("SELECT work_id, actor_id, revision, body FROM assistant_works ORDER BY work_id").iterate()) {
    const work = projectSessionWork(row);
    if (work.session_id !== null && (work.project_ref?.project_id === projectId || work.scope.kind === "project" && work.scope.project_id === projectId))
      sessions.push({ session: { runtime_id: "prologue", session_id: work.session_id },
        owner: { project_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: work.actor_id } });
  }
  return sessions;
}

/** Full owner query, including archived Works; project association never changes the Session's actual owner. */
export function assistantProjectSessions(home: string, projectId: string): Array<{ session: AgentSessionRef; owner: AgentSessionOwner }> {
  if (!existsSync(homeSqlitePath(home, ASSISTANT_STORE_NAME))) return [];
  const db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  try {
    return readAssistantProjectSessions(db, projectId);
  } finally { db.close(); }
}

/** What only a running Assistant can do for a work that is going away. */
interface AssistantProjectLive {
  /** Stops the round the work is running. A work with nothing running is fine. */
  stop(workId: string): Promise<void>;
  /** Removes a timed follow-up and cancels what the runtime queued for it. */
  dropFollowUp(followUpId: string): Promise<void>;
}

/** Everything a work keeps under its id, the work last. Usage counts stay: they are numbers the daily cap is read from. */
const WORK_TABLES = ["assistant_rounds", "assistant_cards", "assistant_notices", "assistant_followups", "assistant_undos", "assistant_jobs",
  "assistant_unsettled", "assistant_observed", "assistant_requests", "assistant_works"] as const;

/** The Work aggregate's own rows, shared by project and exact canonical-Session maintenance. Caller owns the transaction. */
export function clearAssistantWorkRows(db: LedgerConnection, workId: string, current: () => void): void {
  for (const table of WORK_TABLES) { current(); db.prepare(`DELETE FROM ${table} WHERE work_id = ?`).run(workId); }
}

export function verifyAssistantWorkRowsAbsent(db: LedgerConnection, workId: string): void {
  for (const table of WORK_TABLES) {
    if (db.prepare(`SELECT 1 FROM ${table} WHERE work_id = ? LIMIT 1`).get(workId)) throw new Error("助理原工作数据尚未清除");
  }
}

/**
 * The project is deleted: the Assistant's works that belong to it go, with their rounds, cards, notices, follow-ups,
 * background jobs (a job nobody follows is looked at no more), undo steps and the relations they recorded. A running
 * Assistant also stops the round a work is still running and cancels the timed rounds the runtime queued for it. The
 * conversation itself is the runtime's session record, cleared by the fixed project-deletion plan first. Works on the
 * library's file, so a process without the Assistant clears the rows too; running it again finds nothing.
 * Returns how many works went.
 */
export async function purgeAssistantProject(home: string, projectId: string, live?: AssistantProjectLive, control?: ProjectDeletionControl): Promise<number> {
  control?.assertCurrent();
  const target = control ? inspectExistingSqlitePath(homeSqlitePath(home, ASSISTANT_STORE_NAME)) : undefined;
  if (target ? !target.exists : !existsSync(homeSqlitePath(home, ASSISTANT_STORE_NAME))) return 0;
  const db = control ? openExistingBaselineSqlite(homeSqlitePath(home, ASSISTANT_STORE_NAME), ASSISTANT_STORE_BASELINE)
    : openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const works = (db.prepare("SELECT body FROM assistant_works WHERE json_extract(body, '$.project_ref.project_id') = ? OR json_extract(body, '$.scope.project_id') = ?")
      .all(projectId, projectId) as Array<{ body: string }>).map(row => JSON.parse(row.body) as StoredWork);
    if (!works.length) return 0;
    if (live) {
      for (const work of works) {
        control?.assertCurrent(); target?.assertCurrent();
        await live.stop(work.work_id).catch(() => undefined);
        control?.assertCurrent(); target?.assertCurrent();
        for (const row of db.prepare("SELECT followup_id FROM assistant_followups WHERE work_id = ?").all(work.work_id) as Array<{ followup_id: string }>) {
          control?.assertCurrent(); target?.assertCurrent();
          await live.dropFollowUp(row.followup_id).catch(() => undefined);
          control?.assertCurrent(); target?.assertCurrent();
        }
      }
    }
    const relations = new AssistantRelations(db);
    control?.assertCurrent(); target?.assertCurrent();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const work of works) {
        const source = identity(work), current = () => { control?.assertCurrent(); target?.assertCurrent(); };
        current(); relations.clearPurge(source, relations.preparePurge(source), current);
        clearAssistantWorkRows(db, work.work_id, () => { control?.assertCurrent(); target?.assertCurrent(); });
      }
      control?.assertCurrent(); target?.assertCurrent();
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return works.length;
  } finally { db.close(); }
}
