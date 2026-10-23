import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { createLocalRuntime } from "./fixtures/alchemist-runtime.js";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";

async function seed(home: string, projectId: string) {
  const directory = join(home, "alchemist/projects", projectId); await mkdir(directory, { recursive: true });
  const { ai } = controlledAlchemistAi(), runtime = createLocalRuntime({ databasePath: join(directory, "studio.sqlite"), ai, pulseSourceMode: "fixture" });
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    const response = await runtime.app.request("http://localhost/api/v1" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.ok(response.ok, await response.clone().text()); return await response.json() as T;
  };
  try {
    const { direction } = await post<{ direction: { id: string } }>("/directions", { title: "上次的访谈研究", description: "保留上次任务已生成的内容，由我确认后继续" });
    const started = await post<{ jobId: string; runId: string }>(`/directions/${direction.id}/explorations`, {}); await runtime.runPending();
    const response = await runtime.app.request(`http://localhost/api/v1/explorations/${started.runId}`);
    const { exploration } = await response.json() as { exploration: { cards: Array<{ id: string }> } };
    const { idea } = await post<{ idea: { id: string } }>(`/idea-cards/${exploration.cards[0]!.id}/keep`, {});
    const { plan } = await post<{ plan: { id: string } }>(`/ideas/${idea.id}/lenses/market_space/plans`, { ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 1 } });
    const { run } = await post<{ run: { jobId: string } }>(`/ideas/${idea.id}/lenses/market_space/runs`, { planId: plan.id });
    runtime.worker.cancel(run.jobId);
    const now = "2026-01-01T00:00:00.000Z";
    runtime.database.prepare("UPDATE jobs SET status = 'running', lease_owner = 'previous-process', lease_expires_at = ?, checkpoint_json = ? WHERE id = ?")
      .run(now, JSON.stringify({ stage: "call_dispatched", operation: "collecting", callsUsed: 1, previous: { stage: "planning_complete" } }), run.jobId);
    runtime.database.prepare("INSERT INTO job_events (job_id, sequence, type, payload_json, created_at) SELECT ?, COALESCE(MAX(sequence), 0) + 1, 'call_started', ?, ? FROM job_events WHERE job_id = ?")
      .run(run.jobId, JSON.stringify({ operation: "collecting", callsUsed: 1, limit: 1 }), now, run.jobId);
    runtime.database.prepare("UPDATE jobs SET status = 'interrupted' WHERE id = ?").run(started.jobId);
    const { plan: costPlan } = await post<{ plan: { id: string } }>(`/ideas/${idea.id}/lenses/build_cost/plans`, { ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 8 } });
    const { run: costRun } = await post<{ run: { jobId: string } }>(`/ideas/${idea.id}/lenses/build_cost/runs`, { planId: costPlan.id }); runtime.worker.cancel(costRun.jobId);
    runtime.database.prepare("UPDATE jobs SET status = 'interrupted', checkpoint_json = ? WHERE id = ?")
      .run(JSON.stringify({ stage: "call_dispatched", operation: "cross_checking", callsUsed: 3, previous: { stage: "collecting_complete", evidence: [] } }), costRun.jobId);
    for (const [index, operation] of ["collecting", "cross_checking", "cross_checking"].entries()) runtime.database.prepare("INSERT INTO job_events (job_id, sequence, type, payload_json, created_at) SELECT ?, COALESCE(MAX(sequence), 0) + 1, 'call_started', ?, ? FROM job_events WHERE job_id = ?")
      .run(costRun.jobId, JSON.stringify({ operation, callsUsed: index + 1, limit: 8 }), now, costRun.jobId);
    return { directionId: direction.id, ideaId: idea.id, jobId: started.jobId, lensJobId: run.jobId, costJobId: costRun.jobId };
  } finally { await runtime.close(); }
}

