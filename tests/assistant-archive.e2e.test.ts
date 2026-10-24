import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openHomeSqliteDatabase, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { standInKey } from "./fixtures/first-model-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("AST-MEM-ARCH-UI-01/02/03/04: real work archive cancels, retries the original SDK decision and restores after a new Host process", { timeout: 150_000 }, async t => {
  const model = await startModelStandIn(standInKey, "原工作已经整理好，历史继续保留。"); t.after(() => model.close());
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { processServer: true }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory, setViewport, restartServer } = browser;
  assert.ok(restartServer);
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => { const saved = store.createToken({ serviceId: "model-api", displayName: "UI local model", token: standInKey }); store.assertTarget(saved.connection_id, "model-api", model.origin); return saved; });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "ui-local", display_name: "UI local model", base_url: model.baseUrl,
      api_format: "openai-chat-completions", models: [{ model_id: "fixture-model", enabled: true }] });
  }));
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `if(!localStorage.getItem('molis-work:theme'))localStorage.setItem('molis-work:theme','light');window.lifecycleRequests=[];const originalFetch=window.fetch.bind(window);window.fetch=async(url,init)=>{
    const response=await originalFetch(url,init);if(new URL(String(url),location.origin).pathname.match(/\\/works\\/[^/]+\\/archive(?:-preview)?$/))
      window.lifecycleRequests.push({url:String(url),method:init?.method||'GET',input:init?.body?JSON.parse(init.body):null,status:response.status,body:await response.clone().json()});return response;};` }, sessionId);
  await setViewport(1440, 960);
  const url = `${origin}/projects/${projectId}/?desktop=1`;
  await navigate(() => command("Page.navigate", { url }, sessionId));
  await click("[data-assistant-input]"); await command("Input.insertText", { text: "整理一份有内容的归档说明" }, sessionId); await click("[data-assistant-send]");
  const base = `/projects/${projectId}/api/assistant`;
  await waitFor("document.querySelector('[data-assistant-work-state]')?.textContent==='已完成' && document.querySelector('.assistant-round-status')?.dataset.phase==='completed'", 30_000);
  const read = () => evaluate<{ work: { work_id: string; session_id: string; revision: number; archived: boolean }; rounds: unknown[] }>(`fetch(${JSON.stringify(base)}+'/works/'+window.testWorkId).then(r=>r.json())`);
  await evaluate(`fetch(${JSON.stringify(base + "/works")}).then(r=>r.json()).then(b=>window.testWorkId=b.works[0].work_id)`);
  const before = await read(); assert.ok(before.work.session_id); assert.ok(before.rounds.length);
  const workId = before.work.work_id;
  const db = openHomeSqliteDatabase(homeDirectory, "assistant"); t.after(() => db.close());
  const stored = () => db.prepare("SELECT body FROM assistant_works WHERE work_id=?").get(workId)?.body;
  const beforeStored = stored();
  const evidence = reviewEvidenceUrl("assistant-archive/"); await mkdir(evidence, { recursive: true });
  const picture = async (name: string) => writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  const open = async () => { await click("[data-assistant-works-toggle]"); await waitFor(`document.querySelector('[data-assistant-archive-action="${workId}"]')`); await click(`[data-assistant-archive-action="${workId}"]`); await waitFor("document.querySelector('[data-assistant-archive-confirm]:not([disabled])')"); };
  await open();
  assert.equal(await evaluate("document.documentElement.dataset.theme"), "light");
  await picture("confirm-desktop.png");
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-archive-dialog]').textContent"), /归档工作|保留历史和记忆/);
  await click("[data-assistant-archive-dialog] .mw-btn--secondary");
  assert.equal(await evaluate("document.activeElement.matches('[data-assistant-works-toggle]')"), true);
  assert.equal(await evaluate<number>("window.lifecycleRequests.filter(r=>r.method==='POST').length"), 0);
  assert.equal(stored(), beforeStored, "cancel preserves every persisted field of the actual original Work");
  try {
    db.exec("CREATE TRIGGER refuse_ui_archive BEFORE UPDATE ON assistant_works WHEN json_extract(NEW.body,'$.archived')=1 BEGIN SELECT RAISE(ABORT,'UI Work CAS refused'); END");
    await open(); await click("[data-assistant-archive-confirm]");
    await waitFor("document.querySelector('[data-assistant-archive-confirm]')?.textContent==='按原决定重试'");
    const failed = await evaluate<{ input: { revision: number; session_id: string; archived: boolean; decision: { expected_version: number; operation_id: string } }; status: number }>("window.lifecycleRequests.filter(r=>r.method==='POST')[0]");
    assert.equal(failed.input.session_id, before.work.session_id); assert.equal(failed.input.revision, before.work.revision); assert.equal(failed.input.archived, true); assert.notEqual(failed.status, 200);
    assert.equal((await read()).work.archived, false, "the Work never reports the SDK-only partial result as complete");
    db.exec("DROP TRIGGER refuse_ui_archive");
    await click("[data-assistant-archive-confirm]"); await waitFor("!document.querySelector('[data-assistant-archive-dialog]') && document.querySelector('[data-assistant-work-state]')?.textContent==='已归档'");
    assert.deepEqual(await evaluate("window.lifecycleRequests.filter(r=>r.method==='POST')[1].input"), failed.input, "retry retains the complete original request");
    const restoredPreview = await evaluate<{ decision: { expected_version: number } }>(`fetch(${JSON.stringify(base + "/works/" + workId + "/archive-preview?archived=false")}).then(r=>r.json())`);
    assert.equal(restoredPreview.decision.expected_version, failed.input.decision.expected_version + 1, "the real SDK archive committed only once");
  } finally { db.exec("DROP TRIGGER IF EXISTS refuse_ui_archive"); }
  assert.equal((await read()).work.archived, true);
  const models = model.requests.length;
  const restarted = await restartServer(); assert.notEqual(restarted.before, restarted.after);
  await evaluate("localStorage.setItem('molis-work:theme','dark')");
  await navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('[data-assistant-works-toggle]')");
  await waitFor("document.querySelector('[data-assistant-input]')?.readOnly && !document.querySelector('[data-assistant-target-wrap]')?.hidden");
  await click("[data-assistant-target]"); await click("[data-assistant-works-toggle]");
  await waitFor(`document.querySelector('[data-assistant-works] [data-work-id="${workId}"]')`);
  await click(`[data-assistant-works] [data-work-id="${workId}"]`);
  await waitFor("document.querySelector('[data-assistant-work-state]')?.textContent==='已归档'");
  await evaluate(`window.testWorkId=${JSON.stringify(workId)}`);
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').readOnly"), true);
  assert.deepEqual((await read()).rounds, before.rounds);
  await setViewport(390, 844); await open();
  assert.equal(await evaluate("document.documentElement.dataset.theme"), "dark");
  await picture("restore-phone-dark.png");
  const reachable = await evaluate("(() => {const d=document.querySelector('[data-assistant-archive-dialog]').getBoundingClientRect(), b=document.querySelector('[data-assistant-archive-confirm]').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;})()");
  assert.equal(reachable, true, "the real confirmation footer remains reachable at phone width");
  await click("[data-assistant-archive-confirm]");
  await waitFor("!document.querySelector('[data-assistant-archive-dialog]') && document.querySelector('[data-assistant-work-state]')?.textContent!=='已归档'");
  const after = await read(); assert.equal(after.work.archived, false); assert.equal(after.work.session_id, before.work.session_id); assert.deepEqual(after.rounds, before.rounds);
  assert.equal(model.requests.length, models, "archive, retry and explicit restore start no new model round");
  const invalid = await evaluate<{ status: number; code: string }>(`fetch(${JSON.stringify(base + "/works?archived=invalid")}).then(async r=>({status:r.status,code:(await r.json()).code}))`);
  assert.deepEqual(invalid, { status: 400, code: "assistant.invalid" });
});
