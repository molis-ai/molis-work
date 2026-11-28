import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { OVERVIEW_ROW_LIMIT, OVERVIEW_TABLE } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ENDED_SHOWN_MS, IMAGES_DATABASE, ImagesService, imagesBackgroundTasksOf, imagesOverviewRow } from "@molis-ai/molis-work-plugin-images";
import type { ImageJob } from "@molis-ai/molis-work-plugin-images/contract";
import { memoryPluginDatabase } from "./fixtures/plugin-database.js";

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

test("AP-14 writeImagesOverview bounds plugin_overview_rows to OVERVIEW_ROW_LIMIT by evicting oldest rows instead of throwing", async () => {
  const database = memoryPluginDatabase(IMAGES_DATABASE.schema);
  try {
    const insert = database.raw.prepare(`INSERT INTO jobs
      (id, request_id, input_hash, connection_id, connection_name, api_format, model, prompt, size, aspect_ratio, status, images_json, error, created_at, finished_at)
      VALUES (?, ?, ?, 'c', '厂商', 'openai-images', 'm1', ?, '1024x1024', '1:1', 'running', '[]', '', ?, NULL)`);
    const baseMs = Date.now() - 120_000;
    for (let i = 0; i <= OVERVIEW_ROW_LIMIT; i += 1) {
      const id = `job-${String(i).padStart(4, "0")}`;
      insert.run(id, `req-${id}`, `hash-${id}`, `画 ${id}`, new Date(baseMs + i * 100).toISOString());
    }
    const service = new ImagesService({
      projectId: "p", installationGeneration: "images-test-generation", database, connections: {} as never, files: {} as never, imageGeneration: {} as never, background: {} as never,
    });
    await service.recover({ beforeEffect: async () => {} });
    const rows = database.raw.prepare(`SELECT row_id FROM ${OVERVIEW_TABLE} WHERE kind = 'background_task' ORDER BY row_id`).all() as Array<{ row_id: string }>;
    assert.equal(rows.length, OVERVIEW_ROW_LIMIT, "overview rows stay bounded at OVERVIEW_ROW_LIMIT");
    assert.equal(rows.some(row => row.row_id === "job-0000"), false, "oldest ended row is evicted");
    assert.equal(rows.some(row => row.row_id === `job-${String(OVERVIEW_ROW_LIMIT).padStart(4, "0")}`), true, "501st row is persisted");
  } finally {
    database.close();
  }
});
