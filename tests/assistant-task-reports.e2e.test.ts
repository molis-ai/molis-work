import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { addProjectPlugin, createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { attentionChanged } from "@molis-ai/molis-work-app-local-host";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./fixtures/review-evidence.js";
import { openWork, sendBrowser, waitWork, type SendBrowser } from "./fixtures/assistant-send-journey.js";
import { partitionLibraryFile } from "./fixtures/plugin-home-stores.js";

// Batch 97 (specs/post-anticorruption-roadmap/reference/batches/97.md), as the person sees it: two Images generations
// no conversation started end together in one project; its main conversation gets one round that only reports, listing both, and
// the person is told of each once. Another project's end goes to that project's own main conversation.

async function mainConversation(browser: SendBrowser, projectId: string) {
  const sent = await browser.evaluate<{ work: { work_id: string } }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/send`)}, { method: 'POST', headers: molisWorkControlHeaders(),
    body: JSON.stringify({ text: '你好', request_id: crypto.randomUUID(), main: true, scope: { kind: 'project', project_id: ${JSON.stringify(projectId)} } }) }).then(r => r.json())`);
  await waitWork(browser, sent.work.work_id, view => view.work.state === "completed");
  return sent.work.work_id;
}

/** Images enabled in the project and started there, so its library in the partition exists (batch 108: each partition keeps its own). */
async function withImages(browser: SendBrowser, projectId: string) {
  await addProjectPlugin(browser.web, projectId, "images");
  const status = await browser.evaluate<number>(`fetch(${JSON.stringify(`/projects/${projectId}/api/plugins/io.molis.work.images/jobs`)}, { headers: molisWorkControlHeaders() }).then(r => r.status)`);
  assert.equal(status, 200, "Images runs in the project");
}

/** Generations the person started on the Images page, ended now: what Images' own runner writes when a generation settles. */
function endImages(home: string, projectId: string, jobs: Array<{ id: string; prompt: string; status: "succeeded" | "failed" }>) {
  const db = new DatabaseSync(partitionLibraryFile(home, projectId, "images"));
  try {
    const now = new Date().toISOString(), created = new Date(Date.now() - 60_000).toISOString();
    for (const job of jobs) db.prepare(`INSERT INTO jobs(id,request_id,input_hash,connection_id,connection_name,api_format,model,prompt,size,aspect_ratio,status,images_json,error,created_at,finished_at,runner_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`).run(job.id, `r-${job.id}`, "h", "c", "厂商", "openai-images", "m1", job.prompt, "1024x1024", "1:1", job.status,
      job.status === "succeeded" ? JSON.stringify([{ id: `${job.id}-1`, mime_type: "image/png", byte_length: 1, filename: `${job.id}.png` }]) : "[]", job.status === "failed" ? "厂商拒绝了这个提示" : "", created, now);
  } finally { db.close(); }
  attentionChanged(projectId);
}

test("RRC-01 RRC-02 WRB-01 WRB-02 WRB-04: two generations ending together in a project are one report round in its main conversation, each told once; another project's is its own", { timeout: 180_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { projectId, homeDirectory, web } = browser;
  assert.ok(projectId, "the journey has a project");
  // Images is in both projects before their main conversations start, as it was when Images ran in the Home (adding it after: BL-task-report-plugin-added-later).
  await withImages(browser, projectId);
  const other = (await createProject(web, "另一个项目")).project_id;
  await withImages(browser, other);
  const main = await mainConversation(browser, projectId);
  const otherMain = await mainConversation(browser, other);

  endImages(homeDirectory, projectId, [{ id: "img-a", prompt: "海边的灯塔", status: "succeeded" }, { id: "img-b", prompt: "雪山日出", status: "failed" }]);
  endImages(homeDirectory, other, [{ id: "img-c", prompt: "城市夜景", status: "succeeded" }]);

  const reported = await waitWork(browser, main, view => view.rounds.length === 2 && view.work.state === "completed");
  const round = reported.rounds[1]!;
  assert.equal(round.written_by, "host", "the Host wrote it, not the person");
  const said = round.turns?.find(turn => turn.kind === "user")?.text ?? "";
  assert.match(said, /2 项后台任务[\s\S]*「海边的灯塔」已经办完[\s\S]*「雪山日出」没有办成[\s\S]*只汇报/u, "one round lists both results");
  assert.doesNotMatch(said, /城市夜景/u, "the other project's end is not in it");
  const otherReport = await waitWork(browser, otherMain, view => view.rounds.length === 2 && view.work.state === "completed");
  assert.match(otherReport.rounds[1]!.turns?.find(turn => turn.kind === "user")?.text ?? "", /^（Molis 转告）后台任务「城市夜景」已经办完/u, "its own round, told as one always was");

  // Each task told once, by its own notice (kept by the task's key; the page's list hides those of the conversation in front).
  const kept = new DatabaseSync(join(homeDirectory, "assistant", "assistant.db"), { readOnly: true });
  try {
    const told = kept.prepare("SELECT work_id FROM assistant_notices WHERE dedupe LIKE 'task-report-%' ORDER BY work_id").all().map(row => String(row.work_id));
    assert.deepEqual(told, [main, main, otherMain].sort());
    // RRC-01 RRC-02 on the real path: the round the Host started to report is stored with its mark; the person's own first round is not.
    const marks = (workId: string) => kept.prepare("SELECT body FROM assistant_rounds WHERE work_id=? ORDER BY position").all(workId)
      .map(row => (JSON.parse(String(row.body)) as { report_only?: unknown }).report_only ?? null);
    assert.deepEqual(marks(main), [null, true], "the report's round carries report_only, the person's does not");
    assert.deepEqual(marks(otherMain), [null, true]);
  } finally { kept.close(); }
  // What the person sees in the main conversation: the forwarded results as the Host's words, then one reply.
  await openWork(browser, main);
  const host = "[...document.querySelectorAll('[data-assistant-thread] .assistant-msg--host')]";
  await browser.waitFor(`${host}.some(node => node.textContent.includes('海边的灯塔') && node.textContent.includes('雪山日出'))`, 20_000);
  assert.equal(await browser.evaluate<number>(`${host}.filter(node => node.textContent.includes('海边的灯塔') || node.textContent.includes('雪山日出')).length`), 1, "both in one forwarded message, not two");
  assert.ok(await browser.evaluate<number>("document.querySelectorAll('[data-assistant-thread] .assistant-msg--assistant').length") >= 2, "the report has its reply under it");
  if (shouldSaveReviewScreenshots()) {
    const output = reviewEvidenceUrl("batch-97/"); await mkdir(output, { recursive: true });
    const { data } = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
    await writeFile(new URL("report-two-tasks-1440.png", output), Buffer.from(data, "base64"));
  }

  // What was told is not told again: a later end in the project gets a round of its own that lists only it.
  endImages(homeDirectory, projectId, [{ id: "img-d", prompt: "森林小屋", status: "succeeded" }]);
  const later = await waitWork(browser, main, view => view.rounds.length === 3 && view.work.state === "completed");
  const laterSaid = later.rounds[2]!.turns?.find(turn => turn.kind === "user")?.text ?? "";
  assert.match(laterSaid, /^（Molis 转告）后台任务「森林小屋」已经办完/u, "only the new end, told as one");
  assert.doesNotMatch(laterSaid, /海边的灯塔|雪山日出/u, "the two told before are not told again");
});
