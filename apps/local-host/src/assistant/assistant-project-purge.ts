import { rollbackPreservingError } from "@molis-ai/molis-work-storage";
import { existsSync } from "node:fs";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { ProjectDeletedDeferred } from "../project-deleted-deferred.js";
import { CONVERSATION_ATTACHMENT_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/services/materials";
import type { MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { forgetOwnedAttachments } from "../material-attachments.js";
import { ASSISTANT_ATTACHMENT_OWNER } from "./assistant-attachments.js";
import { assistantReceiptPrefix } from "./assistant-setting-records.js";
import { AssistantRelations } from "./assistant-relations.js";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME, type StoredWork } from "./assistant-store.js";
import { workConnectionsKey } from "./assistant-work-connections.js";

/** What only a running Assistant can do for a work that is going away. */
interface AssistantProjectLive {
  /** Stops the round the work is running. A work with nothing running is fine. */
  stop(workId: string): Promise<void>;
  /** Removes a timed follow-up and cancels what the runtime queued for it. */
  dropFollowUp?(followUpId: string): Promise<void>;
}

/** Everything a work keeps under its id, the work last. Usage counts stay: they are numbers the daily cap is read from. */
const WORK_TABLES = ["assistant_rounds", "assistant_cards", "assistant_notices", "assistant_followups", "assistant_undos",
  "assistant_unsettled", "assistant_observed", "assistant_requests", "assistant_works"] as const;

/** The conversation attachments a stored work or round names (the pictures its rounds sent), by digest. */
function namedAttachments(bodies: Iterable<string>, into = new Map<string, MaterialRef>()): Map<string, MaterialRef> {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (!value || typeof value !== "object") return;
    const ref = value as Partial<MaterialRef>;
    if (ref.subject?.kind === CONVERSATION_ATTACHMENT_SUBJECT_KIND && typeof ref.subject.id === "string") { into.set(ref.subject.id, ref as MaterialRef); return; }
    for (const item of Object.values(value)) visit(item);
  };
  for (const body of bodies) visit(JSON.parse(body));
  return into;
}
const bodiesOf = (db: ReturnType<typeof openBaselineHomeSqlite>, sql: string, ...values: string[]) => (db.prepare(sql).all(...values) as Array<{ body: string }>).map(row => row.body);

/**
 * The project is deleted: the Assistant's works that belong to it go, with their rounds, cards, notices, follow-ups,
 * background jobs (a job nobody follows is looked at no more), undo steps and the relations they recorded. A running
 * Assistant also stops the round a work is still running and cancels the timed rounds the runtime queued for it. The pictures
 * those works' rounds sent go too, unless a work that stays names the same picture (the Assistant keeps them for the Home). The
 * conversation itself is the runtime's session record. Forwarding processes leave this step for the running owner,
 * which can close the work's original permission before removing its rows.
 * Returns how many works went.
 */
export async function purgeAssistantProject(home: string, projectId: string, live?: AssistantProjectLive): Promise<number> {
  if (!existsSync(homeSqlitePath(home, ASSISTANT_STORE_NAME))) return 0;
  const db = openBaselineHomeSqlite(home, ASSISTANT_STORE_NAME, ASSISTANT_STORE_BASELINE);
  try {
    db.exec("PRAGMA busy_timeout = 5000;");
    const works = (db.prepare("SELECT body FROM assistant_works WHERE json_extract(body, '$.project_ref.project_id') = ? OR json_extract(body, '$.scope.project_id') = ?")
      .all(projectId, projectId) as Array<{ body: string }>).map(row => JSON.parse(row.body) as StoredWork);
    if (works.length && !live) throw new ProjectDeletedDeferred("助理需要结束原工作及其权限，运行中的 Molis Work 会接着清理", true);
    for (const work of works) {
      await live!.stop(work.work_id);
      if (live?.dropFollowUp) {
        for (const row of db.prepare("SELECT followup_id FROM assistant_followups WHERE work_id = ?").all(work.work_id) as Array<{ followup_id: string }>) {
          await live.dropFollowUp(row.followup_id);
        }
      }
    }
    const named = namedAttachments(works.flatMap(work => [JSON.stringify(work), ...bodiesOf(db, "SELECT body FROM assistant_rounds WHERE work_id = ?", work.work_id)]));
    const relations = new AssistantRelations(db);
    db.exec("BEGIN IMMEDIATE");
    try {
      const prefix = assistantReceiptPrefix(projectId);
      db.prepare("DELETE FROM assistant_settings WHERE substr(key,1,length(?))=?").run(prefix, prefix);
      for (const work of works) {
        const identity = { work_id: work.work_id, project_id: work.project_ref?.project_id ?? null };
        for (const related of relations.forWork(identity)) relations.unlink(identity, related.relation, related.object, "项目已删除");
        db.prepare("DELETE FROM assistant_settings WHERE actor_id=? AND key=?").run(work.actor_id, workConnectionsKey(work.work_id));
        for (const table of WORK_TABLES) db.prepare(`DELETE FROM ${table} WHERE work_id = ?`).run(work.work_id);
      }
      db.exec("COMMIT");
    } catch (error) { rollbackPreservingError(error, () => db.exec("ROLLBACK")); throw error; }
    if (named.size) {
      const kept = namedAttachments([...bodiesOf(db, "SELECT body FROM assistant_works"), ...bodiesOf(db, "SELECT body FROM assistant_rounds")]);
      await forgetOwnedAttachments(home, ASSISTANT_ATTACHMENT_OWNER, [...named].filter(([id]) => !kept.has(id)).map(([, ref]) => ref));
    }
    return works.length;
  } finally { db.close(); }
}
