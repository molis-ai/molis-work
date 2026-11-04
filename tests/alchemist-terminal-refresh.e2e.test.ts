import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, renderAlchemistWorkbench } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

type Direction = { id: string; title: string; description: string };
type Run = { id: string; directionId: string; status: string; errorCode?: string; cards: unknown[] };
type Bootstrap = { directions: Direction[]; explorations: Run[] };
type Job = { jobId: string; directionId?: string; accepted: boolean; status: string };
type Started = { directionId: string; runId: string; jobId: string };
type Read = { phase: string; path: string; received?: boolean; runs?: Array<Pick<Run, "id" | "status">>; jobs?: Job[] };
type Gate = { entered: ReturnType<typeof Promise.withResolvers<void>>; release: ReturnType<typeof Promise.withResolvers<void>> };

// Observe the browser's invocation order before the production client mounts. Every business Response is real and returned
// unchanged. A bootstrap already issued is read before allowing the worker to drain; runs is read only after that drain.
// Runs-first clients need no bootstrap to enter this gate, so the oracle does not require the old concurrent request order.
const observeReads = String.raw`
const originalFetch=window.fetch.bind(window);
const probe=window.terminalProbe={phase:'initial',reads:[],pair:null,started:null};
window.fetch=async(input,options)=>{
  const path=new URL(input,location.href).pathname,phase=probe.phase,pair=probe.pair;
  const tracked=path==='/api/v1/bootstrap'||path==='/api/v1/runs';
  const read=tracked?{phase,path}:null;if(read)probe.reads.push(read);
  if(pair&&path==='/api/v1/bootstrap')pair.bootstrapIssued=true;
  if(pair&&path==='/api/v1/runs'&&!pair.runsIssued){
    pair.runsIssued=true;pair.first=pair.bootstrapIssued?'bootstrap':'runs';
    if(pair.bootstrapIssued)await pair.bootstrapRead.promise;
    await originalFetch('/terminal-drain/'+encodeURIComponent(phase),{method:'POST'});
  }
  const response=await originalFetch(input,options);
  if(read){
    const body=await response.clone().json();
    if(path.endsWith('/bootstrap'))read.runs=body.explorations.map(({id,status})=>({id,status}));
    else read.jobs=body.jobs;
    read.received=true;
    if(pair&&path.endsWith('/bootstrap'))pair.bootstrapRead.resolve();
  }
  if(options?.method==='POST'&&/\/directions\/[^/]+\/explorations$/.test(path)){
    const body=await response.clone().json();probe.started={directionId:decodeURIComponent(path.split('/').at(-2)),runId:body.runId,jobId:body.jobId};
  }
  return response;
};`;

