import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { defineBackgroundTasksAction, type BackgroundTask, type BackgroundTaskCollection } from "@molis-ai/molis-work-plugin-sdk";
import type { ImageJob } from "./contract.js";

/**
 * Images' part of the table of background tasks (specs/work-line §6, WLN-39): a generation still waiting on the vendor is a task the
 * person can see and stop from the panel. The rows come from the job records the page reads; stopping is the page's own
 * 「停止本机等待」, as Images' own action. A generation runs on its own once started, so every row reports to the Assistant
 * (`reports_to`, PWA-155): one that ended stays in the table for `ENDED_SHOWN_MS`, long enough for the Assistant to tell the person
 * once; a job a conversation started and follows is that conversation's, and the Assistant does not tell it again. A job the
 * person stopped is not news. After that a finished job is a record on the page, not a task.
 */
export const imagesBackgroundTasks = defineBackgroundTasksAction("images.background.tasks", /* @version action.images.background.tasks */ 1, ["image_job"], "图片生成任务", ["images:read"]);

/** How long a generation that ended is still a row of the table. */
export const ENDED_SHOWN_MS = 10 * 60_000;

export function imagesBackgroundTasksOf(jobs: readonly ImageJob[], now = Date.now()): BackgroundTaskCollection {
  const title = uiText.text("images.page.title");
  const open = { kind: "surface", surface: "images", id: null, title, label: uiText.text("images.background.open") } as const;
  const row = (job: ImageJob, rest: Pick<BackgroundTask, "state" | "step" | "details" | "commands" | "updated_at">): BackgroundTask => ({
    subject: { kind: "image_job", id: job.id }, title: job.prompt.slice(0, 500), waiting: false, started_at: job.created_at, executor: { kind: "plugin", label: title },
    serves: [], scope: "project", decisions: [], open, reports_to: "assistant", ...rest });
  const ended = (job: ImageJob) => job.finished_at !== null && now - Date.parse(job.finished_at) <= ENDED_SHOWN_MS;
  return { source: { surface: "images", title, icon: "image" }, tasks: jobs.flatMap((job): BackgroundTask[] => {
    if (job.status === "running") return [row(job, { state: "generating", updated_at: job.created_at, step: { text: uiText.text("images.background.generating", { model: job.model }) }, details: [],
      commands: [{ role: "stop", action: { capability_id: "images.jobs.cancel", version: /* @version action.images.jobs.cancel */ 1 }, input: { id: job.id }, summary: uiText.text("images.background.stop-summary") }] })];
    if (job.status === "succeeded" && ended(job)) return [row(job, { state: "done", updated_at: job.finished_at!, step: { text: uiText.text("images.background.done", { count: job.images.length }) }, details: [], commands: [] })];
    if ((job.status === "failed" || job.status === "interrupted") && ended(job))
      return [row(job, { state: "failed", updated_at: job.finished_at!, step: { text: uiText.text("images.background.failed") }, details: job.error ? [{ text: job.error.slice(0, 500) }] : [], commands: [] })];
    return [];
  }) };
}
