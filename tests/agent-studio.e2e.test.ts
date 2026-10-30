import { framedStudioPage, studioFrameAsset, isolatedStudioHarness } from "./fixtures/studio-framed-page.js";
import { pluginPagesFor } from "@molis-ai/molis-work-app-local-host";
import { VISUAL_FOUNDATION_STYLES } from '@molis-ai/molis-work-design-system';
import { createWorkbenchLocale } from '@molis-ai/molis-work-app-workbench';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer as createHttpsServer, Agent } from 'node:https';
import { connect as tlsConnect } from 'node:tls';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStudioChrome } from './fixtures/plugin-builder-browser.js';
import { agentStudioFixture } from '../scripts/agent-studio-preview-fixture.mjs';
import { STUDIO_HARNESS_PATH } from '../scripts/agent-studio-harness.mjs';
import { LocalProjectDatabase } from '@molis-ai/molis-work-app-local-host';
import { seedDemoBoard, DEMO_PROJECT_ID } from '@molis-ai/molis-work-app-local-host';
import { handleAgentStudioHttp, installedPluginStages, releaseAgentStudio } from '../apps/local-host/dist/plugin-builder/agent-surface.js';
import { ensureInstalledPlugins, releaseInstalledPlugins } from '../apps/local-host/dist/installed-plugin-host.js';
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '@molis-ai/molis-work-app-local-host';

/**
 * The whole studio journey in a real browser: only the models are labelled stand-ins. Build gates, the Seatbelt
 * sandbox, preview storage, the push channel and the headless acceptance run are the production ones.
 */
