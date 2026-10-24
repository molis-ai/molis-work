import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome, resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";
import { codingSessions } from "./fixtures/coding-sessions.js";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// W2-18-CODING-LIFETIME-01: the original global effect listener must be gone after detach/remount.
test("Coding stops hidden polling and releases every client listener before the same DOM is mounted again", { timeout: 45_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const { command, sessionId, evaluate, waitFor, click, navigate, origin, projectId } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)));
    window.codingRequests=[];const originalFetch=window.fetch;
    window.fetch=(input,init)=>{const path=String(input?.url||input);if(path.includes('/api/plugins/io.molis.work.coding/'))codingRequests.push({path,method:init?.method||'GET'});return originalFetch(input,init);};
  ` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("codingRequests.some(request=>request.path.endsWith('/state'))");
  await child.waitFor("document.querySelector('[data-coding-model] option')");
  await child.evaluate("window.codingRoot=document.querySelector('[data-coding-workbench]');window.codingParent=codingRoot.parentElement;window.lifecycleErrors=[];addEventListener('error',e=>lifecycleErrors.push(e.message));addEventListener('unhandledrejection',e=>lifecycleErrors.push(String(e.reason)))");
  // SYS-15-L1: hiding preserves the actual browsing context, while its polling stops.
  await evaluate("window.originalCodingFrame=document.querySelector('iframe[data-plugin-frame=coding]')");
  await click('[data-plugin-strip] [data-plugin-id="inbox"]');
  await waitFor("document.body.dataset.desktopSurface === 'inbox'");
  await pause(100);
  const hiddenReads = await evaluate<number>("codingRequests.length");
  await pause(5500);
  assert.equal(await evaluate("codingRequests.length"), hiddenReads, "hidden Coding does not keep state or review polling alive");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await waitFor("document.body.dataset.desktopSurface === 'coding'");
  assert.equal(await evaluate("document.querySelector('iframe[data-plugin-frame=coding]') === originalCodingFrame"), true, "the same isolated page is restored");
  await child.waitFor("!document.body.hidden");
  await waitFor(`codingRequests.length > ${hiddenReads}`);
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const detachedReads = await evaluate<number>("codingRequests.length"); await pause(1200);
  assert.equal(await evaluate("codingRequests.length"), detachedReads);
  await child.evaluate(`(() => {
    codingParent.append(codingRoot);
    const mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();
    window.remountCoding=()=>(${CODING_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,translate:globalThis.L,openItem:()=>{}});
    remountCoding();remountCoding();
  })()`);
  await waitFor(`codingRequests.length > ${detachedReads}`);
  await child.click('[data-coding-new]');
  await waitFor("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length===1");
  await child.waitFor("document.querySelector('[data-coding-session]')");
  await pause(100);
  assert.equal(await evaluate("codingRequests.filter(request=>request.method==='POST'&&request.path.endsWith('/sessions')).length"), 1, "one user click creates one session after remount");
  const id = await child.evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  // FIX79-LIFETIME: create() already selects the detail; return through the real visible directory control.
  // That control only exists in the narrow layout (container molis-coding ≤ 760px); the default 800px window
  // gives a ~772px container, so pin a narrow window instead of depending on the browser's default size.
  await command("Emulation.setDeviceMetricsOverride", { width: 720, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await child.waitFor("document.querySelector('[data-coding-directory-back]').getClientRects().length > 0");
  await child.click('[data-coding-directory-back]');
  await child.waitFor("codingRoot.dataset.codingDetail === 'false'");
  await child.click(`[data-coding-session="${id}"]`);
  await waitFor(`codingRequests.some(request=>request.path.includes('/sessions/${id}?window=6'))`);
  await evaluate("window.effectReads=codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(250);
  assert.equal(await evaluate(`codingRequests.slice(effectReads).filter(request=>request.path.includes('/sessions/${id}?window=1')).length`), 1, "only the live instance responds to the effect");
  await child.evaluate("codingRoot.remove()"); await pause(100);
  const absent = await evaluate<number>("codingRequests.length");
  await evaluate(`window.dispatchEvent(new CustomEvent('molis:assistant-effect',{detail:{capability_id:'coding.sessions.update',session_id:${JSON.stringify(id)}}}))`);
  await pause(200);
  assert.equal(await evaluate("codingRequests.length"), absent, "no old closure performs a request after detach");
  assert.deepEqual(await evaluate("lifecycleErrors"), []);
  assert.deepEqual(await child.evaluate("lifecycleErrors"), []);
});

test("Coding archives a nonempty conversation after cancel and lost response, retaining its decision across real server process restarts", { timeout: 120_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  let modelCalls = 0; const modelRequests: Array<{ aside: boolean }> = [];
  const answer = "归档前保存的项目讨论内容。";
  const model = createServer(async (request, response) => {
    modelCalls++; let raw = ""; for await (const chunk of request) raw += chunk;
    const aside = asideReply(raw); modelRequests.push({ aside: aside !== null && aside !== undefined });
    const result = cogniaModelResponse(aside ?? answer);
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { processServer: true }); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "coding");
  const { command, sessionId, evaluate, click, navigate, origin, projectId, homeDirectory } = browser;
  assert.ok(projectId); assert.ok(browser.restartServer);
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => {
      const created = store.createToken({ serviceId: "model-api", displayName: "archive-local", token: "fixture-local-model-key" });
      store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "archive-local", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  const workspace = join(homeDirectory, "archive-discussion"); await mkdir(workspace);
  const fill = (selector: string, value: string, page: Pick<typeof child, "evaluate"> = child) => page.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const sessions = codingSessions(browser.store);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.archiveTraffic=[];window.restoreTraffic=[];window.loseArchiveResponse=true;window.loseRestoreResponse=true;const archiveFetch=window.fetch;
    window.fetch=async(input,init)=>{
      const request=new Request(input,init),path=request.url,method=request.method;
      if(!path.includes('/api/plugins/io.molis.work.coding/sessions/'))return archiveFetch(input,init);
      const body=['PATCH','POST'].includes(method)?await request.clone().text():null;
      const entry=path.endsWith('/archive-preview')||body&&JSON.parse(body).archive?{path,method,body}:null;
      if(entry)archiveTraffic.push(entry);
      const restoring=path.endsWith('/unarchive-preview')||path.endsWith('/unarchive')?{path,method,body}:null;
      if(restoring)restoreTraffic.push(restoring);
      const response=await archiveFetch(input,init);
      if(entry){entry.status=response.status;entry.result=await response.clone().json();}
      if(restoring){restoring.status=response.status;restoring.result=await response.clone().json();}
      if(restoring&&method==='POST'&&response.ok&&loseRestoreResponse){loseRestoreResponse=false;throw new Error('restore response lost after commit');}
      if(body&&JSON.parse(body).archive&&response.ok&&loseArchiveResponse){loseArchiveResponse=false;throw new Error('archive response lost after commit');}
      return response;
    };` }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await browser.setViewport(1360, 900);
  await click('.navigator-project-settings');
  await browser.waitFor("document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click('[data-directory-panel=project-settings] [data-settings-section=workspaces]');
  await browser.waitFor("document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await fill('[data-project-workspaces-add] [name=path]', workspace, browser);
  await click('[data-project-workspaces-add] [type=submit]');
  await browser.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('archive-discussion')");
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await child.waitFor("document.querySelector('[data-coding-new]')");
  await child.click('[data-coding-new]');
  await child.waitFor("document.querySelector('[data-coding-session]')");
  const id = await child.evaluate<string>("document.querySelector('[data-coding-session]').dataset.codingSession");
  await child.waitFor("!document.querySelector('[data-coding-task]').disabled && document.querySelector('[data-coding-model]').options.length > 0");
  await fill('[data-coding-model]', JSON.stringify(["archive-local", "fixture"]));
  await fill('[data-coding-intent]', "discuss");
  await fill('[data-coding-task]', "讨论项目归档后的保存行为");
  await child.click('[data-coding-send]');
  await child.waitFor(`document.querySelector('[data-coding-turns]').textContent.includes(${JSON.stringify(answer)}) && document.querySelector('[data-coding-session="${id}"] .coding-session-state')?.dataset.state === 'done'`, 60_000);
  const saved = sessions.get(projectId, id); assert.ok(saved.runtime_session_id);
  // Saving and loading the nonempty conversation must survive an exited Host process, before archive starts.
  t.diagnostic(`saved conversation restart: ${JSON.stringify(await browser.restartServer())}`);
  await browser.reloadPage(); await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await child.waitFor(`document.querySelector('[data-coding-session="${id}"]')`);
  await child.click(`[data-coding-session="${id}"]`);
  await child.waitFor(`document.querySelector('[data-coding-turns]').textContent.includes(${JSON.stringify(answer)})`);
  await child.click('[data-coding-attach-toggle]');
  await child.click('[data-coding-context-toggle]');
  await child.click('[data-coding-archive]');
  await child.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open || document.querySelector('[data-coding-status]').dataset.error==='true'");
  assert.equal(await child.evaluate("Boolean(document.querySelector('[data-page-dialog=confirm]')?.open)"), true, await child.evaluate("document.querySelector('[data-coding-status]').textContent"));
  assert.equal(await evaluate("archiveTraffic.filter(x=>x.method==='GET').length"), 1);
  await child.click('[data-page-dialog] button[type=button]');
  assert.equal(await evaluate("archiveTraffic.filter(x=>x.method==='PATCH').length"), 0, "cancel dispatches no archive");
  assert.deepEqual(sessions.get(projectId, id), saved, "cancel preserves the persisted nonempty session");
  await child.click('[data-coding-archive]');
  await child.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open");
  await child.click('[data-page-dialog] button[type=submit]');
  await child.waitFor("document.querySelector('[data-coding-status]').dataset.error==='true' && !document.querySelector('[data-coding-archive]').disabled");
  const original = await evaluate<string>("archiveTraffic.find(x=>x.method==='PATCH').body");
  const request = JSON.parse(original);
  assert.equal(request.archive, true); assert.equal(request.archive_decision.mode, "runtime");
  assert.deepEqual(request.archive_decision.binding, { runtime_id: saved.runtime_id, session_id: saved.runtime_session_id });
  const archived = sessions.get(projectId, id); assert.equal(archived.archived, true);
  await child.click('[data-coding-archive]');
  await browser.waitFor("archiveTraffic.filter(x=>x.method==='PATCH').length===2 && archiveTraffic.filter(x=>x.method==='PATCH')[1].status");
  assert.equal(await evaluate("archiveTraffic.filter(x=>x.method==='PATCH')[1].status"), 200, JSON.stringify(await evaluate("archiveTraffic.filter(x=>x.method==='PATCH')[1].result")));
  try { await child.waitFor("document.querySelector('[data-coding-status]').textContent.includes('已归档')"); }
  catch (error) { throw new Error(await child.evaluate<string>("document.querySelector('[data-coding-status]').textContent"), { cause: error }); }
  assert.deepEqual(await evaluate("archiveTraffic.filter(x=>x.method==='PATCH').map(x=>x.body)"), [original, original]);
  assert.equal(await evaluate("archiveTraffic.filter(x=>x.method==='GET').length"), 2, "retry does not replace the confirmed request with a new preview");
  assert.deepEqual(sessions.get(projectId, id), archived, "the original request retry does not change the business timestamp");
  t.diagnostic(`completed archive restart: ${JSON.stringify(await browser.restartServer())}`);
  await navigate(() => command("Page.reload", {}, sessionId));
  await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await child.waitFor("document.querySelector('[data-coding-new]')");
  assert.equal(await child.evaluate(`Boolean(document.querySelector('[data-coding-session="${id}"]'))`), false, "the archived row stays out of the reopened list");
  const restored = await child.evaluate(`fetch(document.querySelector('[data-coding-workbench]').dataset.codingPrefix + '/api/plugins/io.molis.work.coding/sessions/${id}/archive-preview').then(async response=>({status:response.status,body:await response.json()}))`) as { status: number; body: { archive_decision: unknown } };
  assert.equal(restored.status, 200); assert.deepEqual(restored.body.archive_decision, request.archive_decision, "read-only preview confirms the persisted canonical archive and original decision after another process restart");
  const callsBeforeRestore = modelCalls;
  const evidence = reviewEvidenceUrl("coding-restore/"); await mkdir(evidence, { recursive: true });
  const picture = async (name: string) => writeFile(new URL(name, evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await child.click('[data-coding-archived] summary');
  await child.waitFor(`document.querySelector('[data-coding-restore="${id}"]')`);
  await child.click(`[data-coding-restore="${id}"]`);
  await child.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open");
  assert.equal(await child.evaluate("document.querySelector('[data-page-dialog]').textContent.includes('旧任务不会自动继续')"), true);
  await picture('restore-desktop.png');
  await child.click('[data-page-dialog] button[type=button]');
  assert.equal(await evaluate("restoreTraffic.filter(x=>x.method==='POST').length"), 0);
  assert.deepEqual(sessions.get(projectId, id), archived);
  // Real business commit fault, after the SDK has accepted the fixed original.
  browser.store.db.exec("CREATE TRIGGER coding_restore_fault BEFORE UPDATE OF archived ON coding_sessions WHEN OLD.archived=1 AND NEW.archived=0 BEGIN SELECT RAISE(ABORT, 'restore business commit unavailable'); END");
  await child.click(`[data-coding-restore="${id}"]`);
  await child.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open");
  await child.click('[data-page-dialog] button[type=submit]');
  await child.waitFor("document.querySelector('[data-coding-status]').dataset.error==='true'");
  const fixed = await evaluate<string>("restoreTraffic.find(x=>x.method==='POST').body");
  assert.deepEqual(sessions.get(projectId, id), archived);
  assert.equal(sessions.lifecycle.current(projectId, id)?.completed, false);
  assert.ok(await evaluate("restoreTraffic.find(x=>x.method==='POST').status>=400"));
  browser.store.db.exec("DROP TRIGGER coding_restore_fault");
  t.diagnostic(`pending restore restart: ${JSON.stringify(await browser.restartServer())}`);
  await evaluate("localStorage.setItem('molis-work:theme','dark')"); await browser.setViewport(390, 844);
  await browser.reloadPage(); await click('[data-plugin-strip] [data-plugin-id="coding"]');
  assert.equal(modelCalls, callsBeforeRestore, "restarting without opening history makes no model call");
  await child.waitFor("document.querySelector('[data-coding-archived] summary')");
  await child.click('[data-coding-archived] summary');
  await child.waitFor(`document.querySelector('[data-coding-restore="${id}"]')`);
  await child.click(`[data-coding-restore="${id}"]`);
  await child.waitFor("document.querySelector('[data-page-dialog=confirm]')?.open");
  assert.equal(await child.evaluate("(()=>{const r=document.querySelector('[data-page-dialog] button[type=submit]').getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight})()"), true, "restore confirmation remains reachable on the narrow screen");
  await picture('restore-phone-dark.png');
  await child.click('[data-page-dialog] button[type=submit]');
  await child.waitFor("document.querySelector('[data-coding-status]').dataset.error==='true' && !document.querySelector('[data-coding-restore]').disabled");
  assert.equal(await evaluate("restoreTraffic.find(x=>x.method==='POST').body"), fixed, "new process preview retains the durable original");
  await child.click(`[data-coding-restore="${id}"]`);
  await child.waitFor("document.querySelector('[data-coding-status]').textContent.includes('已恢复')");
  assert.deepEqual(await evaluate("restoreTraffic.filter(x=>x.method==='POST').map(x=>x.body)"), [fixed, fixed]);
  assert.deepEqual(sessions.get(projectId, id), { ...archived, archived: false });
  assert.equal(sessions.lifecycle.current(projectId, id)?.completed, true);
  assert.equal(modelCalls, callsBeforeRestore, "recovery neither starts a model nor resumes an old task");
  t.diagnostic(`completed restore restart: ${JSON.stringify(await browser.restartServer())}`);
  await browser.reloadPage(); await click('[data-plugin-strip] [data-plugin-id="coding"]');
  await child.waitFor(`document.querySelector('[data-coding-session="${id}"]')`);
  assert.equal(modelCalls, callsBeforeRestore, "restored availability and a new Host alone do not invoke a model");
  await child.click(`[data-coding-session="${id}"]`);
  await child.waitFor(`document.querySelector('[data-coding-turns]').textContent.includes(${JSON.stringify(answer)})`);
  assert.equal(modelCalls, callsBeforeRestore, "restoration and reopening history must not trigger a model");
  t.diagnostic(JSON.stringify({ historyReadKnowledgeAsideCalls: modelRequests.slice(callsBeforeRestore).filter(request => request.aside).length }));

});
