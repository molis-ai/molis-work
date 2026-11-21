import { newPublisher } from './fixtures/sandbox-package.js';
import { packagedStudioRelease } from './fixtures/studio-package.js';
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from './fixtures/review-evidence.js';
import { framedStudioPage, studioHarnessRequests, isolatedStudioHarness } from "./fixtures/studio-framed-page.js";
import { pluginPagesFor, WebSessions } from "@molis-ai/molis-work-app-local-host";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type IncomingMessage } from 'node:http';
import { createSingleHomeTestWebServer } from './fixtures/local-web-core.js';
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer as createHttpsServer, Agent } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import {builderManifest,builderPrivateValueReplicationOwner,builderSyncProjection,studioBuildDiagnostic,type AgentBuild,type AgentRelease} from '@molis-ai/molis-work-plugin-builder';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStudioChrome, dedicatedBuilderBrowser } from './fixtures/plugin-builder-browser.js';
import { agentStudioFixture } from '../scripts/agent-studio-preview-fixture.mjs';
import { STUDIO_HARNESS_PATH } from '../scripts/agent-studio-harness.mjs';
import { LocalProjectDatabase, runWithLocale } from '@molis-ai/molis-work-app-local-host';
import { verifySyncPluginDistribution, seedDemoBoard, DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { handleAgentStudioHttp, installedPluginStages, releaseAgentStudio } from '../apps/local-host/dist/plugin-builder/agent-surface.js';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '@molis-ai/molis-work-app-local-host';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {proveAuthoringSync} from './fixtures/authoring-sync-proof.js';
import { literalStudioExcerpt } from './fixtures/studio-bilingual.js';
import { pluginTextSlot, pluginTextSlotKey } from '@molis-ai/molis-work-design-system';
import { readSandboxPackage } from '@molis-ai/molis-work-app-local-host';

function studioServer(options: Parameters<typeof handleAgentStudioHttp>[3] & { homeDirectory: string }, token: string, mutations: Map<string, LocalMutationState>, setup?: {
  observe?(request: IncomingMessage, response: import('node:http').ServerResponse): void; locale?: 'zh' | 'en'; page?: boolean; languageControls?: true;
  sessions?: WebSessions; intercept?(request: IncomingMessage, response: import('node:http').ServerResponse, url: URL): boolean;
}) {
  const harness = studioHarnessRequests(options.homeDirectory, options.projectId, token, setup?.languageControls ? mutations : undefined, setup?.sessions);
  const server = createServer((request, response) => {
    setup?.observe?.(request, response);
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (setup?.intercept?.(request, response, url)) return;
    harness.handle(request, response, url, options.routePrefix ?? '', (local, proof, locale, preview) => {
      if (setup?.page && url.pathname === STUDIO_HARNESS_PATH) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(isolatedStudioHarness(options.homeDirectory, options.projectId, proof, setup.languageControls ? locale : setup.locale, preview)); return;
      }
      if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
      return pluginPagesFor(options.homeDirectory).bind(request, url).then(release => {
        if (release) response.once('close', release);
        return runWithLocale(setup?.languageControls ? locale : setup?.locale ?? "zh", () => handleAgentStudioHttp(request, response, local, options, proof));
      }).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: 'not found' }); }).catch(error => sendLocalWebJson(response, 403, { error: String(error.message) }));
    });
  });
  server.once('close', harness.close);
  return server;
}