test('studio: a request becomes a working, published plugin that the person can use', { timeout: 180_000, skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'molis-studio-e2e-'));
  const browser = await openStudioChrome(join(home, 'chrome'));
  if (!browser) { await rm(home, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const databasePath = join(home, 'project.db'); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();
  const fixture = agentStudioFixture(0); let modelDelay = 0;
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, routePrefix: '/projects/' + DEMO_PROJECT_ID, ...fixture,
    generate: async (pluginId: string, input: { prompt?: string; instructions?: string; input: string }) => { await new Promise(resolve => setTimeout(resolve, modelDelay)); return fixture.generate(pluginId, input); } };
  let liveSubscriptions = 0, subscriptions = 0;
  const server: Server = createServer((request, response) => {
    if (request.url?.endsWith("/events")) { liveSubscriptions++; subscriptions++; response.on("close", () => { liveSubscriptions--; }); }
    const url = new URL(request.url ?? '/', 'http://localhost') /* as the product server does: no port in the base */;
    if (studioFrameAsset(response, url.pathname)) return;
    if (url.pathname === '/assets/molis-work-settings.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(VISUAL_FOUNDATION_STYLES); return; }
    // The studio as the workbench mounts it in its stage (scripts/agent-studio-harness.mts): it has no page of its own.
    if (url.pathname === STUDIO_HARNESS_PATH) { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(isolatedStudioHarness(home, DEMO_PROJECT_ID, token)); return; }
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    void pluginPagesFor(home).bind(request, url).then(release => { if (release) response.once("close", release); const local = new URL(url); if (local.pathname.startsWith(options.routePrefix + "/")) local.pathname = local.pathname.slice(options.routePrefix.length); return handleAgentStudioHttp(request, response, local, options, token); }).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: 'not found' }); }).catch(error => sendLocalWebJson(response, 403, { error: String(error.message) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const page = await framedStudioPage(t, browser, await browser.page());
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
    assert.deepEqual(await page.evaluate(`(()=>{let parentDenied=false;try{void parent.document.body}catch{parentDenied=true}return {parentDenied,token:document.querySelector('meta[name=molis-work-control-token]')?.content??null,ipc:typeof globalThis.__TAURI__};})()`), {parentDenied:true,token:null,ipc:'undefined'});
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
    const beforeVisual = await (await fetch(origin + '/projects/' + DEMO_PROJECT_ID + '/api/plugin-builder/studio/builds/' + visualBuildId)).json() as { build: { runs: Array<{ role: string }> } };
    await page.evaluate(`(async()=>{const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+${JSON.stringify(visualBuildId)}+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action:'visual',message:'收紧间距，保留完整内容'})});if(!r.ok)throw Error(await r.text())})()`);
    await page.wait(`document.querySelector('[data-as-phase]').dataset.phase==='ready'&&!!document.querySelector('[data-pc-open="editor"]')`);
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('间隔复习比集中复习记得更久')`);
    const afterVisual = await (await fetch(origin + '/projects/' + DEMO_PROJECT_ID + '/api/plugin-builder/studio/builds/' + visualBuildId)).json() as typeof beforeVisual;
    assert.equal(afterVisual.build.runs.filter(run => run.role === 'coder').length, beforeVisual.build.runs.filter(run => run.role === 'coder').length);
    await page.click('[data-as-compare]');
    await page.wait(`document.querySelector('[data-as-plugin]').inert&&!document.querySelector('[data-pc-open="editor"]')`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /间隔复习比集中复习记得更久/);
    await page.click('[data-as-compare]');
    await page.wait(`!document.querySelector('[data-as-plugin]').inert&&!!document.querySelector('[data-pc-open="editor"]')`);

    // Publish once; an unchanged build cannot be published again.
    await page.click('[data-as-action="publish"]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('v1 已是当前版本')`);
    // VUX-26: the feed has the conversation's one scroll owner; nobody scrolled it, so it follows its end.
    await page.wait(`(() => { const feed = document.querySelector('[data-as-feed]'); return feed.dataset.follow === 'following' && feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 1; })()`);

    // Install into the project after an explicit consent; the installed plugin keeps its own data, apart from the preview.
    await page.click('[data-as-install]');
    await page.wait(`document.querySelector('.as-dialog')?.innerText.includes('在本机保存和读取它自己的数据')`);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-dialog').innerText`), /用你配置的文字模型生成内容/, 'the model capability is approved in plain words');
    await page.click('.as-dialog button[value=ok]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('已安装 v1')||document.querySelector('[role=alert]')`);
    assert.equal(await page.evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`), '', 'installation reports no problem');
    const pluginHref = await page.evaluate<string>(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('打开插件')).getAttribute('href')`);
    // The workbench lists it beside the built-in plugins: one stage framing its installed page.
    const stages = await installedPluginStages(options);
    assert.deepEqual(stages.map(item => [item.label, item.surface.startsWith('app-')]), [['笔记墙', true]]);
    assert.match(stages[0]!.stage, new RegExp('data-work-surface="' + stages[0]!.surface + '"[^>]*hidden><iframe src="' + pluginHref.replaceAll('.', '\\.') + '\\?frame=workbench"'));
    // Its address opened directly (a link in a notice, say) opens the workbench on that plugin's stage, not a page of its own.
    const directPlugin = await fetch(origin + pluginHref, { redirect: 'manual' });
    assert.equal(directPlugin.status, 302); assert.equal(directPlugin.headers.get('location'), options.routePrefix + '/?openSurface=' + encodeURIComponent(stages[0]!.surface)); await directPlugin.text();
    const installedPage = await framedStudioPage(t, browser, await browser.page());
    await installedPage.command('Page.enable');
    await installedPage.command('Page.navigate', { url: origin + pluginHref + '?frame=workbench' });
    await installedPage.wait('globalThis.__molisPluginReady===true');
    // SYS-15: a generated plugin is equally isolated and cannot call the authoring or another plugin API.
    assert.deepEqual(await installedPage.evaluate(`(async()=>{let parentDenied=false;try{void parent.document.body}catch{parentDenied=true}const denied=[];for(const path of ['/api/plugin-builder/studio/state','/api/plugins/io.molis.work.schedule/tasks']){try{const r=await fetch('${options.routePrefix}'+path);denied.push(r.status)}catch{denied.push(403)}}return {parentDenied,token:document.querySelector('meta[name=molis-work-control-token]')?.content??null,denied};})()`), {parentDenied:true,token:null,denied:[403,403]});
    assert.equal(await installedPage.evaluate(`Boolean(document.querySelector('.as-installed-bar, a[href*="/plugin-builder/studio"]'))`), false, 'the frame shows only the plugin: no own header or link back');
    await installedPage.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('还没有笔记')`);
    await installedPage.click('[data-pc-open="editor"]');
    await installedPage.fill('[data-component-id="editor"] [data-field]', '正式使用的第一条');
    await installedPage.click('[data-component-id="editor"] [type=submit]');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('正式使用的第一条')`);
    assert.doesNotMatch(await installedPage.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /间隔复习比集中复习/, 'installed data is separate from the preview');
    await installedPage.command('Page.reload');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    const first = await installedPage.evaluate<string>(`[...document.querySelectorAll('[data-record-id]')].find(r=>r.innerText.includes('正式使用的第一条')).dataset.recordId`);
    // While the model takes its time, the plugin's list still answers at once: model calls run in their own process.
    modelDelay = 3000;
    await installedPage.click(`[data-record-id="${first}"] [data-pc-action=expand]`);
    const quick = await installedPage.evaluate<number>(`(async()=>{const t=performance.now();const r=await fetch(${JSON.stringify(origin + pluginHref.replace('/plugins/', '/api/plugin-builder/installed/') + '/call')},{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({componentId:'notes',binding:'read',payload:{}})});if(!r.ok)throw Error(await r.text());return performance.now()-t})()`);
    assert.ok(quick < 1500, 'a read during a model call took ' + Math.round(quick) + 'ms');
    modelDelay = 0;
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('（预览替身模型）正式使用的第一条')`);
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

    // Publish the preceding presentation as v2, upgrade, then roll back to the exact v1 layout without losing data.
    await page.evaluate(`(async()=>{const id=${JSON.stringify(visualBuildId)};const act=async(action,extra={})=>{const {build}=await(await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id)).json();const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action,revision:build.revision,...extra})});if(!r.ok)throw Error(await r.text())};await act('undo');await act('publish');await act('upgrade',{version:2,grants:{consent:true}})})()`);
    await installedPage.command('Page.reload');
    await installedPage.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    assert.equal(await installedPage.evaluate(`!!document.querySelector('[data-pc-open="editor"]')`), false, 'v2 uses the preceding inline form');
    await page.evaluate(`(async()=>{const id=${JSON.stringify(visualBuildId)},{build}=await(await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id)).json();const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action:'rollback',revision:build.revision,version:1})});if(!r.ok)throw Error(await r.text())})()`);
    await installedPage.command('Page.reload');
    await installedPage.wait(`globalThis.__molisPluginReady===true&&!!document.querySelector('[data-pc-open="editor"]')&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);

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
    await releaseAgentStudio(store, DEMO_PROJECT_ID);
    await installedPage.command('Page.reload');
    await installedPage.wait(`document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('正式使用的第一条')`);
    assert.equal(await ensureInstalledPlugins(options), installedOwner, 'closing authoring does not close or recreate installed execution');
    // The lifecycle intentionally suspends hidden views. Re-enter the studio before asking it to render.
    await installedPage.command('Page.close'); await standalone.command('Page.close'); await page.command('Page.bringToFront');
    await page.command('Page.reload');
    await page.wait(`document.querySelector('[data-as-uninstall]')`);

    // A switched-off install takes the next version without being switched on, and is switched on when the person says so.
    const lifecycle = (action: string, version: number) => page.evaluate(`(async()=>{const id=${JSON.stringify(visualBuildId)},{build}=await(await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id)).json();const r=await fetch('${options.routePrefix}/api/plugin-builder/studio/builds/'+id+'/action',{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({action:${JSON.stringify(action)},revision:build.revision,version:${version},grants:{consent:true}})});if(!r.ok)throw Error(await r.text())})()`);
    await lifecycle('disable', 1);
    await page.command('Page.reload');
    await page.wait(`document.querySelector('[data-as-upgrade]')`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-upgrade]').innerText`), /仍保持停用/, 'the upgrade button says the plugin stays off');
    await page.click('[data-as-upgrade]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('已安装 v2')||document.querySelector('[role=alert]')`);
    assert.equal(await page.evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`), '', 'upgrading a disabled install reports no problem');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-feed]').innerText`), /已安装 v2[\s\S]*disabled/, 'and it is still disabled');
    await page.click('[data-as-install-enable]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('已安装 v2')&&!document.querySelector('[data-as-install-enable]')`);
    await lifecycle('rollback', 1);

    // Uninstall keeps the data when asked to; the plugin page then no longer serves it.
    await page.click('[data-as-uninstall]');
    await page.wait(`document.querySelector('.as-dialog button[value=keep]')`);
    await page.click('.as-dialog button[value=keep]');
    await page.wait(`document.querySelector('[data-as-install]')`);
    assert.deepEqual(await installedPluginStages(options), [], 'an uninstalled plugin leaves the workbench');
    const gone = await fetch(origin + pluginHref);
    assert.notEqual(gone.status, 200, 'an uninstalled plugin page is not served');

    // J1A-01: The uninstall kept v1's data and only v2 is left to install: it does not say it can read that data, so the person is asked.
    const shelf = JSON.parse(installedOwner.storage.get('plugin-builder:agent-built:v1')!) as { releases: Array<{ version: number }> };
    installedOwner.storage.set('plugin-builder:agent-built:v1', JSON.stringify({ ...shelf, releases: shelf.releases.filter(release => release.version === 2) }));
    await page.command('Page.reload');
    await page.wait(`document.querySelector('[data-as-install]')`);
    await page.click('[data-as-install]');
    await page.wait(`document.querySelector('.as-dialog button[value=ok]')`);
    await page.click('.as-dialog button[value=ok]');
    await page.wait(`document.querySelector('.as-dialog button[value=discard]')`);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-dialog').innerText`), /读不了/, 'the dialog says the old data cannot be used');
    await page.click('.as-dialog button[value=cancel]');
    await page.wait(`!document.querySelector('.as-dialog')`);
    assert.deepEqual(await installedPluginStages(options), [], 'cancelling installs nothing');
    await page.click('[data-as-install]');
    await page.wait(`document.querySelector('.as-dialog button[value=ok]')`);
    await page.click('.as-dialog button[value=ok]');
    await page.wait(`document.querySelector('.as-dialog button[value=discard]')`);
    await page.click('.as-dialog button[value=discard]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('已安装 v2')||document.querySelector('[role=alert]')`);
    assert.equal(await page.evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`), '', 'dropping the old data lets the install through');
    await page.click('[data-as-uninstall]');
    await page.wait(`document.querySelector('.as-dialog button[value=drop]')`);
    await page.click('.as-dialog button[value=drop]');
    await page.wait(`document.querySelector('[data-as-install]')`);

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
    await page.wait("document.querySelector('[data-as-install]')");
    await page.evaluate("document.querySelector('[data-agent-studio]').remove()");
    await observed(() => liveSubscriptions === 0);

  } catch (error) {
    const state = await (await fetch(origin + '/api/plugin-builder/studio/state')).json() as { builds: any[] };
    t.diagnostic(JSON.stringify(state.builds.map(b => ({phase:b.phase,error:b.error,steps:b.steps.slice(-3),browser:b.browserResult}))));

    throw error;
  } finally {
    await browser.close();
    await releaseAgentStudio(store, DEMO_PROJECT_ID); await releaseInstalledPlugins(store, DEMO_PROJECT_ID);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    await rm(home, { recursive: true, force: true });
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
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, routePrefix: '/projects/' + DEMO_PROJECT_ID, ...fixture };
  const locale = createWorkbenchLocale(() => 'en');
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (studioFrameAsset(response, url.pathname)) return;
    if (url.pathname === '/assets/molis-work-settings.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(VISUAL_FOUNDATION_STYLES); return; }
    if (url.pathname === STUDIO_HARNESS_PATH) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(isolatedStudioHarness(home, DEMO_PROJECT_ID, token, { lang: 'en', translate: locale.L, clientScript: locale.clientI18nScript() })); return;
    }
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    void pluginPagesFor(home).bind(request, url).then(release => { if (release) response.once("close", release); const local = new URL(url); if (local.pathname.startsWith(options.routePrefix + "/")) local.pathname = local.pathname.slice(options.routePrefix.length); return handleAgentStudioHttp(request, response, local, options, token); }).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: 'not found' }); }).catch(error => sendLocalWebJson(response, 403, { error: String(error.message) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  // Every visible word of the studio's own controls: the text outside what is data (the brief, the proposals, the capability
  // directory's titles, the model list, the step labels the host wrote that a pointer repeats), and the attributes that are read aloud.
  const DATA = 'select,[class*="mw-select-picker"],.as-plugin,[data-as-title],[data-as-model-note],.as-pointer em,.as-frame span,.as-brief p,.as-candidates,.as-card,.as-agents,.as-steps,.as-recent,.as-cap,.as-cap-row';
  const chrome = `(()=>{const HAN=/\\p{Script=Han}/u,shell=document.querySelector('.as-shell'),found=[];
    for(const el of shell.querySelectorAll('*')){if(el.closest('${DATA},[hidden]'))continue;for(const a of ['aria-label','title','placeholder'])if(HAN.test(el.getAttribute(a)||''))found.push(a+'='+el.getAttribute(a));}
    const walker=document.createTreeWalker(shell,NodeFilter.SHOW_TEXT);for(let n;n=walker.nextNode();){if(n.parentElement.closest('${DATA},[hidden]'))continue;if(HAN.test(n.textContent))found.push('text:'+n.textContent.trim()+' <'+n.parentElement.tagName+'.'+n.parentElement.className+'>');}
    return found;})()`;
  try {
    const page = await framedStudioPage(t, browser, await browser.page());
    await page.viewport(1440, 900);
    await page.command('Page.enable');
    await page.command('Page.navigate', { url: origin + STUDIO_HARNESS_PATH });
    await page.wait(`[...document.querySelectorAll('[data-as-model] option')].some(o=>o.value.startsWith('fixture'))`);
    await page.wait(`/Your plugin will appear here/.test(document.querySelector('[data-as-empty]')?.innerText || '')`);
    assert.equal(await page.evaluate<string>(`document.documentElement.lang`), 'en');
    assert.deepEqual(await page.evaluate<string[]>(chrome), [], 'nothing the studio writes on its first screen is Chinese');
    assert.match(await page.evaluate<string>(`document.querySelector('.as-feed').innerText`), /Let's build your idea together[\s\S]*Reading notes[\s\S]*Daily review[\s\S]*Group sign-up sheet/u);
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-builds] option').textContent`), 'No plugins yet');
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-title]').textContent`), 'New plugin');
    assert.equal(await page.evaluate<string>(`document.querySelector('.as-send').getAttribute('aria-label')`), 'Send');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-input]').placeholder`), /^Describe the plugin you want/u);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-model-note]').textContent`), /^Choose the model used for building · Jev (configured|not configured \(the UI Agent's design is used first\))$/u);

    // The brief goes to the stand-in designer as the person typed it.
    await page.evaluate(`(()=>{const s=document.querySelector('[data-as-model]');s.value=[...s.options].find(o=>o.value.startsWith('fixture')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await page.wait(`document.querySelector('[data-as-model-note]').textContent.startsWith('Lead designer and Code Agent: ')`);
    await page.fill('[data-as-input]', '做一个随手记笔记的插件：写下一句话就能保存，最新的在最上面');
    await page.click('.as-send');
    await page.wait(`document.querySelectorAll('[data-as-candidate]').length===2`);

    // The proposals are data; around them everything the studio says is English.
    assert.equal(await page.evaluate<string>(`document.querySelector('[data-as-phase]').textContent`), 'Comparing proposals');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-status]').innerText`), /Waiting for you to choose a proposal/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-feed').innerText`), /Proposals: 2 · pick one to preview on the right/u);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-choose]').textContent`), /^Use this proposal and start building$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-candidate .as-meta').innerText`), /Features: \d+[\s\S]*UI parts: \d+[\s\S]*Pages: \d+/u);
    assert.match(await page.evaluate<string>(`getComputedStyle(document.querySelector('[data-component-id="notes"]'),'::before').content`), /Not connected yet/, 'a part still to be wired says so in English');

    // A request that fails shows the server's message in English when the dictionary has it: as a whole, or its opening sentence
    // followed by the detail as the host wrote it; any other message is shown as written. (The fetch is answered here; the
    // messages themselves are the ones the routes throw, checked against the source in tests/studio-english.test.ts.)
    await page.evaluate(`(()=>{const real=window.fetch;window.__fail=null;window.fetch=(input,init)=>window.__fail&&init?.method==='POST'&&/\\/action$/.test(String(input))?Promise.resolve(new Response(JSON.stringify({error:window.__fail}),{status:400,headers:{'content-type':'application/json'}})):real(input,init);})()`);
    for (const [error, shown] of [
      ['草稿已改变，请刷新', 'The draft has changed. Refresh and try again.'],
      ['发布前请先修好调用模型的写法：src/plugin.ts:12 model.generate names no prompt', 'Fix how the plugin calls the model before publishing: src/plugin.ts:12 model.generate names no prompt'],
      ['一句宿主还没有英文的话：细节', '一句宿主还没有英文的话：细节'],
    ] as const) {
      await page.evaluate(`window.__fail=${JSON.stringify(error)}`);
      await page.click('[data-as-choose]');
      await page.wait(`document.querySelector('.as-error p')?.textContent===${JSON.stringify(shown)}`);
    }
    await page.evaluate(`window.__fail=null`);

    // Once a proposal is chosen the design arrives and the spec board and the capability board open.
    await page.click('[data-as-choose]');
    await page.wait(`document.querySelector('[data-as-board]:not([hidden]) .as-board-label')`);
    await page.wait(`['Building','Ready to try'].includes(document.querySelector('[data-as-phase]').textContent)`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-feed] summary').textContent`), /^Collaboration log · steps done: \d+$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-board-label').innerText`), /^Spec board\s+Placed \d+\/\d+ · in use \d+\/\d+$/u);
    assert.match(await page.evaluate<string>(`document.querySelector('.as-board-cap').innerText`), /^Capability board\s+Connected \d+\/\d+ · catalog \d+$/u);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('.as-board .as-part:not(.as-cap)')].map(b=>b.textContent+'|'+b.getAttribute('aria-label')).filter(x=>/\\p{Script=Han}/u.test(x))`), [], 'the spec board names its components in English');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-board] [data-kind]').getAttribute('aria-label')`), /^[A-Z][\w ]+ [A-Z][\w ]+: [A-Z]/u, 'name, catalog name: description');
    assert.deepEqual(await page.evaluate<string[]>(chrome), [], 'and so is the rest of the stage');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-model-note]').textContent`), /^Lead designer and Code Agent: .+ · Jev (configured|not configured \(the UI Agent's design is used first\))$/u);
    assert.deepEqual(await page.evaluate<string[]>(`[...new Set([...document.querySelectorAll('.as-plugin .pc-inspect')].map(b=>b.textContent))]`), ['Inspect part'], 'the button that points the studio at a part of the plugin');

    // The catalog panel and a tip carry the catalog's words in English.
    await page.click('[data-as-catalog="components"]');
    await page.wait(`document.querySelector('[data-as-catalog-panel]:not([hidden]) h4')`);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('[data-as-catalog-panel] h4 span:first-child, [data-as-catalog-panel] .as-catalog-note')].map(x=>x.textContent).filter(x=>/\\p{Script=Han}/u.test(x))`), []);
    assert.deepEqual(await page.evaluate<string[]>(`[...document.querySelectorAll('[data-as-catalog-panel] .as-part')].map(b=>b.textContent+'|'+b.getAttribute('aria-label')).filter(x=>/\\p{Script=Han}/u.test(x))`), [], 'every catalog component, used or not');
    assert.deepEqual(await page.evaluate<string[]>(`(()=>{const out=[];for(const b of document.querySelectorAll('[data-as-catalog-panel] .as-part')){b.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));const tip=document.querySelector('[data-as-tip]');if(/\\p{Script=Han}/u.test(tip.innerText))out.push(tip.innerText);}return out;})()`), [], 'and its tip');
  } finally {
    await browser.close();
    await releaseAgentStudio(store, DEMO_PROJECT_ID);
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); store.close();
    await rm(home, { recursive: true, force: true });
  }
});

// W2-18-UPGRADE-SECRETS-01: actual browser consent -> native studio HTTP/lifecycle -> new sandbox operation -> HTTPS.
test('upgrade consent saves the new secret and the upgraded plugin uses it on its actual HTTPS request', { timeout: 90_000, skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'studio-upgrade-network-')), browser = await openStudioChrome(join(home, 'chrome'));
  if (!browser) { await rm(home, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  try { execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=api.weather.example', '-addext', 'subjectAltName=DNS:api.weather.example', '-keyout', join(home, 'key.pem'), '-out', join(home, 'cert.pem')], { stdio: 'ignore' }); }
  catch { await browser.close(); await rm(home, { recursive: true, force: true }); t.skip('openssl is required'); return; }
  const [key, cert] = await Promise.all([readFile(join(home, 'key.pem')), readFile(join(home, 'cert.pem'))]), received = Promise.withResolvers<string>();
  const tlsServer = createHttpsServer({ key, cert }, (request, response) => { received.resolve(String(request.headers.authorization)); response.end('received'); });
  await new Promise<void>(resolve => tlsServer.listen(0, '127.0.0.1', resolve)); const tlsAddress = tlsServer.address(); assert.ok(tlsAddress && typeof tlsAddress === 'object');
  const originalLookup = dns.lookup, dnsMock = t.mock.method(dns, 'lookup', (hostname, options, callback) => hostname === 'api.weather.example'
    ? callback(null, [{ address: '93.184.216.34', family: 4 }]) : originalLookup(hostname, options, callback)); syncBuiltinESMExports();
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
  const file = join(home, 'project.db'); seedDemoBoard(file); const store = new LocalProjectDatabase(file), token = randomUUID(), mutations = new Map<string, LocalMutationState>();
  const options = { store, projectId: DEMO_PROJECT_ID, homeDirectory: home, routePrefix: '/projects/' + DEMO_PROJECT_ID, ...agentStudioFixture(0) }, installed = await ensureInstalledPlugins(options);
  const build = installed.releases.create('Network upgrade fixture'), pluginId = 'io.molis.work.generated.' + build.id;
  // A design always has at least one page (agent-experience refuses one without); the studio canvas draws from the first.
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: 'one', entities: [], pages: [{ id: 'main', title: '天气', regions: [{ id: 'main', title: '天气', operationIds: ['fetch'] }] }], acceptance: [], operations: [
    { id: 'fetch', kind: 'query', input: { type: 'null' }, output: { type: 'string' }, effects: {}, errors: [], examples: [{ input: null, output: 'v1' }] }] };
  const bundlePath = join(home, 'v1.mjs'); await writeFile(bundlePath, 'export const operations={fetch:async()=>"v1"};');
  const first: AgentRelease = { buildId: build.id, pluginId, version: 1, directory: home, packagePath: home, bundlePath, nodes: [], prompts: [], permissions: {}, publishedAt: new Date().toISOString(),
    manifest: { version: 1, pluginId, revision: 'one', effects: {} }, design: { id: 'fixture', catalog: 'actions/1', title: 'Network fixture', description: 'A fixed upgrade test', rationale: 'Fixture', journey: [], contract, parts: [], acceptance: [] } };
  installed.releases.release(first); await installed.lifecycle('install', first, { consent: true });
  const permissions = { networkDomains: ['api.weather.example'], secretRefs: ['weather'] }, nextContract = { ...contract, revision: 'two', operations: [{ ...contract.operations[0]!, effects: permissions }] };
  const nextBundle = join(home, 'v2.mjs'); await writeFile(nextBundle, 'export const operations={fetch:async(_,sdk)=>(await sdk.network.request({url:"https://api.weather.example/today",secretRefs:["weather"]})).body};');
  const next: AgentRelease = { ...first, version: 2, bundlePath: nextBundle, permissions, manifest: { version: 1, pluginId, revision: 'two', effects: permissions }, design: { ...first.design, contract: nextContract } };
  installed.releases.release(next); installed.releases.update(build.id, build.revision, value => { value.phase = 'ready'; value.design = next.design; value.connected = ['fetch']; });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (studioFrameAsset(response, url.pathname)) return;
    if (url.pathname === '/assets/molis-work-settings.css') { response.writeHead(200, { 'content-type': 'text/css' }); response.end(VISUAL_FOUNDATION_STYLES); return; }
    if (url.pathname === STUDIO_HARNESS_PATH) { response.writeHead(200, { 'content-type': 'text/html' }); response.end(isolatedStudioHarness(home, DEMO_PROJECT_ID, token)); return; }
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    void pluginPagesFor(home).bind(request, url).then(release => { if (release) response.once("close", release); const local = new URL(url); if (local.pathname.startsWith(options.routePrefix + "/")) local.pathname = local.pathname.slice(options.routePrefix.length); return handleAgentStudioHttp(request, response, local, options, token); }).then(handled => { if (!handled) sendLocalWebJson(response, 404, {}); }).catch(error => sendLocalWebJson(response, 403, { error: String(error.message) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address === 'object');
  t.after(async () => { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await releaseAgentStudio(store, DEMO_PROJECT_ID); await releaseInstalledPlugins(store, DEMO_PROJECT_ID); store.close(); tlsServer.closeAllConnections(); await new Promise<void>(resolve => tlsServer.close(() => resolve())); transport.mock.restore(); dnsMock.mock.restore(); syncBuiltinESMExports(); await rm(home, { recursive: true, force: true }); });
  const page = await framedStudioPage(t, browser, await browser.page()); await page.command('Page.navigate', { url: `http://127.0.0.1:${address.port}` + STUDIO_HARNESS_PATH });
  await page.wait(`document.querySelector('[data-as-builds] option[value="${build.id}"]')`);
  await page.evaluate(`(()=>{const select=document.querySelector('[data-as-builds]');select.value=${JSON.stringify(build.id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await page.wait(`document.querySelector('[data-as-upgrade="2"]')`); await page.click('[data-as-upgrade="2"]');
  await page.wait(`document.querySelector('.as-dialog [data-secret="weather"]')`); const secretValue = 'Bearer ' + randomUUID();
  await page.fill('.as-dialog [data-secret-header]', 'Authorization'); await page.fill('.as-dialog [data-secret-value]', secretValue); await page.click('.as-dialog button[value=ok]');
  await page.wait(`document.querySelector('[data-as-feed]')?.innerText.includes('已安装 v2')||document.querySelector('[role=alert]')`);
  assert.equal(await page.evaluate(`document.querySelector('[role=alert]')?.innerText||''`), ''); assert.equal(installed.installations()[0]!.version, 2);
  const called = await installed.platform.router().dispatch({ method: 'POST', pathname: '/api/plugins/' + pluginId + '/call', actor_id: 'web-user', execution: { beforeEffect: async () => {} }, body: { operation: 'fetch', input: null } });
  assert.equal(called?.status, 200, JSON.stringify(called?.body)); assert.equal((called!.body as { value: string }).value, 'received'); assert.equal(await received.promise, secretValue);
  assert.equal(fixtureConnections, 1); assert.equal(checkedResolutions, 1, 'the new connection still ran the production DNS/address/authority checks');
  assert.ok(!JSON.stringify(installed.secrets.list(pluginId)).includes(secretValue)); assert.ok(!String(installed.storage.get('plugin-builder:agent-studio:approved:' + pluginId)).includes(secretValue));
});
