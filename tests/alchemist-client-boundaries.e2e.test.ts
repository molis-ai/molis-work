import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, renderAlchemistWorkbench } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

// Production client, lifecycle, Kernel, Studio HTTP and SQLite; model replies are controlled, no live accounts.
// W2-18-ALCHEMIST-UI-01; W2-18-ALCHEMIST-UI-02; W2-18-ALCHEMIST-PARTIAL-01.
test("W2-18-ALCHEMIST-UI-01/02 and PARTIAL-01: object selection, unavailable publication and mount lifetime", { timeout: 90_000 }, async t => {
  const chrome = locateTestChrome(); if (!chrome) { t.skip("Chrome is required"); return; }
  const home = await mkdtemp(join(tmpdir(), "alchemist-client-boundaries-")), f = alchemistFixture(home);
  const { direction } = await f.bound.invoke(f.actions.directionCreate, { description: "Interview evidence for an independent founder", title: "Original direction" });
  const receipt = await f.bound.invoke(f.actions.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const exploration = (await f.bound.invoke(f.actions.explorationGet, { id: receipt.runId })).exploration;
  const { idea } = await f.bound.invoke(f.actions.cardKeep, { id: exploration.cards[0]!.id });
  const { plan } = await f.bound.invoke(f.actions.researchPlan, { id: idea.id, ideaVersion: 1, lens: "market_space", modelPolicy: "auto", budget: { kind: "calls", limit: 3 } });
  await f.bound.invoke(f.actions.researchStart, { id: idea.id, lens: "market_space", planId: plan.id }); await f.runtime.runPending();
  const report = (await f.bound.invoke(f.actions.researchGet, { id: idea.id, version: 1 })).lenses.market_space.report!;
  const { annotation } = await f.bound.invoke(f.actions.annotationCreate, { target: { kind: "lens_report", objectId: report.id, revision: report.revision, blockId: "summary" }, quotedSnapshot: report.summary, comment: "Check original interview evidence" });
  const { proposal } = await f.bound.invoke(f.actions.playbookPropose, { id: annotation.id, methodChange: "Use original interview quotations", positiveExamples: ["Direct evidence"], negativeExamples: ["Marketing"], scopeKind: "direction" });
  const { rule } = await f.bound.invoke(f.actions.proposalApply, { id: proposal.id });
  const { direction: other } = await f.bound.invoke(f.actions.directionCreate, { description: "Another direction with a queued background run", title: "Other direction" });
  await f.bound.invoke(f.actions.explorationStart, { id: other.id });
  const requests: string[] = [];
  let block: { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> } | undefined;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0;font-family:system-ui}${ALCHEMIST_STYLES}</style></head><body>
    ${renderAlchemistWorkbench({ primitives: { escape: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"), text: value => value } })}
    <script src="/client.js"></script></body></html>`;
  const script = `window.mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();window.boot=()=>(${ALCHEMIST_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,translate:value=>value,route:()=>'/api/v1',projectId:()=> 'a'});document.querySelector('[data-alchemist=workbench]').hidden=false;boot();`;
  const server = createServer(async (request, response) => {
    const path = request.url || "/"; requests.push(`${request.method} ${path}`);
    if (path === "/" || path === "/client.js") { response.writeHead(200, { "content-type": path === "/" ? "text/html; charset=utf-8" : "text/javascript" }); response.end(path === "/" ? html : script); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await f.runtime.app.request(`http://localhost${path}`, { method: request.method, headers: { "content-type": "application/json" }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    if (path === "/api/v1/bootstrap" && block) { const wait = block; block = undefined; wait.entered.resolve(); await wait.release.promise; }
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(Buffer.from(await result.arrayBuffer()));
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => { block?.release.resolve(); await browser?.close(); server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())); await f.close(); await rm(home, { recursive: true, force: true }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address === "object");
  browser = await ChromeHarness.start(home, { executable: chrome, startTimeoutMs: 20_000 });
  const { targetId } = await browser.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async <T = unknown>(expression: string) => {
    const r = await browser!.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  const waitFor = (expression: string) => evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(${expression})resolve(true);else if(Date.now()>end)reject(new Error('condition timed out'));else setTimeout(check,25)};check()})`);
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const select = (id: string) => evaluate(`document.querySelector('[data-alchemist=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(id)}}}))`);
  await browser.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` }, sessionId);
  await waitFor("document.querySelector('[data-alc-open=direction]')");
  await evaluate("document.querySelector('[data-alc-collection=ideas]').click();document.querySelector('[data-alc-search]').value='nothing matches';document.querySelector('[data-alc-search]').dispatchEvent(new Event('input'))");
  await select(direction.id);
  await waitFor(`JSON.parse(document.querySelector('[data-alchemist=workbench]').dataset.assistantContext).object?.id===${JSON.stringify(direction.id)}`);
  assert.equal(await evaluate("document.querySelector('[data-alc-search]').value"), "");
  const delayed = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }; block = delayed; t.after(() => delayed.release.resolve());
  await select(other.id); await delayed.entered.promise; await select(direction.id); delayed.release.resolve(); await pause(100);
  assert.equal(await evaluate("document.querySelector('[data-alc-title]').textContent"), direction.title, "late object load never replaces the latest selection");
  await select(idea.id); await waitFor("document.querySelector('[data-alc-action=market]')");
  await evaluate("document.querySelector('[data-alc-action=market]').click()");
  await waitFor("document.querySelector('[data-alc-action=reuse-publish]')?.disabled===true");
  assert.match(await evaluate<string>("document.querySelector('[data-alc-footer]').textContent"), /成果入口尚未连接/);
  await evaluate("document.querySelector('[data-alc-action=plan]').click()");
  await waitFor(`document.querySelector('[name=reuse-method][value=${JSON.stringify(rule.id)}]')?.checked`);
  await evaluate("document.querySelector('[data-alc-form]').requestSubmit()");
  await waitFor("document.querySelector('[data-alc-dialog] h2').textContent==='确认开始研究'");
  assert.ok((await f.bound.invoke(f.actions.researchGet, { id: idea.id, version: 1 })).lenses.market_space.plan?.reuse?.methods.some(method => method.id === rule.id), "method selection reaches the actual saved plan");
  assert.equal(requests.some(request => request.endsWith("/reuse/publish")), false);
  await evaluate("document.querySelector('[data-alc-dialog] [data-alc-action=close]').click()"); await select(direction.id);
  const reads = () => requests.filter(request => request === "GET /api/v1/bootstrap").length;
  await evaluate("window.root=document.querySelector('[data-alchemist=workbench]');window.parentNode=root.parentElement;root.hidden=true"); await pause(50);
  const hidden = reads(); await pause(2100); assert.equal(reads(), hidden, "hidden queued runs do not poll");
  await evaluate("root.hidden=false"); await waitFor("document.querySelector('[data-alc-open=direction]')"); await pause(200);
  assert.equal(reads(), hidden + 1, "return performs one authoritative refresh");
  await evaluate("root.remove()"); await pause(50); const detached = reads();
  await evaluate("document.dispatchEvent(new CustomEvent('molis-work:model-ready'))"); await pause(100); assert.equal(reads(), detached);
  await evaluate("parentNode.append(root);boot();boot()"); await pause(200); assert.equal(reads(), detached + 1, "only one mount refreshes");
  const remounted = reads(); await evaluate("document.dispatchEvent(new CustomEvent('molis-work:model-ready'))"); await pause(200); assert.equal(reads(), remounted + 1);
});
