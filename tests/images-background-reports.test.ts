import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ENDED_SHOWN_MS, imagesBackgroundTasksOf, imagesOverviewRow } from "@molis-ai/molis-work-plugin-images";
import type { ImageJob } from "@molis-ai/molis-work-plugin-images/contract";

const packOf = (file: string) => { const pack = parseLocalePack(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { file }); assert.ok(pack.ok); return pack.value; };
const NOW = Date.parse("2026-11-15T10:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const job = (id: string, status: ImageJob["status"], finished: number | null, more: Partial<ImageJob> = {}): ImageJob => ({ id, project_id: "p", request_id: `r-${id}`, connection_id: "c", connection_name: "厂商",
  api_format: "openai-images", model: "m1", prompt: `画 ${id}`, size: "1024x1024", aspect_ratio: "1:1", status, images: [], error: "", created_at: ago(30 * 60_000),
  finished_at: finished === null ? null : ago(finished), ...more });

// PWA-155: a generation runs on its own once started, so Images' rows report to the Assistant; one that ended stays a short while
// in an ended state so the Assistant can tell the person once, and one the person stopped is not news.
test("PWA-155 Images' tasks report to the Assistant: a running generation, and one that ended in the last ten minutes, done or failed", t => {
  t.after(installTextForTest({ locale: "zh", packs: [packOf("plugins/native/images/locales/zh.json")] }));
  const { tasks } = imagesBackgroundTasksOf([
    job("running", "running", null),
    job("done", "succeeded", 60_000, { images: [{} as never, {} as never] }),
    job("failed", "failed", 5 * 60_000, { error: "厂商拒绝了这个提示" }),
    job("stale", "succeeded", ENDED_SHOWN_MS + 1),
    job("stopped", "cancelled", 60_000),
  ], NOW);
  assert.deepEqual(tasks.map(task => [task.subject.id, task.state, task.reports_to, task.step?.text, task.details.map(line => line.text), task.commands.map(command => command.role)]), [
    ["running", "generating", "assistant", "正在用 m1 生成", [], ["stop"]],
    ["done", "done", "assistant", "生成好了 2 张", [], []],
    ["failed", "failed", "assistant", "没有生成出来", ["厂商拒绝了这个提示"], []],
  ]);
  assert.equal(tasks[1]!.updated_at, ago(60_000), "an ended row is dated by when it ended: its report key is that end");
});

// UPP-37 (V17): the same rule as the overview row Images writes with the job, in neutral fields only: no step words, no commands.
test("UPP-37 Images' overview rows: a running generation and one ended in the last ten minutes, reporting to the Assistant", () => {
  const rows = [job("running", "running", null), job("done", "succeeded", 60_000), job("failed", "interrupted", 5 * 60_000), job("stale", "succeeded", ENDED_SHOWN_MS + 1),
    job("stopped", "cancelled", 60_000)].map(item => imagesOverviewRow(item, NOW));
  assert.deepEqual(rows.map(row => row && [row.row_id, row.state, row.waiting, row.reports_to, row.title, row.open]), [
    ["running", "generating", false, "assistant", "画 running", { surface: "images", id: "running" }],
    ["done", "done", false, "assistant", "画 done", { surface: "images", id: "done" }],
    ["failed", "failed", false, "assistant", "画 failed", { surface: "images", id: "failed" }],
    null, null,
  ]);
  assert.equal(rows[1]!.updated_at, ago(60_000));
});
