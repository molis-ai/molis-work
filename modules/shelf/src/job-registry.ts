import path from "node:path";
import type { ShelfJobRecord } from "./contract.js";
import type { CatalogFile } from "./catalog.js";
import { shelfErrors } from "./errors.js";

/** The runs this process has under way, so a job the process never finished stops blocking once it cannot still be alive. */
export const activeJobs = new Map<string, AbortController>();
export const jobKey = (root: string, jobId: string) => JSON.stringify([path.resolve(root), jobId]);

export function isStaleJob(job: ShelfJobRecord, root: string): boolean {
  return !activeJobs.has(jobKey(root, job.job_id));
}

export function assertNotBusy(catalog: CatalogFile, itemId: string, root: string): void {
  const busy = catalog.jobs.some((job) => (
    job.status === "running"
    && !isStaleJob(job, root)
    && (job.item_ids.includes(itemId) || job.item_id === itemId || job.result_item_id === itemId)
  ));
  if (busy) throw shelfErrors.busy("运行中不能隐藏或删除");
}
