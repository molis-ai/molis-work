import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { GoalProjectApplication, DEMO_BOARD_ID } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';

const shots = new URL('../.impeccable/review/product-experience-20260926/', import.meta.url);

test('Product journeys: discover tools, create from empty states, save and recover without losing context', { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded'); if (!b) return;
  try {
  const { origin, projectId, command, sessionId, navigate, evaluate, click, waitFor, reloadPage } = b;
  await mkdir(shots, { recursive: true });
  const size = (width: number, height = 900) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
  const shot = async (name: string) => {
    await evaluate('document.fonts.ready');
    const { data } = await command<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(new URL(name + '.png', shots), Buffer.from(data, 'base64'));
  };
  const open = async (plugin: string) => {
    // A real click in the scrollable rail, using its actual hit target.
    await click(`[data-plugin-strip] [data-plugin-id="${plugin}"], [data-assistant-island] [data-plugin-id="${plugin}"]`);
    await waitFor(`document.body.dataset.desktopSurface === '${plugin === 'goals' ? 'goal' : plugin}'`, 12_000);
  };
  const input = async (selector: string, value: string) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); input.focus(); input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await size(1440);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-home-day]')");
  await click('[data-home-day]:last-child');
  await waitFor("document.querySelector('[data-home-start]')", 20_000);
  await shot('home-desktop');
  await click('[data-navigation-labels-toggle]');
  assert.equal(await evaluate("document.querySelector('[data-navigation-labels-toggle]').getAttribute('aria-expanded')"), 'true');
  assert.equal(await evaluate("getComputedStyle(document.body).getPropertyValue('--plugin-rail-width').trim()"), '208px');
  await shot('navigation-expanded');
  await reloadPage();
  await waitFor("document.body.dataset.navigationLabels === 'true'");
  await click('[data-global-search-open]');
  await input('[data-global-search]', 'dataset');
  await waitFor("document.querySelector('[data-global-search-id=dataset]')");
  await shot('search-tools');
  await click('[data-global-search-id=dataset]');
  await waitFor("document.body.dataset.desktopSurface === 'dataset'");
  await click('[data-dataset-empty] [data-dataset-new]');
  await waitFor("!document.querySelector('[data-dataset-stage-workspace]').hidden && document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await input('[data-dataset-title]', '产品体验验证');
  await waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  await click('[data-dataset-stage-workspace] .plugin-stage-more > summary');
  assert.equal(await evaluate("document.querySelector('[data-dataset-export-csv]').getBoundingClientRect().width > 0"), true);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, sessionId);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' }, sessionId);
  assert.equal(await evaluate("document.querySelector('[data-dataset-stage-workspace] .plugin-stage-more').open"), false);
  await shot('dataset-desktop');
  for (const [plugin, attr] of [['form', 'new'], ['ppt', 'new']] as const) {
    await open(plugin);
    await click(`[data-${plugin}-empty] [data-${plugin}-${attr}]`);
    await waitFor(`!document.querySelector('[data-${plugin}-stage-workspace]').hidden`);
    await shot(`${plugin}-desktop`);
  }
  await open('lingguang');
  await click('[data-lingguang-empty] [data-lingguang-capture]');
  await waitFor("!document.querySelector('[data-lingguang-stage-workspace]').hidden");
  await input('[data-lingguang-body]', '这一笔需要真实保存');
  await waitFor("document.querySelector('[data-lingguang-save-status]').textContent === '已保存'");
  // An actual failed HTTP save must leave the draft available and offer recovery.
  await evaluate(`(() => { const original = window.fetch; window.restorePolishFetch = () => window.fetch = original; window.fetch = (url, init) => init?.method === 'POST' && String(url).includes('/api/plugins/lingguang/') ? Promise.resolve(new Response(JSON.stringify({ error: '保存暂时失败' }), { status: 503, headers: { 'content-type': 'application/json' } })) : original(url, init); })()`);
  await input('[data-lingguang-body]', '失败后这一笔也要保留');
  await waitFor("document.querySelector('[data-lingguang-save-status]').textContent === '保存失败'");
  assert.equal(await evaluate("document.querySelector('[data-lingguang-body]').value"), '失败后这一笔也要保留');
  await shot('save-recovery');
  await evaluate('window.restorePolishFetch()');
  await click('[data-lingguang-save-retry]');
  await waitFor("document.querySelector('[data-lingguang-save-status]').textContent === '已保存'");
  await click('[data-lingguang-back]');
  await click('[data-lingguang-id]');
  assert.equal(await evaluate("document.querySelector('[data-lingguang-body]').value"), '失败后这一笔也要保留');
  assert.equal(await evaluate("document.querySelector('dialog[data-lingguang-dispatch]') === null"), true);
  await command('Browser.grantPermissions', { origin, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await click('[data-lingguang-dispatch-current]');
  await waitFor("document.querySelector('[data-lingguang-note]').textContent.includes('已复制内容')");
  assert.match(await evaluate<string>('navigator.clipboard.readText()'), /失败后这一笔也要保留/);
  await open('market');
  await waitFor("!document.querySelector('[data-market-open=cognia]').hidden");
  await shot('market-desktop');
  await click('[data-market-open=cognia]');
  await waitFor("document.body.dataset.desktopSurface === 'cognia'");
  await waitFor("document.querySelector('[data-cognia-rows] .cognia-empty')");
  await input('[data-cognia-search]', '没有这份资料');
  await waitFor("document.querySelector('[data-cognia-rows]').textContent.includes('没有符合条件的资料')");
  await click('[data-cognia-action=clear-filters]');
  await waitFor("document.querySelector('[data-cognia-rows]').textContent.includes('把已有的知识带进来')");
  await shot('cognia-desktop');
  await click('[data-cognia-action=model-settings]');
  await waitFor("document.querySelector('[data-work-surface=settings] [data-model-settings]') || document.querySelector('[data-directory-panel=settings] [data-settings-section=models][aria-current]')", 10_000);
  await open('home');
  await click('[data-home-day]:last-child');
  await waitFor("document.querySelector('[data-home-start=pages]')");
  await click('[data-home-start=pages]');
  await waitFor("document.body.dataset.desktopSurface === 'pages'");
  await size(390, 844);
  await shot('pages-mobile');
  await click('[data-directory-show]');
  await click('[data-global-search-open]');
  await input('[data-global-search]', 'dataset');
  await click('[data-global-search-id=dataset]');
  await waitFor("document.body.dataset.desktopSurface === 'dataset' && !document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')");

  for (const plugin of ['home', 'dataset', 'form', 'ppt', 'lingguang', 'cognia']) {
    await evaluate(`document.querySelector('[data-plugin-strip] [data-plugin-id="${plugin}"], [data-assistant-island] [data-plugin-id="${plugin}"]').click()`);
    await waitFor(`document.body.dataset.desktopSurface === '${plugin}'`);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${plugin} must fit the viewport`);
    await shot(`${plugin}-mobile`);
  }
  await evaluate("document.documentElement.dataset.resolvedTheme = 'dark'");
  await shot('cognia-mobile-dark');
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await evaluate("document.querySelector('[data-plugin-id=home]').click()");
  await waitFor("document.querySelector('.home-start-action')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-start-action')).transitionDuration"), '0s');
  } catch (error) { console.error(error); throw error; }
});

test('Artifact tabs restore the exact item after switching, reload and split', { timeout: 180_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded'); if (!b) return;
  try {
  const { origin, projectId, command, sessionId, navigate, evaluate, click, waitFor, reloadPage } = b;
  const app = new GoalProjectApplication(b.store);
  for (const id of ['polish/a', 'polish-b']) app.artifacts.commands.registerVersion({
    board_id: DEMO_BOARD_ID, actor_id: 'polish-test', artifact_id: id, version: 1,
    artifact_type_id: 'io.molis.work.document', schema_version: 1,
    producer: { plugin_id: 'io.example.writer', plugin_version: '1.0.0', binding_signature: 'polish-fixture' },
    content: { kind: 'inline', payload: { title: `验证 ${id}`, content: `内容 ${id}` } }, metadata: {},
  });
  const prefix = `/projects/${projectId}`;
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: origin + prefix + '/' }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id=artifacts]');
  const openArtifact = async (id: string) => {
    const path = `${prefix}/artifacts/${encodeURIComponent(id)}/versions/1`;
    await waitFor(`document.querySelector('[data-artifact-directory] a[href="${path}"]')`, 10_000);
    await click(`[data-artifact-directory] a[href="${path}"]`);
    await waitFor(`document.querySelector('[data-artifact-detail] [data-artifact-id="${id}"][data-artifact-version="1"]')`, 10_000);
    return await evaluate<string>("document.querySelector('.tab-item[aria-current][data-plugin=artifacts]').dataset.tabId");
  };
  const a = await openArtifact('polish/a');
  await click('[data-artifact-collapse]');
  await waitFor("document.querySelector('[data-artifact-stage-shell]').dataset.expanded === 'false'");
  const second = await openArtifact('polish-b');
  assert.notEqual(a, second);
  const isA = "!!document.querySelector('[data-artifact-detail] [data-artifact-id=\"polish/a\"][data-artifact-version=\"1\"]') && document.querySelector('[data-artifact-stage-shell]').dataset.expanded === 'true'";
  await click(`[data-tab-id="${a}"]`); await waitFor(isA);
  await click('[data-plugin-id=home]');
  await click(`[data-tab-id="${a}"]`); await waitFor(isA);
  await reloadPage(); await waitFor(isA, 10_000);
  await click('[data-tab-split]'); await click('[data-layout-split=right]');
  await waitFor("[...document.querySelectorAll('iframe.tab-content-frame')].some(frame => frame.contentDocument?.querySelector('[data-artifact-id=\"polish/a\"][data-artifact-version=\"1\"]'))", 20_000);
  } catch (error) { console.error(error); throw error; }
});

test('Search opens an owner record in the visible split pane without creating a false item tab', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded'); if (!b) return;
  const { origin, projectId, command, sessionId, navigate, evaluate, click, waitFor } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id=dataset]');
  await click('[data-dataset-empty] [data-dataset-new]');
  await waitFor("!document.querySelector('[data-dataset-stage-workspace]').hidden && document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await evaluate("(() => { const el = document.querySelector('[data-dataset-title]'); el.value = '分屏查找这份数据'; el.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  assert.equal(await evaluate("document.querySelector('[data-dataset-id] strong').textContent"), '分屏查找这份数据');
  const id = await evaluate<string>("document.querySelector('[data-dataset-id]').dataset.datasetId");
  await click('[data-plugin-id=home]');
  await click('[data-tab-split]'); await click('[data-layout-split=right]');
  await waitFor("document.querySelectorAll('[data-tab-pane]').length === 2");
  const targetPane = await evaluate<string>("document.querySelector('.tab-pane.is-focused').dataset.tabPane");
  await click('[data-global-search-open]');
  await evaluate("(() => { const el = document.querySelector('[data-global-search]'); el.value = '分屏查找这份数据'; el.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await click(`[data-global-search-id="${id}"]`);
  await waitFor(`[...document.querySelectorAll('iframe.tab-content-frame:not([hidden])')].some(frame => frame.dataset.paneOwner === ${JSON.stringify(targetPane)} && frame.contentDocument?.querySelector('[data-dataset-title]')?.value === '分屏查找这份数据' && !frame.contentDocument.querySelector('[data-dataset-stage-workspace]').hidden)`, 20_000);
  assert.equal(await evaluate("document.querySelectorAll('.tab-item[data-plugin=dataset][data-item-id]').length"), 0);
});
