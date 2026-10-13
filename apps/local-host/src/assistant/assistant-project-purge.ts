import { existsSync } from "node:fs";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { AssistantRelations } from "./assistant-relations.js";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME, type StoredWork } from "./assistant-store.js";

/** What only a running Assistant can do for a work that is going away. */
export interface AssistantProjectLive {
  /** Stops the round the work is running. A work with nothing running is fine. */
  stop(workId: string): Promise<void>;
  /** Removes a timed follow-up and cancels what the runtime queued for it. */
  dropFollowUp(followUpId: string): Promise<void>;
}

/** Everything a work keeps under its id, the work last. Usage counts stay: they are numbers the daily cap is read from. */
const WORK_TABLES = ["assistant_rounds", "assistant_cards", "assistant_notices", "assistant_followups", "assistant_undos", "assistant_jobs",
  "assistant_unsettled", "assistant_observed", "assistant_requests", "assistant_works"] as const;

/**
 * The project is deleted: the Assistant's works that belong to it go, with their rounds, cards, notices, follow-ups,
 * background jobs (a job nobody follows is looked at no more), undo steps and the relations they recorded. A running
 * Assistant also stops the round a work is still running and cancels the timed rounds the runtime queued for it. The
 * conversation itself is the runtime's session record, which the Agent Host offers no way to delete. Works on the
 * library's file, so a process without the Assistant clears the rows too; running it again finds nothing.
 * Returns how many works went.
 */
export async function purgeAssistantProject(home: string, projectId: string, live?: AssistantProjectLive): Promise<number> {
  if (!existsSync(homeSqlitePath(home, ASSISTANT_STORE_NAME))) return 0;
  const db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const works = (db.prepare("SELECT body FROM assistant_works WHERE json_extract(body, '$.project_ref.project_id') = ? OR json_extract(body, '$.scope.project_id') = ?")
      .all(projectId, projectId) as Array<{ body: string }>).map(row => JSON.parse(row.body) as StoredWork);
    if (!works.length) return 0;
    if (live) {
      for (const work of works) {
        await live.stop(work.work_id).catch(() => undefined);
        for (const row of db.prepare("SELECT followup_id FROM assistant_followups WHERE work_id = ?").all(work.work_id) as Array<{ followup_id: string }>) {
          await live.dropFollowUp(row.followup_id).catch(() => undefined);
        }
      }
    }
    const relations = new AssistantRelations(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const work of works) {
        const identity = { work_id: work.work_id, project_id: work.project_ref?.project_id ?? null };
        for (const related of relations.forWork(identity)) relations.unlink(identity, related.relation, related.object, "项目已删除");
        for (const table of WORK_TABLES) db.prepare(`DELETE FROM ${table} WHERE work_id = ?`).run(work.work_id);
      }
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return works.length;
  } finally { db.close(); }
}
