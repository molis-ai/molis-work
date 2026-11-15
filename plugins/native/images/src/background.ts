import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { defineBackgroundTasksAction, type BackgroundTaskCollection } from "@molis-ai/molis-work-plugin-sdk";
import type { ImageJob } from "./contract.js";

/**
 * Images' part of the table of background tasks (specs/work-line §6, WLN-39): a generation still waiting on the vendor is a task the
 * person can see and stop from the panel. The rows come from the job records the page reads; stopping is the page's own
 * 「停止本机等待」, as Images' own action. A finished job is a record on the page, not a task.
 */
export const imagesBackgroundTasks = defineBackgroundTasksAction("images.background.tasks", /* @version action.images.background.tasks */ 1, ["image_job"], "图片生成任务", ["images:read"]);

export function imagesBackgroundTasksOf(jobs: readonly ImageJob[]): BackgroundTaskCollection {
  const title = uiText.text("images.page.title");
  return { source: { surface: "images", title, icon: "image" }, tasks: jobs.filter(job => job.status === "running").map(job => ({
    subject: { kind: "image_job", id: job.id }, title: job.prompt.slice(0, 500), state: "generating", waiting: false, started_at: job.created_at, updated_at: job.created_at,
    step: { text: uiText.text("images.background.generating", { model: job.model }) }, details: [], executor: { kind: "plugin", label: title }, serves: [], scope: "project",
    commands: [{ role: "stop", action: { capability_id: "images.jobs.cancel", version: /* @version action.images.jobs.cancel */ 1 }, input: { id: job.id }, summary: uiText.text("images.background.stop-summary") }],
    decisions: [], open: { kind: "surface", surface: "images", id: null, title, label: uiText.text("images.background.open") },
  })) };
}
