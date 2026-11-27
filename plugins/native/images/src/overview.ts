import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE, type OverviewBackgroundTaskRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { overviewRows, type OverviewRowsWriter } from "@molis-ai/molis-work-plugin-sdk";
import { ENDED_SHOWN_MS } from "./background.js";
import type { ImageJob } from "./contract.js";

/**
 * Images' rows in the platform's overview table (specs/unified-partition-plugins §6.1, V17, batch 108): one `background_task` row per
 * generation the Home's list of background work shows, written in the same transaction as the job. A running generation is under way; one
 * that ended stays a row for {@link ENDED_SHOWN_MS}, long enough for the personal assistant to tell the person once (`reports_to`), then
 * goes the next time Images writes a row. A stopped one is not news and has no row. The step words and the stop command are read on the page.
 */
export function imagesOverviewRow(job: ImageJob, now = Date.now()): OverviewBackgroundTaskRow | null {
  const open = { surface: "images", id: job.id }, title = [...(job.prompt.trim() || job.model)].slice(0, 500).join("");
  if (job.status === "running") return { row_id: job.id, title, state: "generating", waiting: false, started_at: job.created_at, updated_at: job.created_at, reports_to: "assistant", open };
  if (job.finished_at === null || now - Date.parse(job.finished_at) > ENDED_SHOWN_MS) return null;
  if (job.status === "succeeded") return { row_id: job.id, title, state: "done", waiting: false, started_at: job.created_at, updated_at: job.finished_at, reports_to: "assistant", open };
  if (job.status === "failed" || job.status === "interrupted") return { row_id: job.id, title, state: "failed", waiting: false, started_at: job.created_at, updated_at: job.finished_at, reports_to: "assistant", open };
  return null;
}

/** Writes (or removes) the row of `job` in the transaction `db` belongs to, and drops the rows of generations that ended too long ago. */
export function writeImagesOverview(db: OverviewRowsWriter, job: ImageJob, now = Date.now()): void {
  db.run(`DELETE FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task' AND state IN ('done', 'failed') AND updated_at < ?`, [new Date(now - ENDED_SHOWN_MS).toISOString()]);
  const row = imagesOverviewRow(job, now), rows = overviewRows(db);
  if (!row) {
    rows.remove("background_task", job.id);
    return;
  }
  if (!db.get(`SELECT 1 AS found FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task' AND row_id = ?`, [job.id])
    && Number((db.get(`SELECT count(*) AS total FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task'`) as { total: number }).total) >= OVERVIEW_ROW_LIMIT) {
    const room = (db.get(`SELECT row_id FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task' AND state IN ('done', 'failed') ORDER BY updated_at, row_id LIMIT 1`) as { row_id: string } | undefined)
      ?? (db.get(`SELECT row_id FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task' ORDER BY updated_at, row_id LIMIT 1`) as { row_id: string } | undefined);
    if (!room) return;
    rows.remove("background_task", room.row_id);
  }
  rows.upsert("background_task", row);
}

export function removeImagesOverview(db: OverviewRowsWriter, jobId: string): void {
  overviewRows(db).remove("background_task", jobId);
}