async function terminalFixture(t: TestContext) {
  const chrome = locateTestChrome(); assert.ok(chrome, "the dedicated test Chrome is required");
  const home = await mkdtemp(join(tmpdir(), "alchemist-terminal-refresh-")), f = alchemistFixture(home);
  f.ai.listModels = async () => [];
  const gates = new Map<string, Gate>();
  const markup = renderAlchemistWorkbench({ primitives: {
    escape: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;"), text: value => value,
  } });
  const surface = `<!doctype html><meta charset="utf-8"><style>[hidden]{display:none!important}body{margin:0;font-family:system-ui}${ALCHEMIST_STYLES}</style>${markup}<script src="/client.js"></script>`;
  const script = `${observeReads}\nconst mount=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})();document.querySelector('[data-alchemist=workbench]').hidden=false;(${ALCHEMIST_CLIENT_FACTORY_SCRIPT})({mountPluginClient:mount,translate:value=>value,route:()=>'/api/v1',projectId:()=> 'a'});`;
  const server = createServer(async (request, response) => {
    const path = request.url || "/";
    if (["/", "/surface", "/client.js"].includes(path)) {
      response.writeHead(200, { "content-type": path === "/client.js" ? "text/javascript" : "text/html; charset=utf-8" });
      response.end(path === "/client.js" ? script : path === "/surface" ? surface
        : '<!doctype html><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe data-plugin-frame="alchemist" src="/surface"></iframe>');
      return;
    }
    if (path.startsWith("/terminal-drain/")) {
      const gate = gates.get(decodeURIComponent(path.slice("/terminal-drain/".length)));
      assert.ok(gate, "the terminal read has a named worker gate");
      gate.entered.resolve(); await gate.release.promise;
      if (!response.destroyed) { response.writeHead(204); response.end(); }
      return;
    }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const result = await f.runtime.app.request(`http://localhost${path}`, { method: request.method,
      headers: { "content-type": "application/json" }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    const bytes = Buffer.from(await result.arrayBuffer());
    if (!response.destroyed) { response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(bytes); }
  });
  let browser: ChromeHarness | undefined;
  t.after(async () => {
    for (const gate of gates.values()) gate.release.resolve();
    await browser?.close(); server.closeAllConnections();
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    await f.close(); await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const api = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(origin + "/api/v1" + path, { method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, `studio ${path} returned ${response.status}`); return await response.json() as T;
  };
  browser = await ChromeHarness.start(home, { executable: chrome, startTimeoutMs: 20_000 });
  const current = browser;
  const { targetId } = await current.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await current.command<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async <T = unknown>(expression: string): Promise<T> => {
    const result = await current.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const ui = await pluginFrameBrowser(t, { command: current.command.bind(current), on: current.on.bind(current), evaluate, sessionId }, "alchemist");
  await current.command("Page.navigate", { url: origin }, sessionId);
  await ui.waitFor("document.querySelector('[data-alc-action=new]')&&!document.querySelector('[data-alc-empty]')?.textContent.includes('正在读取')");
  await ui.waitFor("terminalProbe.reads.filter(r=>r.received).length===2");
  return { f, api, ui, async arm(phase: string) {
    const gate: Gate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }; gates.set(phase, gate);
    await ui.evaluate(`terminalProbe.phase=${JSON.stringify(phase)};terminalProbe.pair={bootstrapIssued:false,runsIssued:false,bootstrapRead:Promise.withResolvers()}`);
    return gate;
  } };
}

type Fixture = Awaited<ReturnType<typeof terminalFixture>>;
const description = "A saved direction whose terminal state must reach the currently selected page";

async function createThroughUi(f: Fixture) {
  await f.ui.evaluate("document.querySelector('[data-alc-action=new]').click()");
  await f.ui.waitFor("document.querySelector('[data-alc-dialog]').open");
  await f.ui.evaluate(`document.querySelector('[name=description]').value=${JSON.stringify(description)};document.querySelector('[data-alc-form]').requestSubmit()`);
}

async function backendRun(f: Fixture, started: Started, status: string) {
  const data = await f.api<Bootstrap>("/bootstrap"), run = data.explorations.find(run => run.id === started.runId);
  assert.ok(run, "the exact run is persisted");
  assert.equal(run.directionId, started.directionId); assert.equal(run.status, status);
  const job = (await f.api<{ jobs: Job[] }>("/runs")).jobs.find(job => job.jobId === started.jobId);
  assert.ok(job, "the real start receipt identifies the persisted worker job");
  assert.equal(job.directionId, started.directionId); assert.equal(job.status, status);
  if (status === "failed") { assert.equal(run.errorCode, "alchemist.runtime_not_configured"); assert.deepEqual(run.cards, []); }
  const direction = data.directions.find(direction => direction.id === started.directionId);
  assert.ok(direction); assert.equal(direction.description === description, true, "the original direction input stays in SQLite");
  return direction;
}

async function expectCurrentTerminal(f: Fixture, direction: Direction) {
  try {
    await f.ui.waitFor("document.querySelector('[data-alc-content]')?.innerText.includes('还没有可用模型')&&!document.querySelector('[data-alc-content] .alc-progress')", 12_000);
  } catch (error) {
    const state = await f.ui.evaluate(`(()=>{const el=document.querySelector('[data-alc-content]'),text=el?.innerText||'';return {object:JSON.parse(document.querySelector('[data-alchemist=workbench]').dataset.assistantContext).object?.id,hints:text.split('还没有可用模型').length-1,progress:el?.querySelectorAll('.alc-progress').length,settings:el?.querySelectorAll('a[href="/settings/models"]').length}})()`);
    throw new Error("terminal child DOM did not converge: " + JSON.stringify(state), { cause: error });
  }
  const state = await f.ui.evaluate<{ id: string; titleMatches: boolean; savedInput: boolean; hints: number; settings: number; progress: number; internal: boolean }>(`(()=>{const root=document.querySelector('[data-alchemist=workbench]'),el=root.querySelector('[data-alc-content]'),text=el.innerText;return {id:JSON.parse(root.dataset.assistantContext).object?.id,titleMatches:root.querySelector('[data-alc-title]').textContent===${JSON.stringify(direction.title)},savedInput:text.includes(${JSON.stringify(description)}),hints:text.split('还没有可用模型').length-1,settings:el.querySelectorAll('a[href="/settings/models"]').length,progress:el.querySelectorAll('.alc-progress').length,internal:/alchemist\\.runtime_not_configured|等待执行|失败|这次炼化未完成/.test(text)}})()`);
  assert.equal(state.id, direction.id); assert.equal(state.titleMatches, true); assert.equal(state.savedInput, true);
  assert.equal(state.hints, 1); assert.equal(state.settings, 1); assert.equal(state.progress, 0); assert.equal(state.internal, false);
}

async function finishAtReadGate(t: TestContext, f: Fixture, gate: Gate, phase: string, previous?: Started) {
  let timer: NodeJS.Timeout | undefined;
  try { await Promise.race([gate.entered.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("worker read gate was not entered")), 12_000); })]); }
  finally { clearTimeout(timer); }
  const started = await f.ui.evaluate<Started>("terminalProbe.started"); assert.ok(started?.runId && started.jobId);
  if (previous) { assert.notEqual(started.runId, previous.runId); assert.notEqual(started.jobId, previous.jobId); assert.equal(started.directionId, previous.directionId); }
  await backendRun(f, started, "queued");
  assert.equal((await f.api<{ jobs: Job[] }>("/runs")).jobs.find(job => job.jobId === started.jobId)?.accepted, true);
  const before = await f.ui.evaluate<{ first: string; reads: Read[] }>(`({first:terminalProbe.pair.first,reads:terminalProbe.reads.filter(r=>r.phase===${JSON.stringify(phase)})})`);
  if (before.first === "bootstrap") {
    assert.equal(before.reads.find(read => read.path.endsWith("/bootstrap"))?.runs?.find(run => run.id === started.runId)?.status, "queued", "the older bootstrap really contains this queued run");
  } else { assert.equal(before.first, "runs"); assert.equal(before.reads.some(read => read.path.endsWith("/bootstrap")), false); }
  await f.f.runtime.runPending(); const direction = await backendRun(f, started, "failed");
  assert.equal((await f.api<{ jobs: Job[] }>("/runs")).jobs.find(job => job.jobId === started.jobId)?.accepted, false);
  gate.release.resolve();
  await f.ui.waitFor(`terminalProbe.reads.some(r=>r.phase===${JSON.stringify(phase)}&&r.jobs?.some(j=>j.jobId===${JSON.stringify(started.jobId)}&&!j.accepted))`);
  t.diagnostic(JSON.stringify({ phase, started, first: before.first, earlierBootstrap: before.reads.find(read => read.path.endsWith("/bootstrap"))?.runs?.find(run => run.id === started.runId)?.status,
    backend: "failed", errorCode: "alchemist.runtime_not_configured", cards: 0, newerAccepted: false }));
  await expectCurrentTerminal(f, direction);
  return started;
}

