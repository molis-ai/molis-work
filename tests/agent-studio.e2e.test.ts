import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ChromeHarness } from './fixtures/plugin-builder-browser.js';
import { agentStudioFixture } from '../scripts/agent-studio-preview-fixture.mjs';
import { LocalProjectDatabase } from '../apps/local-host/src/project-database.js';
import { seedDemoBoard, DEMO_BOARD_ID } from '../apps/local-host/src/demo-seed.js';
import { handleAgentStudioHttp, installedPluginStages, releaseAgentStudio } from '../apps/local-host/src/plugin-builder/agent-surface.js';
import { authorizeLocalWebRequest, sendLocalWebJson, type LocalMutationState } from '../apps/local-host/src/web-http.js';

/**
 * The whole studio journey in a real browser: only the models are labelled stand-ins. Build gates, the Seatbelt
 * sandbox, preview storage, the push channel and the headless acceptance run are the production ones.
 */
test('studio: a request becomes a working, published plugin that the person can use', { timeout: 180_000, skip: process.platform !== 'darwin' }, async t => {
  const home = await mkdtemp(join(tmpdir(), 'molis-studio-e2e-'));
  const browser = await ChromeHarness.start(join(home, 'chrome'));
  if (!browser) { await rm(home, { recursive: true, force: true }); t.skip('Chrome is required'); return; }
  const databasePath = join(home, 'project.db'); seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath), token = randomUUID() + randomUUID(), mutations = new Map<string, LocalMutationState>();
  const fixture = agentStudioFixture(0); let modelDelay = 0;
  const options = { store, boardId: DEMO_BOARD_ID, homeDirectory: home, ...fixture,
    generate: async (pluginId: string, input: { instructions: string; input: string }) => { await new Promise(resolve => setTimeout(resolve, modelDelay)); return fixture.generate(pluginId, input); } };
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost') /* as the product server does: no port in the base */;
    if (!authorizeLocalWebRequest(request, response, url, token, mutations)) return;
    void handleAgentStudioHttp(request, response, url, options, token).then(handled => { if (!handled) sendLocalWebJson(response, 404, { error: 'not found' }); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  try {
    const page = await browser.page();
    await page.viewport(1440, 900);
    await page.command('Page.enable');
    await page.command('Page.navigate', { url: origin + '/plugin-builder/studio' });
    await page.wait(`[...document.querySelectorAll('[data-as-model] option')].some(o=>o.value.startsWith('fixture'))`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-empty]').innerText`), /这里会出现你的插件/);
    assert.equal(await page.evaluate('Math.round(document.querySelector(".as-shell").getBoundingClientRect().top)'), 0, 'nothing pushes the studio down (e.g. an unstyled icon sprite)');

    // Choose the model the build will use, then describe the plugin.
    await page.evaluate(`(()=>{const s=document.querySelector('[data-as-model]');s.value=[...s.options].find(o=>o.value.startsWith('fixture')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await page.wait(`document.querySelector('[data-as-model-note]').textContent.includes('预览替身')`);
    await page.fill('[data-as-input]', '做一个随手记笔记的插件：写下一句话就能保存，最新的在最上面');
    await page.click('.as-send');
    await page.wait(`document.querySelectorAll('[data-as-candidate]').length===2`);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-component-id="notes"]').innerText`), /功能待接通/, 'a proposal renders real parts, not wired yet');

    // Compare, choose, and let the two lines build.
    await page.click('[data-as-candidate="board"]');
    await page.wait(`document.querySelector('[data-as-choose="board"]')`);
    await page.click('[data-as-choose="board"]');
    await page.wait(`document.querySelector('[data-as-phase]').textContent==='构建中'`);
    await page.evaluate(`new Promise((resolve,reject)=>{const until=Date.now()+150000;(function check(){const p=document.querySelector('[data-as-phase]').textContent;if(p==='可以试用')return resolve(true);if(p==='需要处理')return reject(new Error(document.querySelector('.as-error')?.innerText));if(Date.now()>until)return reject(new Error('build timeout: '+p));setTimeout(check,250);})()})`);
    const summary = await page.evaluate<string>(`[...document.querySelectorAll('.as-card')].map(c=>c.innerText).find(t=>t.startsWith('可以试用了'))`);
    assert.match(summary, /4 项功能全部接通 · 门禁 G1–G6 通过 · 界面验收 4\/4 通过/);
    assert.match(await page.evaluate<string>(`document.querySelector('[data-as-builds]').selectedOptions[0].textContent`), /可以试用/, 'the build selector follows live updates');
    const record = await page.evaluate<string>(`document.querySelector('[data-as-feed]').textContent` /* includes the folded collaboration record */);
    assert.match(record, /Jev · 3 选 1/, 'the collection part was chosen by Jev from three legal components');
    assert.match(await page.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /还没有笔记/, 'acceptance data is cleared before the person tries it');

    // Try it: the form saves through the sandboxed backend and clears; the list shows the record, not JSON.
    await page.click('[data-as-tab="try"]');
    await page.fill('[data-component-id="editor"] textarea', '间隔复习比集中复习记得更久');
    await page.click('[data-component-id="editor"] [type=submit]');
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('间隔复习比集中复习记得更久')`);
    assert.equal(await page.evaluate(`document.querySelector('[data-component-id="editor"] textarea').value`), '');
    assert.doesNotMatch(await page.evaluate<string>(`document.querySelector('[data-as-plugin]').innerText`), /\{"id"/);
    // The person's own trial reaches the real model (acceptance above used the catalog stand-in).
    const tried = await page.evaluate<string>(`[...document.querySelectorAll('[data-component-id="notes"] [data-record-id]')].find(r=>r.innerText.includes('间隔复习比集中复习记得更久')).dataset.recordId`);
    await page.click(`[data-component-id="notes"] [data-record-id="${tried}"] [data-pc-action=expand]`);
    await page.wait(`document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('（预览替身模型）间隔复习比集中复习记得更久')`);

    // Publish once; an unchanged build cannot be published again.
    await page.click('[data-as-action="publish"]');
    await page.wait(`document.querySelector('[data-as-feed]').innerText.includes('v1 已是当前版本')`);

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
    assert.match(stages[0]!.stage, new RegExp('data-work-surface="' + stages[0]!.surface + '"[^>]*hidden><iframe src="' + pluginHref.replaceAll('.', '\\.') + '"'));
    const installedPage = await browser.page();
    await installedPage.command('Page.enable');
    await installedPage.command('Page.navigate', { url: origin + pluginHref });
    await installedPage.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('还没有笔记')`);
    await installedPage.fill('[data-component-id="editor"] textarea', '正式使用的第一条');
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
    await installedPage.fill('[data-component-id="editor"] textarea', '这条马上删掉');
    await installedPage.click('[data-component-id="editor"] [type=submit]');
    await installedPage.wait(`[...document.querySelectorAll('[data-record-id]')].some(r=>r.innerText.includes('这条马上删掉'))`);
    const doomed = await installedPage.evaluate<string>(`[...document.querySelectorAll('[data-record-id]')].find(r=>r.innerText.includes('这条马上删掉')).dataset.recordId`);
    await installedPage.click(`[data-record-id="${doomed}"] [data-pc-action=remove]`);
    await installedPage.wait(`!document.querySelector('[data-component-id="notes"] .pc-output').innerText.includes('这条马上删掉')`);
    assert.match(await installedPage.evaluate<string>(`document.querySelector('[data-component-id="notes"] .pc-output').innerText`), /正式使用的第一条/);

    // The standalone page reads the same preview data through the same renderer.
    const buildId = await page.evaluate<string>(`new URLSearchParams(location.search).get('build')`);
    const standalone = await browser.page();
    await standalone.command('Page.enable');
    await standalone.command('Page.navigate', { url: origin + '/plugin-builder/studio/preview/' + buildId });
    await standalone.wait(`globalThis.__molisPluginReady===true&&document.querySelector('[data-component-id="notes"] .pc-output')?.innerText.includes('间隔复习比集中复习记得更久')`);

    // Uninstall keeps the data when asked to; the plugin page then no longer serves it.
    // Other tabs were opened meanwhile; a background tab's timers are throttled, so bring the studio back first.
    await installedPage.command('Page.close'); await standalone.command('Page.close'); await page.command('Page.bringToFront');
    await page.click('[data-as-uninstall]');
    await page.wait(`document.querySelector('.as-dialog button[value=keep]')`);
    await page.click('.as-dialog button[value=keep]');
    await page.wait(`document.querySelector('[data-as-install]')`);
    assert.deepEqual(await installedPluginStages(options), [], 'an uninstalled plugin leaves the workbench');
    const gone = await fetch(origin + pluginHref);
    assert.notEqual(gone.status, 200, 'an uninstalled plugin page is not served');

    // Narrow screens keep the whole journey without horizontal page scrolling.
    await page.viewport(390, 844, true);
    const overflow = await page.evaluate<string[]>(`[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.right>391&&r.width>0&&getComputedStyle(e).position!=='fixed'}).slice(0,8).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))`);
    assert.equal(await page.evaluate('document.documentElement.scrollWidth<=390'), true, overflow.join(' | '));
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseAgentStudio(store, DEMO_BOARD_ID); store.close();
    await rm(home, { recursive: true, force: true });
  }
});