test("W5-01-ALC-RES08: restarted UI confirms safe continuation once and explains exhausted original budget", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  const ids = await seed(b.homeDirectory, b.projectId!);
  const { command, sessionId, origin, projectId, navigate } = b;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, b, "alchemist");
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id="alchemist"]');
  await waitFor(`!!document.querySelector('[data-alchemist-id="${ids.directionId}"]')`);
  await click(`[data-alchemist-id="${ids.directionId}"]`);
  await click(`[data-alc-action="continue-job"][data-job="${ids.jobId}"]`);
  await waitFor(`document.querySelector('[data-alc-dialog]')?.open`);
  assert.match(await evaluate<string>("document.querySelector('[data-alc-dialog]').innerText"), /继续上次任务|确认继续/);
  // Hold only delivery of the real response, so the visible form remains busy through two actual clicks.
  await evaluate(`(()=>{const original=window.fetch;window.resumePosts=0;window.releaseResume=null;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).endsWith('/continue')){window.resumePosts++;await new Promise(resolve=>window.releaseResume=resolve);}return response;};})()`);
  await click('[data-alc-submit]');
  await waitFor("window.resumePosts===1");
  assert.equal(await evaluate("document.querySelector('[data-alc-submit]').disabled"), true);
  await evaluate("document.querySelector('[data-alc-submit]').click();window.releaseResume();");
  await waitFor("!document.querySelector('[data-alc-dialog]').open");
  assert.equal(await evaluate("window.resumePosts"), 1);
  // The continuation view carries the job's status (there is no event-stream route); a finished job reports it with `canContinue: false`.
  const continuation = `${origin}/projects/${projectId}/api/alchemist/studio/api/v1/runs/${ids.jobId}/continuation`;
  let status = "";
  for (let attempt = 0; attempt < 100 && status !== "completed"; attempt++) {
    status = ((await (await fetch(continuation)).json()) as { status: string }).status;
    if (status !== "completed") await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(status, "completed");
  await click('[data-alc-collection="ideas"]'); await click(`[data-alchemist-id="${ids.ideaId}"]`);
  await waitFor("!!document.querySelector('[data-alc-action=\"market\"]')");
  await click('[data-alc-action="market"]');
  await waitFor(`!!document.querySelector('[data-alc-action="continue-job"][data-job="${ids.lensJobId}"]')`);
  assert.match(await evaluate<string>("document.querySelector('.alc-progress').innerText"), /等待确认继续/);
  await click(`[data-alc-action="continue-job"][data-job="${ids.lensJobId}"]`);
  await waitFor("document.querySelector('[data-alc-dialog]')?.open");
  assert.match(await evaluate<string>("document.querySelector('[data-alc-dialog]').innerText"), /原预算已用尽/);
  assert.equal(await evaluate("document.querySelector('[data-alc-submit]').hidden"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-alc-dialog]').innerText"), /原预算：1 次 · 已预约：1 次 · 剩余：0 次/);
  assert.equal(await evaluate("window.resumePosts"), 1);
  const directory = join(process.cwd(), ".impeccable/qa/review/alchemist-resumption"); await mkdir(directory, { recursive: true });
  const capture = async (prefix: string) => { for (const [width, height, label] of [[1280, 900, "desktop"], [390, 844, "mobile"]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
    assert.ok(await evaluate<boolean>(`document.documentElement.scrollWidth <= ${width + 1}`));
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${prefix}${label}.png`), Buffer.from(shot.data, "base64"));
  } };
  await capture("exhausted-");
  await click('[data-alc-dialog] [data-alc-action="close"]');
  await click('[data-alc-action="cost"]');
  await waitFor(`!!document.querySelector('[data-alc-action="continue-job"][data-job="${ids.costJobId}"]')`);
  await click(`[data-alc-action="continue-job"][data-job="${ids.costJobId}"]`);
  await waitFor("document.querySelector('[data-alc-dialog]')?.open");
  const explanation = await evaluate<string>("document.querySelector('[data-alc-dialog]').innerText");
  assert.match(explanation, /原预算：8 次 · 已预约：3 次 · 剩余：5 次/);
  assert.match(explanation, /可能已收费；继续可能重复收费/); assert.match(explanation, /fixture\/model/);
  assert.equal(await evaluate("document.querySelector('[data-alc-submit]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-alc-submit]').disabled"), false);
  assert.equal(await evaluate("window.resumePosts"), 1, "reviewing the remaining budget dispatches no task");
  await capture("");
});