async function pollingToTerminal(f: Fixture) {
  await f.ui.evaluate("terminalProbe.phase='polling';terminalProbe.pair=null");
  await createThroughUi(f);
  await f.ui.waitFor("terminalProbe.started&&JSON.parse(document.querySelector('[data-alchemist=workbench]').dataset.assistantContext).object?.id===terminalProbe.started.directionId&&document.querySelector('[data-alc-content] .alc-progress')&&!document.querySelector('[data-alc-dialog]').open");
  const started = await f.ui.evaluate<Started>("terminalProbe.started");
  await backendRun(f, started, "queued");
  const initial = await f.ui.evaluate<number>("terminalProbe.reads.filter(r=>r.phase==='polling').length");
  // RAC-2755: only a later browser load, with no intervening UI event or Node GET, can satisfy the continuing-poll oracle.
  await f.ui.waitFor(`terminalProbe.reads.filter(r=>r.phase==='polling').slice(${initial}).some(r=>r.jobs?.some(j=>j.jobId===${JSON.stringify(started.jobId)}&&j.accepted))&&terminalProbe.reads.filter(r=>r.phase==='polling').slice(${initial}).some(r=>r.path.endsWith('/bootstrap')&&r.received)`);
  await f.f.runtime.runPending(); const direction = await backendRun(f, started, "failed");
  await expectCurrentTerminal(f, direction);
  const lastRead = await f.ui.evaluate<number>("terminalProbe.reads.length");
  await f.ui.evaluate("new Promise(resolve=>setTimeout(resolve,4000))");
  assert.equal(await f.ui.evaluate("terminalProbe.reads.length"), lastRead, "terminal convergence stops reads for over two 1800ms polling intervals");
  await expectCurrentTerminal(f, direction);
}

