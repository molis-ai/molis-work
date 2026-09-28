import { defineAction, definePlugin } from '../packages/plugin-sdk/src/index.js';
import { PluginRuntime, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import { workflowsActions as w, WORKFLOWS_ACTION_PERMISSIONS } from '@molis-ai/molis-work-plugin-workflows';
import { molisWorkHostProjectReference } from '../apps/local-host/src/project-host.js';
import { NATIVE_CONTENT_PERMISSIONS } from '../apps/local-host/src/content-action-providers.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openGoalBrowser } from './fixtures/goal-browser.js';
import { createLocalFeedApplication, createLocalFeedSourceService, DEMO_BOARD_ID } from '@molis-ai/molis-work-app-local-host';
import { openShelfStore } from '@molis-ai/molis-work-module-shelf';

test('real browser creates a Feed → Shelf action workflow, maps fields, and writes the original material', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded', undefined, null);
  if (!b) return;
  const source = createLocalFeedSourceService(b.store.db, DEMO_BOARD_ID).register({
    kind: 'research_library', repository: 'molis-ai/research-library', research_source: 'workflow-review',
  }).source;
  const feed = createLocalFeedApplication(b.store.db);
  const item = feed.ingestItem({ source, externalId: 'workflow-review', title: '端到端工作流验证', summary: '用真实字段映射保存',
    body: '这是端到端字段映射的原始正文。', occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  const { command, sessionId, click, waitFor, evaluate } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await b.navigate(() => command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await click('[data-plugin-strip] [data-plugin-id=workflows]');
  await waitFor("document.querySelector('[data-wf-action=new]')");
  await click('[data-wf-action=new]');
  await waitFor("document.querySelector('[data-wf-title]')");
  await click('[data-wf-action=append][data-wf-plugin=feed]');
  await waitFor("document.querySelector('[data-wf-chain]')?.textContent.includes('Feed')");
  await click('[data-wf-action=add-step]');
  await waitFor("[...document.querySelectorAll('[data-wf-step-action] option')].some(o => o.value.includes('shelf.items.admit'))");
  await evaluate(`(() => {
    const select = document.querySelector('[data-wf-step-action]');
    select.value = [...select.options].find(o => o.value.includes('shelf.items.admit')).value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  for (const [field, from] of [['text', 'body'], ['title', 'title']]) {
    await waitFor(`document.querySelector('[data-wf-map-source=${field}]')`);
    await evaluate(`(() => {
      const el = document.querySelector('[data-wf-map-source=${field}]');
      el.value = 'from:${from}'; el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }
  await click('[data-wf-action=step-save]');
  await waitFor("document.querySelector('[data-wf-chain]')?.textContent.includes('放进 Shelf') && !document.querySelector('[data-wf-action=start]').disabled");
  await click('[data-wf-action=start]');
  await waitFor(`document.querySelector('input[name=start][value="${item.item_id}"]')`);
  await click(`input[name=start][value="${item.item_id}"]`);
  await click('[data-wf-dialog-submit]');
  await waitFor("document.querySelector('[data-wf-action=continue]')");
  await click('[data-wf-action=continue]');
  await waitFor("document.querySelector('[data-wf-manual]')");
  await click('[data-wf-action=handoff-submit]');
  await waitFor("document.querySelector('[data-wf-view]')?.textContent.includes('已走完')");
  const shelf = openShelfStore(b.homeDirectory, { disabled: true });
  const saved = shelf.snapshot().materials.filter(row => row.name.includes('端到端工作流验证'));
  assert.equal(saved.length, 1);
  assert.match(shelf.readFile(saved[0]!.item_id).bytes.toString('utf8'), /这是端到端字段映射的原始正文/);
  assert.ok(b.localHost!.callLog!.list(b.projectId).some(row => row.capability_id === 'shelf.items.admit' && row.audience === 'workflow' && row.ok));
  await waitFor("document.querySelector('[data-wf-result-summary]')?.innerText.includes('已接收材料')");
  assert.match(await evaluate("document.querySelector('[data-wf-result-summary]').innerText"), /端到端工作流验证/);
  assert.equal(await evaluate("[...document.querySelectorAll('.wf-result-details')].every(el => !el.open)"), true);
  assert.equal((await evaluate("document.querySelector('.wf-stage__result').innerText")).includes(saved[0]!.item_id), false, 'technical identifiers are not the visible result');
  await click('.wf-result-details summary');
  assert.ok((await evaluate("document.querySelector('.wf-stage__result').innerText")).includes(saved[0]!.item_id), 'the original response remains inspectable');
  await click('.wf-result-details summary');
  await mkdir('/tmp/action-workflow-result-review', { recursive: true });
  const desktop = await command('Page.captureScreenshot', { format: 'png' }, sessionId) as { data: string };
  await writeFile('/tmp/action-workflow-result-review/desktop.png', Buffer.from(desktop.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("document.querySelector('[data-wf-result-link]')?.getBoundingClientRect().width > 0");
  assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, 'narrow screen has no horizontal overflow');
  const narrow = await command('Page.captureScreenshot', { format: 'png' }, sessionId) as { data: string };
  await writeFile('/tmp/action-workflow-result-review/narrow.png', Buffer.from(narrow.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => click('[data-wf-result-link]'));
  await waitFor(`document.querySelector('[data-shelf-item="${saved[0]!.item_id}"]')?.getAttribute('aria-selected') === 'true'`);
  await waitFor("document.querySelector('[data-shelf-preview]')?.innerText.includes('这是端到端字段映射的原始正文')");

});

test('unknown plugin long results survive a late navigation response and render as safe text on a narrow screen', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded', undefined, null);
  if (!b) return;
  const { command, sessionId, click, waitFor, evaluate } = b;
  const source = createLocalFeedSourceService(b.store.db, DEMO_BOARD_ID).register({
    kind: 'research_library', repository: 'molis-ai/research-library', research_source: 'long-result',
  }).source;
  const item = createLocalFeedApplication(b.store.db).ingestItem({ source, externalId: 'long-result', title: '长结果材料', summary: '真实工作流输入',
    body: '真实工作流正文', occurredAt: new Date().toISOString(), attention: false }).item;
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await mkdir('/tmp/action-workflow-result-review', { recursive: true });

  // A new provider declares a long result without a UI/Host branch. Render a real saved execution,
  // including HTML-looking text, on the narrow screen and keep technical data folded.
  const note = '<script>原文不会执行</script>' + '无空格的长正文'.repeat(1000);
  const action = defineAction({ capability_id: 'fixture.long-result.create', version: 1, operation: 'command', action: {
    title: '保存长结果', description: '浏览器验证用的真实返回', kind: 'operation', scope: 'project', audiences: ['user', 'workflow'], permissions: [], subject_kinds: [],
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    output_schema: { type: 'object', properties: { note: { type: 'string' } }, required: ['note'] },
    result_view: { summary: '长结果已保存', text_pointer: '/note' },
  } }, () => ({ note }));
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: 'io.molis.work.fixture.long-result', version: '1.0.0', name: '长结果', kind: 'app',
    publisher: { publisher_id: 'test', signature: 'test' }, entrypoints: [{ deployment: 'local', entrypoint: './index.js' }], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action.definition] },
    async start() { return { kind: 'app', actions: [action.handler] }; } });
  const reference = molisWorkHostProjectReference({ databasePath: b.databasePath, boardId: DEMO_BOARD_ID, projectId: b.projectId });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(b.store.db), undefined,
    { actions: { registry: b.localHost!.actionRegistry(reference), project_id: b.projectId } });
  const installed = runtime.install({ definition: plugin, deployment: 'local', grants: [] }).install;
  await runtime.start(installed.install_id);
  try {
    const actions = bindActionClient(b.localHost!.actionClient(reference), () => ({ actor_id: 'web-user', project_id: b.projectId, audience: 'user',
      permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS] }));
    const choice = (await actions.invoke(w.actionSteps, {})).actions.find(row => row.ref.capability_id === action.definition.capability_id)!;
    assert.ok(choice, 'the installed provider is discovered without a Host entry');
    const chain = { stations: [{ plugin: 'feed' }, { plugin: 'action', action: {
      ref: choice.ref, title: choice.title, group: choice.group, mapping: {},
    } }], links: [{ kind: 'function', title_template: '', body_template: '{正文}', instructions: '' }] };
    const { workflow } = await actions.invoke(w.create, { title: '长正文结果验证', chain });
    await actions.invoke(w.create, { title: '另一个流程', chain });
    const { instance } = await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id });
    await actions.invoke(w.continue, { id: instance.instance_id });
    await b.navigate(() => command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
    await click('[data-plugin-strip] [data-plugin-id=workflows]');
    await waitFor(`document.querySelector('[data-workflows=workbench]')?.dataset.wfMode === 'list' && document.querySelector('[data-wf-open="${workflow.workflow_id}"]')?.getClientRects().length > 0`);
    const prior = (await actions.invoke(w.list, {})).workflows.find(row => row.workflow_id !== workflow.workflow_id)!;
    const readingOld = Promise.withResolvers<void>(), releaseOld = Promise.withResolvers<void>();
    const oldReturned = Promise.withResolvers<void>();
    const actionClient = b.localHost!.actionClient.bind(b.localHost);
    let holdOld = true;
    const mock = t.mock.method(b.localHost!, 'actionClient', (...args: Parameters<typeof actionClient>) => {
      const client = actionClient(...args);
      return { ...client, invoke: async (caller, definition, input) => {
        if (holdOld && definition.capability_id === w.get.capability_id && (input as { id?: string }).id === prior.workflow_id) {
          holdOld = false; readingOld.resolve(); await releaseOld.promise;
          try { return await client.invoke(caller, definition, input); } finally { oldReturned.resolve(); }
        }
        return client.invoke(caller, definition, input);
      } } as typeof client;
    });
    try {
      await evaluate(`(() => {
        const original = window.fetch;
        window.__workflowOldReadDone = false;
        window.fetch = async (...args) => {
          const response = await original(...args);
          if (String(args[0]).endsWith('/api/workflows/${prior.workflow_id}')) {
            await response.clone().text();
            requestAnimationFrame(() => requestAnimationFrame(() => { window.__workflowOldReadDone = true; }));
          }
          return response;
        };
      })()`);
      await click(`[data-wf-open="${prior.workflow_id}"]`);
      await readingOld.promise;
      await click(`[data-wf-open="${workflow.workflow_id}"]`);
      await waitFor(`document.querySelector('[data-wf-open-instance="${instance.instance_id}"]')`);
      releaseOld.resolve(); await oldReturned.promise;
      await waitFor("window.__workflowOldReadDone === true");
      assert.equal(await evaluate(`document.querySelector('[data-wf-open-instance="${instance.instance_id}"]') !== null`), true, 'a late prior workflow cannot replace the user selection');
    } finally { releaseOld.resolve(); mock.mock.restore(); }
    await click(`[data-wf-open-instance="${instance.instance_id}"]`);
    await waitFor("document.querySelector('[data-wf-result-summary]')?.innerText.includes('长结果已保存')");
    assert.equal(await evaluate("document.querySelector('.wf-result-text').textContent"), note.slice(0, 4000));
    assert.equal(await evaluate("document.querySelector('.wf-result-text script') !== null"), false);
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("window.innerWidth === 390");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('.wf-result-details').open"), false);
    assert.match(await evaluate("document.querySelector('.wf-stage__result').innerText"), /正文仅显示节选/);
    const long = await command('Page.captureScreenshot', { format: 'png' }, sessionId) as { data: string };
    await writeFile('/tmp/action-workflow-result-review/long-narrow.png', Buffer.from(long.data, 'base64'));
  } finally { await runtime.stop(installed.install_id); }
});