/** Received code remains paused until the user chooses this device's model and explicitly requests all local gates. */
async function resumeTargetStudio(store:LocalProjectDatabase,homeDirectory:string,projectId:string,itemId:string){
  const token=randomUUID()+randomUUID(),mutations=new Map<string,LocalMutationState>();
  const options={store,homeDirectory,projectId,routePrefix:'/projects/'+projectId,...agentStudioFixture(0)};
  const server=studioServer(options,token,mutations);
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+(server.address() as {port:number}).port;
  const get=async()=>await(await fetch(origin+'/api/plugin-builder/studio/builds/'+itemId)).json() as {build:{phase:string;revision:number;active:unknown;error:string|null;history:unknown[]}};
  const post=async(route:string,body:unknown)=>{const response=await fetch(origin+'/api/plugin-builder/studio'+route,{method:'POST',headers:{origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':randomUUID()},body:JSON.stringify(body)});assert.equal(response.status,200,await response.clone().text());return await response.json();};
  try{
    const before=await get();assert.equal(before.build.phase,'paused');assert.equal(before.build.active,null);
    const models=await options.models();await post('/settings',{provider_id:models[0]!.provider_id,model_id:models[0]!.model_id});
    await post('/builds/'+itemId+'/action',{action:'resume',revision:before.build.revision});
    let current=await get();for(let i=0;i<600&&current.build.active;i++){await new Promise(resolve=>setTimeout(resolve,50));current=await get();}
    assert.equal(current.build.phase,'ready',current.build.error??'explicit target checks did not finish');assert.equal(current.build.active,null);
    assert.ok(current.build.history.length,'the real publication journey must retain history to verify explicit undo');await post('/builds/'+itemId+'/action',{action:'undo',revision:current.build.revision});
    current=await get();for(let i=0;i<600&&current.build.active;i++){await new Promise(resolve=>setTimeout(resolve,50));current=await get();}
    assert.equal(current.build.phase,'ready',current.build.error??'target history checks did not finish');assert.equal(current.build.active,null);
  }finally{await releaseAgentStudio(store,projectId);await releaseInstalledPlugins(store,projectId);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}

test('FSS-74 a frozen English design reaches G7 in its own frame and publishes the same two language files', { timeout: 110_000, skip: process.platform !== 'darwin' }, async t => {
  const browserExecutable = dedicatedBuilderBrowser();
  assert.ok(browserExecutable, 'use the separate Studio test browser');
  const home = await mkdtemp(join(tmpdir(), 'molis-studio-locale-g7-')), databasePath = join(home, 'project.db');
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID();
  const projectId = DEMO_PROJECT_ID, routePrefix = '/projects/' + projectId;
  const fixture = agentStudioFixture(0);
  const options = { store, homeDirectory: home, projectId, routePrefix, browserExecutable, ...fixture, async agents(build: Parameters<typeof fixture.agents>[0]) {
    const runtime = await fixture.agents(build);
    return { ...runtime, async run(request: Parameters<typeof runtime.run>[0]) {
      const answer = await runtime.run(request);
      if (request.role !== 'designer' || JSON.parse(request.task).mode !== 'detail') return answer;
      const wire = JSON.parse(answer.output), { design } = wire, page = design.pages[0];
      page.title = { literal: literalStudioExcerpt };
      page.parts.find((part: { id: string }) => part.id === 'title').props.description = { literal: literalStudioExcerpt };
      page.parts.find((part: { id: string }) => part.id === 'notes').props.columns[0].label = { literal: '  原文栏目 <ref>  ' };
      for (const pack of Object.values(design.uiText.locales)) for (const key of ['page/home/title', 'region/home/main/title', 'part/title/description', 'column/notes/expansion/label'])
        Reflect.deleteProperty(pack as object, key);
      design.acceptance[1].steps.push({ action: 'expectWord', componentId: 'title', word: 'description' });
      return { ...answer, output: JSON.stringify(wire) };
    } };
  } };
  const previewLanguages = new Set<string>(), childDesignReads: string[] = [];
  const server = studioServer(options, token, new Map(), { locale: 'en', observe(request) {
    if (request.url?.includes('/studio/preview/') && request.url.includes('acceptance=')) previewLanguages.add(request.headers['accept-language'] ?? '');
    if (request.method === 'GET' && request.headers['x-molis-plugin-page'] && request.url?.includes('/studio/builds/')) childDesignReads.push(request.url);
  } });
  t.after(async () => {
    await releaseAgentStudio(store, projectId); await releaseInstalledPlugins(store, projectId);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const base = origin + routePrefix + '/api/plugin-builder/studio';
  const send = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(base + path, { headers: { origin, 'accept-language': 'en', 'x-molis-work-control-token': token,
      ...(body ? { 'content-type': 'application/json', 'x-molis-work-idempotency-key': randomUUID() } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, path === '/builds' && body ? 201 : 200, await response.clone().text()); return response.json();
  };
  type Build = import('@molis-ai/molis-work-plugin-builder').AgentBuild;
  const model = (await options.models())[0]!;
  await send('/settings', { provider_id: model.provider_id, model_id: model.model_id });
  const { build: created } = await send<{ build: Build }>('/builds', { brief: 'Build an excerpt notebook; save notes and find them later.' });
  const load = () => send<{ build: Build }>('/builds/' + created.id).then(value => value.build);
  const act = (action: string, build: Build, extra = {}) => send<unknown>('/builds/' + build.id + '/action', { action, revision: build.revision, ...extra });
  const stopped = async () => {
    let current = await load();
    for (let i = 0; i < 450 && current.active; i++) { await new Promise(resolve => setTimeout(resolve, 100)); current = await load(); }
    assert.equal(current.active, null, studioBuildDiagnostic(current.error) ?? 'Studio did not stop'); return current;
  };
  const proposals = await stopped(); assert.equal(proposals.phase, 'choosing', studioBuildDiagnostic(proposals.error) ?? '');
  await act('choose', proposals, { candidateId: 'quick' });
  const ready = await stopped();
  assert.equal(ready.phase, 'ready', studioBuildDiagnostic(ready.error) ?? JSON.stringify(ready.browserResult));
  assert.equal(ready.design?.contract.ui?.locales.default, 'en');
  assert.deepEqual(ready.design?.contract.pages[0]?.title, { literal: literalStudioExcerpt });
  assert.deepEqual(ready.design?.parts.find(part => part.id === 'notes')?.props.columns?.[0]?.label, { literal: '  原文栏目 <ref>  ' });
  assert.ok(ready.browserResult?.passed); assert.ok(ready.browserResult.cases.some(item => item.id === 'empty' && item.passed));
  assert.deepEqual([...previewLanguages], ['en']);
  assert.deepEqual(childDesignReads, [], 'the granted preview receives only its view and current words');
  await act('publish', ready);
  const bundle = await send<import('@molis-ai/molis-work-contracts/platform/plugin').PluginPackageBundle>('/builds/' + ready.id + '/download?version=1');
  assert.deepEqual(bundle.payload.manifest.ui.locales, { default: 'en', available: ['zh', 'en'] });
  assert.deepEqual(bundle.payload.files.filter(file => file.path.startsWith('locales/')).map(file => file.path).sort(), ['locales/en.json', 'locales/zh.json']);
  const kept = readSandboxPackage(bundle.payload);
  assert.deepEqual(kept.contract.pages[0]?.regions[0]?.title, { literal: literalStudioExcerpt });
  const field = pluginTextSlotKey(kept.contract.pluginId, pluginTextSlot('field', 'notes.add', 'text', 'label'));
  assert.equal(kept.localePacks?.pack('en')?.messages[field], 'Note');
  const missing = structuredClone(bundle.payload);
  for (const file of missing.files.filter(file => file.path.startsWith('locales/'))) {
    const words = JSON.parse(Buffer.from(file.content_base64, 'base64').toString('utf8'));
    Reflect.deleteProperty(words.messages, field);
    Object.assign(file, { content_base64: Buffer.from(JSON.stringify(words)).toString('base64') });
  }
  assert.throws(() => readSandboxPackage(missing), /界面引用缺少主人默认词/);
});

/**
 * The whole studio journey in a real browser: only the models are labelled stand-ins. Build gates, the Seatbelt
 * sandbox, preview storage, the push channel and the headless acceptance run are the production ones.
 */
test('FSS-74 studio: a request becomes a working, published plugin that the person can use', { timeout: 180_000, skip: process.platform !== 'darwin' }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'molis-studio-e2e-'));
  const home = join(root, 'home');
  const browser = await openStudioChrome(join(root, 'chrome'));
  if (!browser) { await rm(root, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  t.after(async()=>{await browser.close();await rm(root,{recursive:true,force:true});});
  const projectId='project-'+randomUUID();
  const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
  const project=await withMolisWorkProjectCatalog({homeDirectory:home},async catalog=>{const p=await catalog.ensureSyncedProject({project_id:projectId,display_name:'Actual authoring journey',actor_id:'alice'},()=>{});catalog.addProjectPlugin({project_id:p.project_id,plugin_id:'plugin-builder',actor_id:'alice'});return p;});
  const databasePath=project.database_path;seedDemoBoard(databasePath,projectId);
  const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();
  const fixture = agentStudioFixture(0); let modelDelay = 0,modelHold:Promise<void>|null=null,releaseModel=()=>{},modelStarted=()=>{};
  const options = { store, projectId, homeDirectory: home, browserExecutable: dedicatedBuilderBrowser(), routePrefix: "/projects/" + projectId, ...fixture,
    generate: async (pluginId: string, input: { prompt?: string; instructions?: string; input: string }) => {if(modelHold){modelStarted();await modelHold;} await new Promise(resolve => setTimeout(resolve, modelDelay)); return fixture.generate(pluginId, input); } };
  let liveSubscriptions = 0, subscriptions = 0;
  const sessions = new WebSessions(home);
  const gateway = createSingleHomeTestWebServer({ homeDirectory: home, controlToken: token, webSessions: sessions });
  const [webRequest] = gateway.listeners('request'); assert.ok(webRequest);
  await new Promise<void>(resolve => gateway.listen(0, '127.0.0.1', resolve));
  let stopped: Promise<void> | undefined;
  const stopGateway = () => stopped ??= new Promise<void>((resolve, reject) => {
    gateway.close(error => error ? reject(error) : resolve());
    gateway.closeAllConnections();
  });
  // The generated page stays on the Studio fixture's original store and action client. Its submit uses the real Host HTTP fence.
  const server = studioServer(options, token, mutations, { page: true, sessions, intercept(request, response, url) {
    // The page's actions and the install sheet's own route are the real Host's, and so are the style sheets: the sheet is pressed where
    // the product draws it, which the fixture's own short style sheet does not do.
    if (url.pathname !== options.routePrefix + '/api/host/plugin-page-actions' && url.pathname !== options.routePrefix + '/api/host/plugin-page-install'
      && !(url.pathname.startsWith('/assets/') && url.pathname.endsWith('.css'))) return false;
    webRequest.call(gateway, request, response); return true;
  }, observe(request, response) {
    if (request.url?.endsWith("/events")) { liveSubscriptions++; subscriptions++; response.on("close", () => { liveSubscriptions--; }); }
  } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const outer = await browser.page(), page = await framedStudioPage(t, browser, outer), gatewayOrigin = 'http://127.0.0.1:' + (gateway.address() as { port: number }).port;
    // The install sheet is the workbench's, in the outer document: read there, and pressed as a person presses (a real, trusted press).
    const shots = shouldSaveReviewScreenshots() ? reviewEvidenceUrl('studio-install-sheet/') : null;
    if (shots) await mkdir(shots, { recursive: true });
    const sheet = {
      async wait(expression: string, what: string) { for (let n = 0; n < 600; n++) { if (await outer.evaluate<boolean>(`Boolean(${expression})`)) return; await new Promise(resolve => setTimeout(resolve, 50)); } assert.fail(what + ': ' + await outer.evaluate<string>(`document.querySelector('[data-install-sheet]')?.outerHTML.slice(0, 600) ?? 'no sheet'`)); },
      staged(name: string) { return sheet.wait(`document.querySelector('[data-install-sheet]')?.dataset.stage === ${JSON.stringify(name)}`, 'the install sheet reaches ' + name); },
      text() { return outer.evaluate<string>(`document.querySelector('[data-install-sheet]').innerText`); },
      async ready() { await new Promise(resolve => setTimeout(resolve, 700)); await sheet.wait(`document.querySelector('[data-install-sheet]') && !document.querySelector('[data-install-sheet]').hasAttribute('data-unready')`, 'the sheet has held still'); },
      async press(control: string) {
        const point = await outer.evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector('[data-install-sheet] [data-framed-control=${JSON.stringify(control)}]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
        for (const type of ['mousePressed', 'mouseReleased']) await outer.command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
      },
      async shot(name: string) { if (shots) await writeFile(new URL(name + '.png', shots), Buffer.from((await outer.command<{ data: string }>('Page.captureScreenshot', { format: 'png' })).data, 'base64')); },
    };
    await page.viewport(1440, 900);
    await page.command('Page.enable');
    // The studio is drawn in the workbench's stage (specs/artifact-positioning S4): it has no page of its own, framed or not.
    for (const address of ['/plugin-builder/studio', '/plugin-builder/studio?frame=workbench']) {
      const direct = await fetch(origin + address, { redirect: 'manual' });
      assert.equal(direct.status, 404, address); await direct.text();
    }
    await page.command('Page.navigate', { url: origin + STUDIO_HARNESS_PATH });
    await page.wait(`[...document.querySelectorAll('[data-as-model] option')].some(o=>o.value.startsWith('fixture'))`);
    // The models and the canvas load separately; wait for the canvas's own empty state instead of reading it at once.
    await page.wait(`/这里会出现你的插件/.test(document.querySelector('[data-as-empty]')?.innerText || '')`);
    // SYS-15: plugin code cannot read the host DOM or its control credential.
    assert.deepEqual(await page.evaluate(`(()=>{let parentDenied=false;try{void parent.document.body}catch{parentDenied=true}return {parentDenied,token:document.querySelector('meta[name=molis-work-page-session]')?.content??null,ipc:typeof globalThis.__TAURI__};})()`), {parentDenied:true,token:null,ipc:'undefined'});
    assert.equal(await page.evaluate('Math.round(document.querySelector(".as-shell").getBoundingClientRect().top)'), 0, 'nothing pushes the studio down (e.g. an unstyled icon sprite)');

    // Choose the model the build will use, then describe the plugin.
    await page.evaluate(`(()=>{const s=document.querySelector('[data-as-model]');s.value=[...s.options].find(o=>o.value.startsWith('fixture')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await page.wait(`document.querySelector('[data-as-model-note]').textContent.includes('预览替身')`);
    await page.fill('[data-as-input]', '做一个随手记笔记的插件：写下一句话就能保存，最新的在最上面');
    await page.click('.as-send');
    await page.wait(`document.querySelectorAll('[data-as-candidate]').length===2`);
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id="notes"]').dataset.live`), 'false', 'a proposal renders real parts, not wired yet');
    assert.match(await page.evaluate<string>(`getComputedStyle(document.querySelector('[data-component-id="notes"]'),'::before').content`), /功能待接通/, 'and says so while building');

    // Compare, choose, and let the two lines build.
    await page.click('[data-as-candidate="board"]');
    await page.wait(`document.querySelector('[data-as-choose="board"]')`);
    // Record what the UI Agent shows while it places parts: the spec board item it takes, the spot it frames, the part landing.
    await page.evaluate(`(()=>{globalThis.__placing=[];const t0=performance.now();setInterval(()=>{const pick=document.querySelector('[data-as-board] [data-picking]')?.dataset.kind,frame=document.querySelector('[data-as-frame]'),landing=document.querySelector('[data-as-landing]')?.dataset.componentId,ui=document.querySelector('[data-as-pointer="ui"]');
      const code=document.querySelector('[data-as-pointer="code"]'),wiring=document.querySelector('[data-as-board] .as-cap[data-wiring]')?.dataset.cap,ticked=[...document.querySelectorAll('[data-as-board] .as-cap[data-used]')].map(c=>c.dataset.cap).join(',');
      const state=(pick?'pick:'+pick:'')+(landing?' land:'+landing:'')+(frame.hidden?'':' frame:'+frame.dataset.mode)+(ui.hidden?'':' ui:'+ui.querySelector('em').textContent)+(code.hidden?'':' code:'+code.querySelector('em').textContent)+(wiring?' wiring:'+wiring:'')+(ticked?' ticked:'+ticked:'');const last=__placing.at(-1);if(state&&(!last||last[1]!==state))__placing.push([Math.round(performance.now()-t0),state]);},50);})()`);
    await page.click('[data-as-choose="board"]');
    await page.wait(`document.querySelector('[data-as-phase]').textContent==='构建中'`);
    const readyDeadline = Date.now() + 150_000;
    while (true) {
      const state = await page.evaluate<{phase:string;error:string}>(`({phase:document.querySelector('[data-as-phase]').textContent,error:document.querySelector('.as-error')?.innerText??''})`);
      if (state.phase === '可以试用') break;
      assert.notEqual(state.phase, '需要处理', state.error);
      assert.ok(Date.now() < readyDeadline, 'build timeout: ' + state.phase);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    // The replay follows the real steps and may finish after the build is ready: wait for the capability to be ticked.
    await page.wait(`__placing.some(([,state])=>/ticked:[^ ]*model\\.generate/.test(state))`);
    // Each part was taken from the spec board, framed where it goes, then placed — slowly enough to follow.
    const placing = await page.evaluate<Array<[number, string]>>('__placing');
    const landed = [...new Set(placing.flatMap(([, state]) => /land:(\S+)/.exec(state)?.[1] ?? []))];
    assert.ok(landed.length >= 3, 'parts are placed one by one: ' + JSON.stringify(placing.slice(0, 12)));
    assert.ok(placing.some(([, state]) => /^pick:\w+ .*ui:取出「/.test(state)), 'the UI Agent takes each part from the spec board');
    assert.ok(placing.some(([, state]) => /frame:landing .*ui:放入「/.test(state)), 'and frames the spot before the part shows');
    const firstPick = placing.find(([, state]) => state.startsWith('pick:'))![0], lastLanding = placing.filter(([, state]) => state.includes('land:')).at(-1)![0];
    assert.ok(lastLanding - firstPick >= (landed.length - 1) * 1200, 'about two seconds a part, not all at once: ' + (lastLanding - firstPick) + 'ms for ' + landed.length);
    // D22: the code agent takes the model capability from the capability board, carries it to the part, then the board ticks it.
    const take = placing.findIndex(([, state]) => /code:取出能力「/.test(state) && /wiring:model\.generate/.test(state));
    const carry = placing.findIndex(([, state], index) => index > take && /code:接上「/.test(state));
    const tick = placing.findIndex(([, state]) => /ticked:[^ ]*model\.generate/.test(state));
    assert.ok(take >= 0 && carry > take && tick > carry, 'capability wiring is shown in order: ' + JSON.stringify(placing.filter(([, state]) => /code:|wiring|ticked/.test(state)).slice(0, 12)));
    const summary = await page.evaluate<string>(`[...document.querySelectorAll('.as-card')].map(c=>c.innerText).find(t=>t.startsWith('可以试用了'))`);
    assert.match(summary, /4 项功能全部接通 · 门禁 G1–G6 通过 · 界面验收 4\/4 通过/);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-builds]').selectedOptions[0].textContent`), /可以试用/, 'the build selector follows live updates');
    const record = await page.evaluate<string>(`document.querySelector('[data-as-feed]').textContent` /* includes the folded collaboration record */);
    assert.match(record, /Jev · 4 选 1/, 'the collection part was chosen by Jev from the catalog\'s four legal components (directory, card, table, accordion)');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /还没有笔记/, 'acceptance data is cleared before the person tries it');

    // Try it: the form saves through the sandboxed backend and clears; the list shows the record, not JSON.
    await page.click('[data-as-tab="try"]');
    await page.fill('[data-component-id="editor"] [data-field]', '间隔复习比集中复习记得更久');
    await page.click('[data-component-id="editor"] [type=submit]');
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('间隔复习比集中复习记得更久')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id="editor"] [data-field]').value`), '');
    assert.doesNotMatch(await page.evaluate<string>(`document.querySelector('[data-as-plugin]').innerText`), /\{"id"/);
    // The person's own trial reaches the real model (acceptance above used the catalog stand-in).
    const tried = await page.evaluate<string>(`[...document.querySelectorAll('[data-component-id="notes"] [data-record-id]')].find(r=>r.innerText.includes('间隔复习比集中复习记得更久')).dataset.recordId`);
    await page.click(`[data-component-id="notes"] [data-record-id="${tried}"] [data-pc-action=expand]`);
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('（预览替身模型）间隔复习比集中复习记得更久')`);

    // A visual revision uses a separate acceptance namespace and keeps the person's trial records.
    const visualBuildId = await page.evaluate<string>('document.querySelector("[data-as-builds]").value');
    const beforeVisual = await (await fetch(origin + '/projects/' + projectId + '/api/plugin-builder/studio/builds/' + visualBuildId)).json() as { build: { runs: Array<{ role: string }> } };
    await page.evaluate(`(async()=>{const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+${JSON.stringify(visualBuildId)}+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action:'visual',message:'收紧间距，保留完整内容'})});if(!r.ok)throw Error(await r.text())})()`);
    // A visual revision rebuilds and runs the interface acceptance in a browser of its own: on a busy machine that outlasts the default wait.
    await page.wait(`document.querySelector('[data-as-phase]').dataset.phase==='ready'&&!!document.querySelector('[data-pc-open="editor"]')`, { timeoutMs: 90_000 });
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('间隔复习比集中复习记得更久')`);
    const afterVisual = await (await fetch(origin + '/projects/' + projectId + '/api/plugin-builder/studio/builds/' + visualBuildId)).json() as typeof beforeVisual;
    assert.equal(afterVisual.build.runs.filter(run => run.role === 'coder').length, beforeVisual.build.runs.filter(run => run.role === 'coder').length);
    await page.click('[data-as-compare]');
    await page.wait(`document.querySelector('[data-as-plugin]').inert&&!document.querySelector('[data-pc-open="editor"]')`);
    // The previous interface draws its own read of the notes: wait for it, the frame is inert before the rows are back.
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('间隔复习比集中复习记得更久')`);
    await page.click('[data-as-compare]');
    await page.wait(`!document.querySelector('[data-as-plugin]').inert&&!!document.querySelector('[data-pc-open="editor"]')`);

    // Publish once; an unchanged build cannot be published again.
    await page.click('[data-as-action="publish"]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('v1 已是当前版本')`);
    // VUX-26: the feed has the conversation's one scroll owner; nobody scrolled it, so it follows its end.
    await page.wait(`(() => { const feed = document.querySelector('[data-as-feed]'); return feed.dataset.follow === 'following' && feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 1; })()`);

    // PBU-47-8: publishing opens the 安装 tab, and the workbench draws its install sheet in the place the studio left for it: the sheet every
    // plugin page gets, outside the studio's frame. The studio has no consent dialog or install button; it hears only that the plugin is installed.
    await page.wait(`document.querySelector('[data-as-tab="install"]').getAttribute('aria-selected')==='true'&&!document.querySelector('[data-as-install-stage]').hidden`);
    assert.equal(await page.evaluate(`Boolean(document.querySelector('.as-dialog,[data-as-install],[data-as-upgrade],[data-as-uninstall]'))`), false, 'the studio has no install controls of its own');
    await sheet.staged('review');
    assert.match(await sheet.text(), /笔记墙/, 'the sheet names the package the Host verified');
    assert.equal(await outer.evaluate<boolean>(`(() => { const main = document.querySelector('[data-install-sheet] .install-sheet__main'); return !main || main.scrollHeight <= main.clientHeight + 0.5; })()`), true, 'one screen: nothing in the sheet scrolls');
    await sheet.ready();
    await sheet.shot('review');
    // Expanding a note calls the model through a platform capability, a switch that starts off (BL-701): the person turns it on here.
    await sheet.press('tile:capabilities:call');
    await sheet.wait(`document.querySelector('[data-install-sheet] [data-framed-control="tile:capabilities:call"]').dataset.on === 'true'`, 'the model switch is on');
    await sheet.press('confirm');
    await sheet.staged('done');
    await sheet.shot('done');
    await page.wait(`!!document.querySelector('[data-as-open-plugin]')||!!document.querySelector('[role=alert]')`);
    assert.equal(await page.evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`), '', 'installation reports no problem');
    // What is installed is the signed package the studio published, under this Home's own publisher: never an unsigned record of the studio's.
    const legacy = await ensureInstalledPlugins(options), originalRecord = legacy.records()[0]!;
    const published = (await (await fetch(origin + options.routePrefix + '/api/plugin-builder/studio/builds/' + visualBuildId)).json() as { versions: Array<{ distribution?: { publisher_key_id: string } }> }).versions[0]!.distribution!;
    assert.deepEqual([originalRecord.publisher_trust, originalRecord.publisher_signature, originalRecord.version], ['pinned', published.publisher_key_id, '1.0.0']);
    const state = await (await fetch(origin + options.routePrefix + '/api/plugin-builder/studio/builds/' + visualBuildId)).json();
    const scope = await fetch(origin + options.routePrefix + '/api/plugin-builder/studio/builds/' + visualBuildId + '/action', { method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-molis-work-control-token': token, 'x-molis-work-idempotency-key': randomUUID() },
      body: JSON.stringify({ action: 'scope', scope: 'home', revision: state.build.revision }) });
    assert.equal(scope.status, 400); assert.match((await scope.json()).error, /已发布草稿的范围不能改变/);
    // The workbench lists it beside the built-in plugins: one stage framing its installed page.
    const stages = await installedPluginStages(options);
    assert.deepEqual(stages.map(item => [item.label, item.surface.startsWith('app-')]), [['笔记墙', true]]);
    assert.ok(stages[0]!.stage.includes('data-work-surface="' + stages[0]!.surface + '"'));
    assert.match(stages[0]!.stage, /data-plugin-page-source="[^"?]+\/plugins\/[^"?]+\?frame=workbench&amp;installation=/u);
    assert.match(stages[0]!.stage, /data-deferred-surface hidden><script type="application\/json" data-plugin-document>/u);
    assert.doesNotMatch(stages[0]!.stage, /<iframe/u, 'the real workbench owns the opaque frame when this stage opens');
    const boundStagePath = (markup: string) => {
      const source = /data-plugin-page-source="([^"]+)"/u.exec(markup)?.[1]?.replaceAll('&amp;', '&');
      assert.ok(source, 'SCS-11: use the real installed stage address with its edition');
      return source;
    };
    const framedStagePath = boundStagePath(stages[0]!.stage), pluginHref = framedStagePath.split('?')[0]!;
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-open-plugin]').dataset.asOpenPlugin`), stages[0]!.surface, 'the studio opens the installed plugin by its stage');
    const currentStagePath = async () => boundStagePath((await installedPluginStages(options))[0]!.stage);
    const refuseOldStage = async (path: string) => {
      const response = await fetch(origin + path);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, 'actions.provider_changed');
    };
    // Its address opened directly (a link in a notice, say) opens the workbench on that plugin's stage, not a page of its own.
    const directPlugin = await fetch(origin + pluginHref, { redirect: 'manual' });
    assert.equal(directPlugin.status, 302); assert.equal(directPlugin.headers.get('location'), options.routePrefix + '/?openSurface=' + encodeURIComponent(stages[0]!.surface)); await directPlugin.text();
    // The installation runs in the real Host that answered the sheet (the gateway), so its page is that Host's.
    const installedPage = await framedStudioPage(t, browser, await browser.page());
    await installedPage.command('Page.enable');
    await installedPage.command('Page.navigate', { url: gatewayOrigin + framedStagePath });
    await installedPage.wait('globalThis.__molisPluginReady===true');
    // SYS-15: a generated plugin is equally isolated and cannot call the authoring or another plugin API.
    assert.deepEqual(await installedPage.evaluate(`(async()=>{let parentDenied=false;try{void parent.document.body}catch{parentDenied=true}const denied=[];for(const path of ['/api/plugin-builder/studio/state','/api/plugins/io.molis.work.schedule/tasks']){try{const r=await fetch('${options.routePrefix}'+path);denied.push(r.status)}catch{denied.push(403)}}return {parentDenied,token:document.querySelector('meta[name=molis-work-page-session]')?.content??null,denied};})()`), {parentDenied:true,token:null,denied:[403,403]});
    assert.equal(await installedPage.evaluate(`Boolean(document.querySelector('.as-installed-bar, a[href*="/plugin-builder/studio"]'))`), false, 'the frame shows only the plugin: no own header or link back');
    await installedPage.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('还没有笔记')`);
    const oldCallStatus = await installedPage.evaluate<number>(`(async()=>{const r=await fetch(${JSON.stringify(gatewayOrigin + pluginHref.replace('/plugins/', '/api/plugin-builder/installed/') + '/call')},{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({componentId:'notes',binding:'read',payload:{}})});await r.text();return r.status})()`);
    assert.equal(oldCallStatus, 403, 'SYS-15: the installed page cannot POST its component-read body to the retired private alias');
    await installedPage.click('[data-pc-open="editor"]');
    await installedPage.fill('[data-component-id="editor"] [data-field]', '取消这条未提交的内容');
    await installedPage.click('[data-component-id="editor"] dialog[open] .mw-form__footer button[type=button]');
    await installedPage.wait(`!document.querySelector('[data-component-id="editor"] dialog[open]') && document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('还没有笔记')`);
    await installedPage.click('[data-pc-open="editor"]');
    await installedPage.fill('[data-component-id="editor"] [data-field]', '正式使用的第一条');
    await installedPage.click('[data-component-id="editor"] [type=submit]');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('正式使用的第一条')`);
    assert.doesNotMatch(await installedPage.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /间隔复习比集中复习/, 'installed data is separate from the preview');
    await installedPage.command('Page.reload');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    // A model call that takes its time does not hold up the plugin's reads: tests/installed-plugin-policy.test.ts (the Host here has no model).
    // Deleting is a button on the record itself; the one-page plugin shows no page switcher.
    assert.equal(await installedPage.evaluate(`getComputedStyle(document.querySelector('.pc-tabs')).display`), 'none');
    await installedPage.click('[data-pc-open="editor"]');
    await installedPage.fill('[data-component-id="editor"] [data-field]', '这条马上删掉');
    await installedPage.click('[data-component-id="editor"] [type=submit]');
    await installedPage.wait(`[...document.querySelectorAll('[data-record-id]')].some(r=>r.innerText.includes('这条马上删掉'))`);
    const doomed = await installedPage.evaluate<string>(`[...document.querySelectorAll('[data-record-id]')].find(r=>r.innerText.includes('这条马上删掉')).dataset.recordId`);
    await installedPage.click(`[data-record-id="${doomed}"] [data-pc-action=remove]`);
    await installedPage.wait(`!document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('这条马上删掉')`);
    assert.match(await installedPage.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /正式使用的第一条/);

    // Publish the preceding presentation as v2: the 安装 tab offers it as the upgrade of what is installed, on the same sheet, and the data stays.
    await page.evaluate(`(async()=>{const id=${JSON.stringify(visualBuildId)};const act=async(action,extra={})=>{const {build}=await(await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id)).json();const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action,revision:build.revision,...extra})});if(!r.ok)throw Error(await r.text())};await act('undo');await act('publish')})()`);
    await page.command('Page.reload');
    await page.wait(`document.querySelector('[data-as-tab="install"]')?.disabled===false`);
    await page.click('[data-as-tab="install"]');
    await sheet.staged('review');
    assert.match(await sheet.text(), /1\.0\.0[\s\S]*2\.0\.0|2\.0\.0[\s\S]*1\.0\.0/, 'the sheet says which version it upgrades');
    await sheet.ready(); await sheet.shot('upgrade-review'); await sheet.press('confirm'); await sheet.staged('done');
    await refuseOldStage(framedStagePath);
    const upgradedStagePath = await currentStagePath();
    await installedPage.command('Page.navigate', { url: gatewayOrigin + upgradedStagePath });
    await installedPage.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    assert.equal(await installedPage.evaluate(`!!document.querySelector('[data-pc-open="editor"]')`), false, 'v2 uses the preceding inline form');

    // The standalone page reads the same preview data through the same renderer.
    // The open plugin is the one chosen in the studio's own picker (in the workbench the address does not name it).
    const buildId = await page.evaluate<string>(`document.querySelector('[data-as-builds]').value`);
    assert.match(buildId, /^[a-f0-9-]{36}$/);
    const standalone = await framedStudioPage(t, browser, await browser.page());
    await standalone.command('Page.enable');
    const directPreview = await fetch(origin + '/plugin-builder/studio/preview/' + buildId, { redirect: 'manual' });
    assert.equal(directPreview.status, 302); assert.equal(directPreview.headers.get('location'), options.routePrefix + '/?openPlugin=plugin-builder'); await directPreview.text();
    await standalone.command('Page.navigate', { url: origin + '/plugin-builder/studio/preview/' + buildId + '?frame=workbench' });
    await standalone.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('间隔复习比集中复习记得更久')`);

    const installedOwner = await ensureInstalledPlugins(options);
    await releaseAgentStudio(store, projectId);
    await installedPage.command('Page.reload');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    assert.equal(await ensureInstalledPlugins(options), installedOwner, 'closing authoring does not close or recreate installed execution');
    // The lifecycle intentionally suspends hidden views. Re-enter the studio before asking it to render.
    await installedPage.command('Page.close'); await standalone.command('Page.close'); await page.command('Page.bringToFront');
    await page.command('Page.reload');
    // PBU-47-8: an installed plugin is managed where every plugin is. The studio says where (设置 › 插件) and opens the plugin; it has no
    // switch, upgrade, rollback or uninstall of its own, and no consent dialog.
    await page.wait(`!!document.querySelector('[data-as-plugin-settings]')&&!!document.querySelector('[data-as-open-plugin]')`);
    assert.equal(await page.evaluate(`Boolean(document.querySelector('[data-as-install],[data-as-upgrade],[data-as-uninstall],[data-as-install-enable],.as-dialog'))`), false);

    // Narrow screens keep the whole journey without horizontal page scrolling.
    await page.viewport(390, 844, true);
    const overflow = await page.evaluate<string[]>(`[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>391&&r.width>0&&getComputedStyle(e).position!=='fixed'}).slice(0,8).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))`);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=390'), true, overflow.join(' | '));
    const observed = async (predicate: () => boolean) => {
      for (let n = 0; n < 100 && !predicate(); n++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.ok(predicate(), 'expected studio SSE lifecycle on the real HTTP server');
    };
    await observed(() => liveSubscriptions === 1);
    const beforeResume = subscriptions;
    await page.evaluate("document.querySelector('[data-agent-studio]').hidden=true");
    await observed(() => liveSubscriptions === 0);
    await page.evaluate("document.querySelector('[data-agent-studio]').hidden=false");
    await observed(() => liveSubscriptions === 1 && subscriptions === beforeResume + 1);
    await page.wait("document.querySelector('[data-as-builds]')");
    await page.evaluate("document.querySelector('[data-agent-studio]').remove()");
    await observed(() => liveSubscriptions === 0);

    // S-119 PCSYNC-22/23: real generated/published files, actual preview operation, actual Host sync registration.
    const post=async(componentId:string,binding:'read'|'submit',payload:unknown)=>{const response=await fetch(origin+'/api/plugin-builder/studio/builds/'+buildId+'/call',{method:'POST',headers:{'content-type':'application/json',origin,'x-molis-work-control-token':token,'x-molis-work-idempotency-key':randomUUID()},body:JSON.stringify({componentId,binding,payload})});assert.equal(response.status,200,await response.clone().text());return (await response.json() as {value:unknown}).value;};
    // Earlier assertions deliberately undo every visual revision. Create one new real revision, not synthetic history.
    const saved=await(await fetch(origin+'/api/plugin-builder/studio/builds/'+buildId)).json() as {build:{revision:number;active:unknown;phase:string;error:string|null;history:unknown[]}};
    const revision=await fetch(origin+'/api/plugin-builder/studio/builds/'+buildId+'/action',{method:'POST',headers:{origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':randomUUID()},body:JSON.stringify({action:'visual',revision:saved.build.revision,message:'保存一份可以跨设备恢复的真实界面修订'})});assert.equal(revision.status,200,await revision.clone().text());
    let revised=await(await fetch(origin+'/api/plugin-builder/studio/builds/'+buildId)).json() as typeof saved;for(let i=0;i<600&&revised.build.active;i++){await new Promise(resolve=>setTimeout(resolve,50));revised=await(await fetch(origin+'/api/plugin-builder/studio/builds/'+buildId)).json() as typeof saved;}
    assert.equal(revised.build.phase,'ready',revised.build.error??'source revision did not finish');assert.ok(revised.build.history.length);
    // The installed page is finished. The isolated sync check below opens the Home's catalog under its own owner.
    await stopGateway();
    await proveAuthoringSync(t,{home,space,projectId,itemId:buildId,manifest:builderManifest,storage:installedOwner.storage,owner:directory=>builderPrivateValueReplicationOwner({home:directory,verifyDistribution:verifySyncPluginDistribution}),codec:createSyncJsonContent({spaceId:space.spaceId,authorize(){},...builderSyncProjection}),verifyTarget:resumeTargetStudio,call(){
      const started=new Promise<void>(resolve=>{modelStarted=resolve;});modelHold=new Promise<void>(resolve=>{releaseModel=resolve;});
      const settled=(async()=>{await post('editor','submit',{form:{text:'真实预览同步竞争'}});const rows=await post('notes','read',{});assert.ok(Array.isArray(rows)&&rows.length);const row=rows[0] as {id:string};await post('expand','submit',{selection:{notes:{id:row.id}}});})();
      return {started,settled,release(){releaseModel();modelHold=null;modelStarted=()=>{};}};
    }});

  } catch (error) {
    const state = await (await fetch(origin + '/api/plugin-builder/studio/state')).json() as { builds: any[] };
    t.diagnostic(JSON.stringify(state.builds.map(b => ({phase:b.phase,error:b.error,steps:b.steps.slice(-3),browser:b.browserResult}))));

    throw error;
  } finally {
    releaseModel();
    await stopGateway();
    await releaseAgentStudio(store, projectId); await releaseInstalledPlugins(store, projectId);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
  }
});

/**
 * The studio drawn in the English interface, in a real browser: the stage, the phase, the status line, the feed, the empty
 * state, the spec board and the badge the stylesheet draws on a part are all English. What the person and the stand-in
 * models write (the brief, the proposals) is data and stays as it was written.
 */
test('studio in English: its controls, labels, phases and boards are English', { timeout: 120_000, skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'molis-studio-english-'));
  const browser = await openStudioChrome(join(home, 'chrome'));
  if (!browser) { await rm(home, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const databasePath = join(home, 'project.db'); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();
  const fixture = agentStudioFixture(0);
  let rawModelError: string | undefined;
  let revisionMode: 'valid' | 'acceptance' | 'designer' = 'valid', preferenceWrites = 0, buildWrites = 0;
  const diagnostic = 'rework 引用了不存在的操作：原诊断 <tag> 保留';
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, browserExecutable: dedicatedBuilderBrowser(), routePrefix: '/projects/' + DEMO_PROJECT_ID, ...fixture,
    models: async () => { if (rawModelError !== undefined) throw new Error(rawModelError); return fixture.models(); },
    async agents(build: AgentBuild) {
      const agent = await fixture.agents(build);
      return { ...agent, async run(request: Parameters<typeof agent.run>[0]) {
        const answer = await agent.run(request);
        if (revisionMode === 'valid' || request.role !== 'designer' || JSON.parse(request.task).mode !== 'revise') return answer;
        const output = JSON.parse(answer.output);
        if (revisionMode === 'designer') output.rework = [{ op: '原诊断 <tag> 保留', why: 'preserve the raw operation name' }];
        else output.design.acceptance[0].steps.push({ action: 'expectValue', componentId: 'editor', field: 'text', value: 'Unexpected value <raw>' });
        return { ...answer, output: JSON.stringify(output) };
      } };
    } };
  const server = studioServer(options, token, mutations, { page: true, languageControls: true, observe(request) {
    if (request.method !== 'POST') return;
    if (request.url === '/api/ui/locale') preferenceWrites += 1;
    if (request.url?.includes('/api/plugin-builder/studio/builds')) buildWrites += 1;
  } });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  // The labels that interpolate original names have exact assertions below. Other Studio words are checked together.
  const DATA = 'select,[class*="mw-select-picker"],.as-plugin,[data-as-title],[data-as-model-note],.as-pointer em,.as-frame span,.as-brief p,.as-candidates,.as-card,.as-recent,.as-cap,.as-cap-row,[data-as-step-copy],.as-steps [translate="no"]:not([data-as-collaboration-copy])';
  const chrome = `(()=>{const HAN=/\\p{Script=Han}/u,shell=document.querySelector('.as-shell'),found=[];
    for(const el of shell.querySelectorAll('*')){if(el.closest('${DATA},[hidden]'))continue;for(const a of ['aria-label','title','placeholder'])if(!(a==='title'&&el.closest('.as-gates'))&&HAN.test(el.getAttribute(a)||''))found.push(a+'='+el.getAttribute(a));}
    const walker=document.createTreeWalker(shell,NodeFilter.SHOW_TEXT);for(let n;n=walker.nextNode();){if(n.parentElement.closest('${DATA},[hidden]'))continue;if(HAN.test(n.textContent))found.push('text:'+n.textContent.trim()+' <'+n.parentElement.tagName+'.'+n.parentElement.className+'>');}
    return found;})()`;
  try {
    const outer = await browser.page(), page = await framedStudioPage(t, browser, outer);
    await page.viewport(1440, 900);
    await page.command('Page.enable');
    await page.command('Network.setCookie', { url: origin, name: 'molis_work_locale', value: 'en' });
    await page.command('Page.navigate', { url: origin + STUDIO_HARNESS_PATH });
    await page.wait(`[...document.querySelectorAll('[data-as-model] option')].some(o=>o.value.startsWith('fixture'))`);
    await page.wait(`/Your plugin will appear here/.test(document.querySelector('[data-as-empty]')?.innerText || '')`);
    assert.equal(await page.evaluate<string>(`document.documentElement.lang`), 'en');
    assert.deepEqual(await page.evaluate<string[]>(chrome), [], 'nothing the studio writes on its first screen is Chinese');
    assert.match(await page.evaluate<string>(`document.querySelector('.as-feed').innerText`), /Let’s build your idea together[\s\S]*Reading notes[\s\S]*Daily review[\s\S]*Group sign-up sheet/u);
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-builds] option').textContent`), 'No plugins yet');
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-title]').textContent`), 'New plugin');
    assert.equal(await page.evaluate<string>(`document.querySelector('.as-send').getAttribute('aria-label')`), 'Send');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-input]').placeholder`), /^Describe the plugin you want/u);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-model-note]').textContent`), /^Choose the model used for building · Jev (configured|not set separately \(uses the interface model\))$/u);

    // The brief goes to the stand-in designer as the person typed it.
    await page.evaluate(`(()=>{const s=document.querySelector('[data-as-model]');s.value=[...s.options].find(o=>o.value.startsWith('fixture')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await page.wait(`document.querySelector('[data-as-model-note]').textContent.startsWith('Design and build model: ')`);
    await page.fill('[data-as-input]', '做一个随手记笔记的插件：写下一句话就能保存，最新的在最上面');
    await page.click('.as-send');
    await page.wait(`document.querySelectorAll('[data-as-candidate]').length===2`);

    // The proposals are data; around them everything the studio says is English.
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-phase]').textContent`), 'Comparing proposals');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-status]').innerText`), /Waiting for you to choose a proposal/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-feed').innerText`), /Proposals: 2 · pick one to preview on the right/u);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-choose]').textContent`), /^Use this proposal and start building$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-candidate .as-meta').innerText`), /Features: \d+[\s\S]*UI parts: \d+[\s\S]*Pages: \d+/u);
    await page.wait(`document.querySelector('.as-agents [data-agent="design"] [data-as-step-copy]')?.textContent === 'Presented 2 proposals'`);
    await page.evaluate(`document.querySelector('[data-as-steps] > summary').click()`);
    assert.equal(await page.evaluate(`document.querySelector('[data-as-steps]').open`), true);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-steps li').innerText`), /Lead designer.*Presented 2 proposals.*随手记 · 笔记墙/su);
    assert.match(await page.evaluate<string>(`getComputedStyle(document.querySelector('[data-component-id="notes"]'),'::before').content`), /Not connected yet/, 'a part still to be wired says so in English');

    // FSS-36: refuse a real request from this frame. The normal selection is untouched, and the same production route
    // supplies both the English words and their owner-bound reference. The authorized page is still able to choose a real proposal.
    const refused = await page.evaluate<{ error: string; text: { key: string } }>(`(async()=>{const root=document.querySelector('[data-as-builds]'),id=root.value;
      const response=await fetch(${JSON.stringify(options.routePrefix + "/api/plugin-builder/studio/builds/")}+id+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),
        body:JSON.stringify({action:'choose',candidateId:'missing'})});if(response.status!==400)throw Error('Unexpected status '+response.status);return response.json();})()`);
    assert.deepEqual(refused, { error: "This proposal is no longer valid", text: { key: "plugin-builder.request.proposal-expired" } });
    const original = '原错误 <b>不是标签</b>\n' + '底层细节'.repeat(600);
    rawModelError = original;
    await page.evaluate(`document.querySelector('[data-as-model]').dispatchEvent(new Event('change',{bubbles:true}))`);
    await page.wait(`document.querySelector('.as-error p')?.textContent===${JSON.stringify(original)}`);
    assert.equal(await page.evaluate(`document.querySelector('.as-error p').getAttribute('translate')`), 'no');
    assert.equal(await page.evaluate(`Boolean(document.querySelector('.as-error p b'))`), false);
    rawModelError = undefined;

    // Once a proposal is chosen the design arrives and the spec board and the capability board open.
    await page.click('[data-as-choose]');
    await page.wait(`document.querySelector('[data-as-board]:not([hidden]) .as-board-label')`);
    await page.wait(`['Building','Ready to try'].includes(document.querySelector('[data-as-phase]').textContent)`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-feed] summary').textContent`), /^Collaboration log · steps done: \d+$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-board-label').innerText`), /^Component library\s+Placed \d+\/\d+ · in use \d+\/\d+$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-board-cap').innerText`), /^Capability board\s+Connected \d+\/\d+ · catalog \d+$/u);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('.as-board .as-part:not(.as-cap)')].map(b=>b.textContent+'|'+b.getAttribute('aria-label')).filter(x=>/\\p{Script=Han}/u.test(x))`), [], 'the spec board names its components in English');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-board] [data-kind]').getAttribute('aria-label')`), /^[A-Z][\w ]+ · [A-Z]/u, 'name, catalog name: description');
    assert.deepEqual(await page.evaluate<string[]>(chrome), [], 'and so is the rest of the stage');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-model-note]').textContent`), /^Design and build model: .+ · Jev (configured|not set separately \(uses the interface model\))$/u);
    assert.deepEqual(await page.evaluate<string[]>(`[...new Set([...document.querySelectorAll('.as-plugin .pc-inspect')].map(b=>b.textContent))]`), ['Inspect part'], 'the button that points the studio at a part of the plugin');

    // The catalog panel and a tip carry the catalog's words in English.
    await page.click('[data-as-catalog="components"]');
    await page.wait(`document.querySelector('[data-as-catalog-panel]:not([hidden]) h4')`);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('[data-as-catalog-panel] h4 span:first-child, [data-as-catalog-panel] .as-catalog-note')].map(x=>x.textContent).filter(x=>/\\p{Script=Han}/u.test(x))`), []);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('[data-as-catalog-panel] .as-part')].map(b=>b.textContent+'|'+b.getAttribute('aria-label')).filter(x=>/\\p{Script=Han}/u.test(x))`), [], 'every catalog component, used or not');
    assert.deepEqual(await page.evaluate<string[]>(`(()=>{const out=[];for(const b of document.querySelectorAll('[data-as-catalog-panel] .as-part')){b.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));const tip=document.querySelector('[data-as-tip]');if(/\\p{Script=Han}/u.test(tip.innerText))out.push(tip.innerText);}return out;})()`), [], 'and its tip');

    // The real browser and package gates can still be running after the frame's default wait.
    await page.wait(`document.querySelector('[data-as-phase]').textContent === 'Ready to try'`, { timeoutMs: 75_000 });
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-visual-result]')?.textContent || ''`), /Layout check passed on wide and narrow screens.*Features verified; visuals not reviewed/u);
    revisionMode = 'acceptance';
    await page.fill('[data-as-input]', '用验收检查验证保留的内容'); await page.click('.as-send');
    const failureTitle = `document.querySelector('[data-as-failure-title]')`, failureGuidance = `document.querySelector('[data-as-failure-guidance]')`;
    await page.wait(`${failureTitle}?.textContent.endsWith('did not work as expected in the trial')`, { timeoutMs: 75_000 });
    revisionMode = 'designer';
    await page.evaluate(`document.querySelector('[data-as-edit-mode]').value='message'`);
    await page.fill('[data-as-input]', '保留原话并修订方案'); await page.click('.as-send');
    await page.wait(`${failureTitle}?.textContent === 'The design step did not finish'`);
    assert.match(await page.evaluate<string>(`${failureGuidance}.textContent`), /^Choose Continue to let the AI design it again/u);
    const fixed = `Array.from(document.querySelectorAll('.as-steps li[data-status="failed"] [data-as-step-copy^="revise:"]')).at(-1)`,
      log = `document.querySelector('[data-as-steps]')`, technical = `document.querySelector('.as-error details')`;
    const gate = `document.querySelector('.as-steps .as-gates [title^="G1 "] [data-as-collaboration-copy]')`;
    const step = `document.querySelector('.as-steps [data-as-collaboration-copy*="plugin-builder.agent-studio.step-n"]')`;
    const screen = `document.querySelector('.as-steps [data-as-collaboration-copy*="plugin-builder.agent-studio.screen-text"]')`;
    await page.wait(`${fixed}?.textContent === 'Revising the main design from your feedback'`);
    await page.wait(`${gate}?.textContent === 'Contract' && ${step}?.textContent === 'Step 4' && ${screen}?.textContent.startsWith(' (on screen: ')`);
    const observedScreen = await page.evaluate<string>(`JSON.parse(${screen}.dataset.asCollaborationCopy)[1].text`);
    assert.ok(observedScreen.includes('Save'));
    await page.evaluate(`(()=>{const draft=document.querySelector('[data-as-input]'); draft.value='Unsent 草稿'; draft.focus(); draft.setSelectionRange(1,6,'backward');
      if(!${log}.open)${log}.querySelector('summary').click(); ${technical}.open=true;
      window.collaboration={draft, log:${log}, technical:${technical}, fixed:${fixed}, title:${failureTitle}, raw:${technical}.querySelector('p'),
        gate:${gate}, step:${step}, screen:${screen}, caseRaw:${step}.nextElementSibling};})()`);
    const switched = `[collaboration.draft===document.activeElement,collaboration.draft.value,collaboration.draft.selectionStart,collaboration.draft.selectionEnd,
      collaboration.draft.selectionDirection,collaboration.log===${log},${log}.open,collaboration.technical===${technical},${technical}.open,
      collaboration.fixed===${fixed},collaboration.title===${failureTitle},collaboration.raw===${technical}.querySelector('p'),collaboration.raw.textContent,
      Boolean(collaboration.raw.querySelector('tag')),document.querySelector('.as-brief p').textContent,
      collaboration.gate===${gate},collaboration.step===${step},collaboration.screen===${screen},collaboration.caseRaw===${step}.nextElementSibling,collaboration.caseRaw.textContent]`;
    const preserved = [true, 'Unsent 草稿', 1, 6, 'backward', true, true, true, true, true, true, true, diagnostic, false, '做一个随手记笔记的插件：写下一句话就能保存，最新的在最上面',
      true, true, true, true, '字段值不符合预期：text'];
    const writes = buildWrites;
    for (const [lang, title, stepLabel, guidance, gateLabel, caseLabel, screenLabel] of [
      ['zh', '设计这一步没能完成', '按你的意见修订主线', '点「继续」让 AI 重新设计一次', '合同', '第 4 步', '（界面显示：' + observedScreen + '）'],
      ['en', 'The design step did not finish', 'Revising the main design from your feedback', 'Choose Continue to let the AI design it again', 'Contract', 'Step 4', ' (on screen: ' + observedScreen + ')'],
    ]) {
      await outer.evaluate(`(()=>{const link=document.createElement('a');link.href='#';link.dataset.uiLanguage=${JSON.stringify(lang)};document.body.append(link);link.click();link.remove();})()`);
      await page.wait(`${failureTitle}?.textContent === ${JSON.stringify(title)} && ${fixed}?.textContent === ${JSON.stringify(stepLabel)}
        && ${gate}?.textContent===${JSON.stringify(gateLabel)} && ${step}?.textContent===${JSON.stringify(caseLabel)} && ${screen}?.textContent===${JSON.stringify(screenLabel)}`);
      assert.ok((await page.evaluate<string>(`${failureGuidance}.textContent`)).startsWith(guidance!));
      assert.deepEqual(await page.evaluate(switched), preserved);
      // A same-state read still reaches the normal render path after the in-place language update.
      await page.evaluate(`(async()=>{const fetch=window.fetch;try{await new Promise(resolve=>{
        window.fetch=async(...args)=>{const response=await fetch(...args);if(String(args[0]).endsWith('/api/plugin-builder/studio/state'))await response.clone().json().then(resolve);return response;};
        document.dispatchEvent(new CustomEvent('molis-work:model-ready'));});
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      }finally{window.fetch=fetch;}})()`);
      assert.deepEqual(await page.evaluate(switched), preserved);
    }
    assert.equal(preferenceWrites, 2);
    assert.equal(buildWrites, writes, 'switching only retitles the collaboration and leaves the build idle');
  } finally {
    await browser.close();
    await releaseAgentStudio(store, DEMO_PROJECT_ID);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    await rm(home, { recursive: true, force: true });
  }
});