async function unacceptedQueued(f: Fixture) {
  const { direction } = await f.api<{ direction: Direction }>("/directions", { description });
  const started = await f.api<Omit<Started, "directionId">>(`/directions/${direction.id}/explorations`, {});
  f.f.runtime.worker.cancel(started.jobId);
  await backendRun(f, { ...started, directionId: direction.id }, "queued");
  assert.equal((await f.api<{ jobs: Job[] }>("/runs")).jobs.find(job => job.jobId === started.jobId)?.accepted, false);
  await f.ui.evaluate(`terminalProbe.phase='unaccepted';terminalProbe.pair=null;document.querySelector('[data-alchemist=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(direction.id)}}}))`);
  await f.ui.waitFor(`JSON.parse(document.querySelector('[data-alchemist=workbench]').dataset.assistantContext).object?.id===${JSON.stringify(direction.id)}&&document.querySelector('[data-alc-action=continue-job]')`);
  const lastRead = await f.ui.evaluate<number>("terminalProbe.reads.length");
  await f.ui.evaluate("new Promise(resolve=>setTimeout(resolve,4000))");
  assert.equal(await f.ui.evaluate("terminalProbe.reads.length"), lastRead, "an unaccepted saved queued run does not keep polling");
  await backendRun(f, { ...started, directionId: direction.id }, "queued");
}

// RAC-2752/2753/2754/2755. The other lifecycle/late-response and recovery oracles remain in the unchanged
// alchemist-client-boundaries and alchemist-resumption files (RAC-2757), run alongside this regression.
test("RAC-2752–2755: real worker terminal state converges in the current child, then stops polling", { timeout: 90_000 }, async t => {
  const f = await terminalFixture(t);
  await t.test("RAC-2752/2753 new direction observes a real queued bootstrap before terminal runs", async sub => {
    const gate = await f.arm("new"); await createThroughUi(f);
    await finishAtReadGate(sub, f, gate, "new");
  });
  // Read the first identity even when its terminal UI assertion failed on the unmodified client.
  const first = await f.ui.evaluate<Started>("terminalProbe.started");
  // Each oracle finishes before this selection: it only prepares the independent retry on the same saved direction,
  // including on the old client whose stale queued drawing disables its retry button. It cannot satisfy either terminal oracle.
  await f.ui.evaluate(`terminalProbe.phase='between';terminalProbe.pair=null;document.querySelector('[data-alchemist=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(first.directionId)}}}))`);
  await f.ui.waitFor("document.querySelector('[data-alc-action=explore]')?.disabled===false");
  await t.test("RAC-2754 re-exploration converges for its own new run", async sub => {
    assert.ok(first);
    const gate = await f.arm("explore"); await f.ui.evaluate("document.querySelector('[data-alc-action=explore]').click()");
    await finishAtReadGate(sub, f, gate, "explore", first);
  });
  await t.test("RAC-2755 accepted work really polls again, reaches terminal and stops", async () => pollingToTerminal(f));
  await t.test("RAC-2755 a saved queued run without worker acceptance waits for explicit continuation", async () => unacceptedQueued(f));
});