// W2-18-UPGRADE-SECRETS-01: the key that comes with a confirmed upgrade -> installed lifecycle -> new sandbox operation -> HTTPS.
test('W2-18-UPGRADE-SECRETS-01 an upgrade saves the key the person typed and the upgraded plugin uses it on its actual HTTPS request', { timeout: 90_000, skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'studio-upgrade-network-'));
  const cleanups: Array<() => void | Promise<unknown>> = [];
  t.after(async () => {
    const failures: unknown[] = [];
    for (const close of [...cleanups.reverse(), () => rm(home, { recursive: true, force: true })]) {
      try { await close(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Network fixture cleanup failed');
  });
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=api.weather.example', '-addext', 'subjectAltName=DNS:api.weather.example', '-keyout', join(home, 'key.pem'), '-out', join(home, 'cert.pem')], { stdio: 'ignore' }); }
  catch { await rm(home, { recursive: true, force: true }); t.skip('openssl is required'); return; }
  const [key, cert] = await Promise.all([readFile(join(home, 'key.pem')), readFile(join(home, 'cert.pem'))]), received = Promise.withResolvers<string>();
  const tlsServer = createHttpsServer({ key, cert }, (request, response) => { received.resolve(String(request.headers.authorization)); response.end('received'); });
  cleanups.push(async () => { tlsServer.closeAllConnections(); await new Promise<void>(resolve => tlsServer.close(() => resolve())); });
  await new Promise<void>(resolve => tlsServer.listen(0, '127.0.0.1', resolve)); const tlsAddress = tlsServer.address(); assert.ok(tlsAddress && typeof tlsAddress === 'object');
  const originalLookup = dns.lookup, dnsMock = t.mock.method(dns, 'lookup', (hostname, options, callback) => hostname === 'api.weather.example'
    ? callback(null, [{ address: '93.184.216.34', family: 4 }]) : originalLookup(hostname, options, callback)); syncBuiltinESMExports();
  cleanups.push(() => { dnsMock.mock.restore(); syncBuiltinESMExports(); });
  let fixtureConnections = 0, checkedResolutions = 0;
  // Production uses agent:false so each request gets a new Agent; the global Agent is never consulted.
  const originalConnect = Agent.prototype.createConnection, transport = t.mock.method(Agent.prototype, 'createConnection', function(this: Agent, options, callback) {
    if (options.host !== 'api.weather.example' && options.hostname !== 'api.weather.example') return originalConnect.call(this, options, callback);
    fixtureConnections++;
    const checkedLookup = options.lookup; assert.ok(checkedLookup);
    // Run the production lookup/address/authority checks; route only the resulting test TLS socket to the local server.
    return tlsConnect({ ...options, port: tlsAddress.port, ca: cert, servername: 'api.weather.example', lookup: (hostname, lookupOptions, done) => checkedLookup(hostname, lookupOptions, (error, _address, _family) => {
      checkedResolutions++;
      if (error) done(error, [], 4); else done(null, lookupOptions?.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4);
    }) });
  });
  cleanups.push(() => transport.mock.restore());
  const file = join(home, 'project.db'); seedDemoBoard(file); const store = new LocalProjectDatabase(file);
  cleanups.push(async () => { await releaseAgentStudio(store, DEMO_PROJECT_ID); await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); });
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, routePrefix: '/projects/' + DEMO_PROJECT_ID, ...agentStudioFixture(0) }, installed = await ensureInstalledPlugins(options);
  const buildId = randomUUID(), pluginId = 'io.molis.work.generated.' + buildId;
  // A design always has at least one page (agent-experience refuses one without); the studio canvas draws from the first.
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [{ id: 'main', title: '天气', regions: [{ id: 'main', title: '天气', operationIds: ['fetch'] }] }], acceptance: [], operations: [
    { id: 'fetch', kind: 'query', input: { type: 'null' }, output: { type: 'string' }, effects: {}, errors: [], examples: [{ input: null, output: 'v1' }] }] };
  const bundlePath = join(home, 'v1.mjs'); await writeFile(bundlePath, 'export const operations={fetch:async()=>"v1"};');
  const first: AgentRelease = { buildId, pluginId, version: 1, directory: home, packagePath: home, bundlePath, nodes: [], prompts: [], permissions: {}, publishedAt: new Date().toISOString(),
    manifest: { version: 1, pluginId, revision: 'one', effects: {} }, design: { id: 'fixture', catalog: 'actions/1', title: 'Network fixture', description: 'A fixed upgrade test', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] } };
  const permissions = { networkDomains: ['api.weather.example'], secretRefs: ['weather'] }, nextContract = { ...contract, revision: 'two', operations: [{ ...contract.operations[0]!, effects: permissions }] };
  const nextBundle = join(home, 'v2.mjs'); await writeFile(nextBundle, 'export const operations={fetch:async(_,sdk)=>(await sdk.network.request({url:"https://api.weather.example/today",secretRefs:["weather"]})).body};');
  const next: AgentRelease = { ...first, version: 2, bundlePath: nextBundle, permissions, manifest: { version: 1, pluginId, revision: 'two', effects: permissions }, design: { ...first.design, contract: nextContract } };
  const publisher = newPublisher(), v1 = packagedStudioRelease(home, first, publisher), v2 = packagedStudioRelease(home, next, publisher, { upgradesFrom: [1] });
  await installed.lifecycle('install', v1, { consent: true });
  // The person types the key in the install sheet's key step (tests/security-invariants-package-install-sheet.e2e.test.ts, PBU-47-7); what reaches
  // the installation is the confirmed package and that key.
  const secretValue = 'Bearer ' + randomUUID();
  await installed.lifecycle('upgrade', v2, { consent: true, secrets: [{ name: 'weather', header: 'Authorization', value: secretValue }] });
  assert.equal(installed.installations()[0]!.version, 2);
  // The upgrade's consent approves the site and the secret; using them is still the person's switch in Settings, off until turned on (BL-701).
  const upgraded = installed.platform.runtime.list().find(record => record.plugin_id === pluginId)!.install_id;
  for (const permission of ['network:request', 'secret:use']) await installed.platform.runtime.regrant(upgraded, permission, true);
  const caller = { actor_id: 'web-user', project_id: DEMO_PROJECT_ID, audience: 'user' as const, permissions: [] };
  const action = (await installed.actions.client.discover(caller)).find(view => view.provider.plugin_id === pluginId && view.action.local_id === 'fetch');
  assert.ok(action);
  const called = await installed.actions.client.invoke(caller, { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id }, null);
  assert.equal(called, 'received'); assert.equal(await received.promise, secretValue);
  assert.equal(fixtureConnections, 1); assert.equal(checkedResolutions, 1, 'the new connection still ran the production DNS/address/authority checks');
  assert.ok(!JSON.stringify(installed.secrets.list(pluginId)).includes(secretValue)); assert.ok(!String(installed.storage.get('plugin-builder:agent-studio:approved:' + pluginId)).includes(secretValue));
});
