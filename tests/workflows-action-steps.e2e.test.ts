import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { defineAction, definePlugin } from '@molis-ai/molis-work-plugin-sdk';
import { PluginRuntime, SqlitePluginRuntimeRepository } from '@molis-ai/molis-work-plugin-runtime';
import { bindActionClient } from '@molis-ai/molis-work-contracts/platform/actions';
import { workflowsActions as w, WORKFLOWS_ACTION_PERMISSIONS, type WorkflowInstance } from '@molis-ai/molis-work-plugin-workflows';
import { molisWorkHostProjectReference, runWithLocale } from '@molis-ai/molis-work-app-local-host';
import { NATIVE_CONTENT_PERMISSIONS } from '../apps/local-host/dist/native-content-permissions.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openGoalBrowser } from './fixtures/goal-browser.js';

import { openTestShelfStore } from './shelf-direct-actions.js';
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { openWorkflowsStore } from "./fixtures/plugin-home-stores.js";

test('real browser creates a Feed → Shelf action workflow, maps fields, and writes the original material', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded', undefined, null);
  if (!b) return;
  const shelfChild = await pluginFrameBrowser(t,b,"shelf",'[data-side-body="plugin:shelf/side"] iframe');
  const feedReader = await pluginFrameBrowser(t,b,"feed",'iframe[data-plugin-embedded=feed]');
  const source = createLocalFeedSourceService(b.store.db, b.projectId!).register({
    kind: 'research_library', repository: 'molis-ai/research-library', research_source: 'workflow-review',
  }).source;
  const feed = createLocalFeedApplication(b.store.db);
  const item = feed.ingestItem({ source, externalId: 'workflow-review', title: '端到端工作流验证', summary: '用真实字段映射保存',
    body: '这是端到端字段映射的原始正文。', occurredAt: new Date().toISOString(), attention: false }).item;
  await feed.flushPendingJudgments();
  const child = await pluginFrameBrowser(t,b,"workflows");
  const { command, sessionId } = b;
  const { click, waitFor, evaluate } = child;
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await b.navigate(() => command('Page.navigate', { url: `${b.origin}/projects/${b.projectId}/` }, sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id=workflows]');
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
  // SYS-15-U7: the real source is readable inside the workflow, but its trusted document is outside the opaque page.
  await b.waitFor("document.querySelector('iframe[data-plugin-embedded=feed]')");
  await feedReader.waitFor("document.body.innerText.includes('这是端到端字段映射的原始正文')");
  assert.equal(await evaluate("(()=>{try{return Boolean(parent.document)}catch(error){return error.name}})()"), "SecurityError");
  // RING-07: current human-led station is static doing; future station waits.
  await waitFor("document.querySelector('.wf-vstep.is-current .mw-state-ring')?.dataset.mwState === 'doing'");
  assert.equal(await evaluate("document.querySelector('.wf-vstep.is-pending .mw-state-ring')?.dataset.mwState"), 'waiting');
  await click('[data-wf-action=continue]');
  await waitFor("document.querySelector('[data-wf-manual]')").catch(async error=>{throw new Error(JSON.stringify(await evaluate("({view:document.querySelector('[data-wf-view]')?.innerText,toast:document.querySelector('[data-wf-toast]')?.innerText})")),{cause:error});});
  await click('[data-wf-action=handoff-submit]');
  await waitFor("document.querySelector('[data-wf-view]')?.textContent.includes('已走完')");
  await b.waitFor("!document.querySelector('iframe[data-plugin-embedded]')");
  await waitFor("[...document.querySelectorAll('.wf-vstep .mw-state-ring')].length === 2 && [...document.querySelectorAll('.wf-vstep .mw-state-ring')].every(node => node.dataset.mwState === 'done')");
  assert.equal(await evaluate("document.querySelector('.wf-vlink__label .mw-state-ring')?.dataset.mwState"), 'done');
  const shelf = openTestShelfStore(b.homeDirectory, { disabled: true });
  const saved = (await shelf.snapshot()).materials.filter(row => row.name.includes('端到端工作流验证'));
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
  // The result's link opens Shelf where its declarations put it: its side tab, on the item (W2'-2, specs/context-program §21.6).
  await shelfChild.waitFor(`document.querySelector('[data-shelf-item="${saved[0]!.item_id}"]')?.getAttribute('aria-selected') === 'true'`, 15_000);
  await shelfChild.waitFor(`document.querySelector('[data-shelf-preview]')?.innerText.includes('这是端到端字段映射的原始正文')`, 15_000);

});

test('FSS-36 held judgments follow both language changes and keep the run, verdict and original reason', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded', undefined, null);
  if (!b) return;
  const child = await pluginFrameBrowser(t, b, 'workflows');
  const project = b.projectId!, reference = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: project });
  const source = createLocalFeedSourceService(b.store.db, project).register({ kind: 'research_library', repository: 'molis-ai/research-library', research_source: 'workflow-hold' }).source;
  const feed = createLocalFeedApplication(b.store.db);
  const items = ['Needs person', 'Outside allowed', 'No choice', 'Archived reason'].map(title => feed.ingestItem({ source, externalId: title,
    title, summary: title, body: '原始材料', occurredAt: new Date().toISOString(), attention: false }).item);
  const choice = '未选 <tag>';
  const judge = defineAction({ capability_id: 'functions.published.workflow-hold-fixture', version: 1, operation: 'command', action: {
    title: '判断原名', description: '真实流程判断夹具', kind: 'judgment', scope: 'project', audiences: ['user', 'workflow'], permissions: [], subject_kinds: [],
    input_schema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
    output_schema: { type: 'object', properties: { data: { type: 'object', properties: { choice: { type: ['string', 'null'], enum: [choice, 'pass', null] } } } } },
  } }, (_caller, { content }) => ({ status: content.includes('Needs person') ? 'needs_review' : 'ok', function_key: 'fixture', version: 1,
    data: { choice: content.includes('No choice') ? null : choice }, confidence: 0.9 }));
  const remove = b.localHost!.actionRegistry(reference).registerProvider({ provider: { provider_id: 'workflow-hold-fixture', kind: 'system', title: '判断提供方', project_id: project },
    definitions: [judge.definition], handlers: [judge.handler] });
  try {
    const actions = bindActionClient(b.localHost!.actionClient(reference), () => ({ actor_id: 'web-user', project_id: project, audience: 'user', permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS] }));
    const { workflow, runs } = await runWithLocale('zh', async () => {
      const rule = (await actions.invoke(w.judgments, {})).judgments.find(row => row.ref.capability_id === judge.definition.capability_id);
      assert.ok(rule);
      const { workflow } = await actions.invoke(w.create, { title: '交接原名', chain: { stations: [{ plugin: 'feed' }, { plugin: 'pages' }],
        links: [{ kind: 'judgment', title_template: '', body_template: '', instructions: '', judgment: rule.ref, pass: ['pass'] }] } });
      const runs: WorkflowInstance[] = [];
      for (const item of items) {
        const { instance } = await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id });
        runs.push((await actions.invoke(w.continue, { id: instance.instance_id })).instance);
      }
      return { workflow, runs };
    });
    assert.deepEqual(runs.map(run => run.stopped?.verdict?.status), ['needs_review', 'ok', 'ok', 'ok']);
    assert.equal(runs[2]!.stopped?.verdict?.choice, null);
    const original = '判断需要人确认，这一次没有交过去 <tag> 原文';
    const store = openWorkflowsStore(b.homeDirectory);
    try {
      const legacy = runs[3]!;
      const steps = legacy.steps.map((step, index) => index === 0 ? { ...step, held: { at: legacy.stopped!.at, reason: original } } : step);
      store.saveInstance(legacy, { ...legacy, steps });
    } finally { store.close(); }
    await b.navigate(() => b.command('Page.navigate', { url: `${b.origin}/locale?lang=en&next=${encodeURIComponent(`/projects/${project}/`)}` }, b.sessionId));
    await b.click('[data-plugin-strip] [data-plugin-id=workflows]');
    await child.waitFor(`document.querySelector('[data-wf-open="${workflow.workflow_id}"]')`);
    await child.click(`[data-wf-open="${workflow.workflow_id}"]`);
    const cases = [
      { en: ['This judgment needs a person’s confirmation. Nothing was handed over.', 'Needs a person to confirm'] },
      { en: [`The result “${choice}” is outside the allowed results, so nothing was handed over.`, `Result “${choice}”`, '90% confidence'],
        zh: [`判断结果是「${choice}」，不在可以交过去的结果里`, `结果「${choice}」`, '把握 90%'] },
      { en: ['The result “None” is outside the allowed results, so nothing was handed over.', 'Result “None”', '90% confidence'],
        zh: ['判断结果是「无」，不在可以交过去的结果里', '结果「无」', '把握 90%'] },
      { en: [original], zh: [original] },
    ];
    const selectLanguage = (tag: 'zh' | 'en') => b.evaluate(`(() => { const link = document.createElement('a'); link.dataset.uiLanguage = '${tag}';
      link.href = '/locale?lang=${tag}'; document.body.append(link); link.click(); link.remove(); })()`);
    await b.evaluate(`(() => {
      const fetchOriginal = window.fetch;
      window.holdRunRequests = [];
      window.fetch = (input, init) => {
        const path = new URL(String(input?.url || input), location.href).pathname, method = init?.method || 'GET';
        if (path.includes('/api/plugins/io.molis.work.workflows/workflows')) holdRunRequests.push(method);
        const response = fetchOriginal(input, init);
        if (window.holdNullLocale && method === 'GET' && path.endsWith('/workflows/instances/${runs[2]!.instance_id}')) {
          return response.then(value => new Promise(resolve => { window.releaseHeldRun = () => resolve(value); }));
        }
        if (window.holdNullLocale && method === 'POST' && path === '/api/ui/locale') {
          return response.then(value => new Promise(resolve => { window.releaseHeldLocale = () => { window.holdNullLocale = false; resolve(value); }; }));
        }
        return response;
      };
    })()`);
    const words = `Array.from(document.querySelectorAll('.wf-handoff__note.is-held > span > span'), node => node.textContent)`;
    for (const [index, expected] of cases.entries()) {
      if (index > 0) await child.click('[data-wf-action=back-to-flow]');
      await child.waitFor(`document.querySelector('[data-wf-open-instance="${runs[index]!.instance_id}"]')`);
      if (index === 2) await b.evaluate('window.holdNullLocale = true');
      await child.click(`[data-wf-open-instance="${runs[index]!.instance_id}"]`);
      if (index === 2) {
        await b.waitFor("typeof releaseHeldRun === 'function'");
        await selectLanguage('zh');
        await b.waitFor("typeof releaseHeldLocale === 'function'");
        assert.equal(await child.evaluate('document.documentElement.lang'), 'en');
        await b.evaluate('releaseHeldRun()');
      }
      await child.waitFor(`JSON.stringify(${words})===${JSON.stringify(JSON.stringify(expected.en))}`);
      assert.equal(await child.evaluate(`!!document.querySelector('.wf-handoff__note.is-held tag')`), false);
      if (index === 3) assert.equal(await child.evaluate(`document.querySelector('.wf-handoff__note.is-held span[translate]').getAttribute('translate')`), 'no');
      if (!expected.zh) continue;
      await child.evaluate(`(() => {
        window.heldRun = document.querySelector('.wf-run'); window.heldNote = heldRun.querySelector('.is-held');
        window.heldBack = heldRun.querySelector('[data-wf-action=back-to-flow]'); heldBack.focus();
        if (!window.holdInvalidations) {
          window.holdInvalidations = { count: 0 };
          document.querySelector('[data-workflows=workbench]').addEventListener('molis-work:select-item', event => {
            if (event.detail?.invalidate) holdInvalidations.count++;
          });
        }
      })()`);
      await b.evaluate('holdRunRequests.length = 0');
      for (const [tag, locale] of [['zh', 'zh-CN'], ['en', 'en']] as const) {
        const count = await child.evaluate<number>('holdInvalidations.count');
        if (index === 2 && tag === 'zh') await b.evaluate('releaseHeldLocale()');
        else await selectLanguage(tag);
        await child.waitFor(`document.documentElement.lang === '${locale}' && holdInvalidations.count > ${count}`);
        assert.deepEqual(await child.evaluate(words), expected[tag]);
        assert.deepEqual(await child.evaluate(`[document.querySelector('.wf-run')===heldRun, heldRun.dataset.id, heldRun.querySelector('.is-held')===heldNote,
          document.activeElement===heldBack]`), [true, runs[index]!.instance_id, true, true]);
      }
      assert.deepEqual(await b.evaluate('holdRunRequests'), [], 'changing language makes no Workflow business request');
    }
    await runWithLocale('en', async () => {
      for (const run of runs.slice(0, 3)) assert.deepEqual((await actions.invoke(w.instance, { id: run.instance_id })).instance.stopped, run.stopped);
    });
  } finally { remove(); }
});

test('FSS-36 unknown plugin results keep their original words beside English controls after a late navigation response', { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, 'seeded', undefined, null);
  if (!b) return;
  const child = await pluginFrameBrowser(t,b,"workflows");
  const { command, sessionId } = b;
  const { click, waitFor, evaluate } = child;
  const source = createLocalFeedSourceService(b.store.db, b.projectId!).register({
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
  const plugin = definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: 'io.molis.work.fixture.long-result', version: '1.0.0', name: '长结果', kind: 'app',
    publisher: { publisher_id: 'test', signature: 'test' }, entrypoints: [{ deployment: 'local', entrypoint: './index.js' }], permissions: [],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [action.definition] },
    async start() { return { kind: 'app', actions: [action.handler] }; } });
  const reference = molisWorkHostProjectReference({ databasePath: b.databasePath, projectId: b.projectId! });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(b.store.db), undefined,
    { hostIds: ISOLATED_HOST_IDS, actions: { registry: b.localHost!.actionRegistry(reference), project_id: b.projectId } });
  const installed = runtime.install({ trust: { level: "unsigned" }, definition: plugin, deployment: 'local', grants: [] }).install;
  await runtime.start(installed.install_id);
  try {
    const actions = bindActionClient(b.localHost!.actionClient(reference), () => ({ actor_id: 'web-user', project_id: b.projectId, audience: 'user',
      permissions: [...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS] }));
    const { workflow, prior, instance } = await runWithLocale('en', async () => {
      const choice = (await actions.invoke(w.actionSteps, {})).actions.find(row => row.ref.capability_id === action.definition.capability_id)!;
      assert.ok(choice, 'the installed provider is discovered without a Host entry');
      const chain = { stations: [{ plugin: 'feed' }, { plugin: 'action', action: {
        ref: choice.ref, title: choice.title, group: choice.group, mapping: {},
      } }], links: [{ kind: 'function', title_template: '', body_template: '{正文}', instructions: '' }] };
      const { workflow } = await actions.invoke(w.create, { title: '长正文结果验证', chain });
      const { workflow: prior } = await actions.invoke(w.create, { title: '另一个流程', chain });
      const { instance } = await actions.invoke(w.start, { id: workflow.workflow_id, item_id: item.item_id });
      await actions.invoke(w.continue, { id: instance.instance_id });
      return { workflow, prior, instance };
    });
    const projectPath = `/projects/${b.projectId}/`;
    await b.navigate(() => command('Page.navigate', { url: `${b.origin}/locale?lang=en&next=${encodeURIComponent(projectPath)}` }, sessionId));
    await b.click('[data-plugin-strip] [data-plugin-id=workflows]');
    await waitFor(`document.querySelector('[data-workflows=workbench]')?.dataset.wfMode === 'list' && document.querySelector('[data-wf-open="${workflow.workflow_id}"]')?.getClientRects().length > 0`);
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
        const original = window.molisWorkRequest;
        window.__workflowOldReadDone = false;
        window.molisWorkRequest = Object.assign(async (url, init) => {
          const answer = await original(url, init);
          if (String(url).endsWith('/api/plugins/io.molis.work.native.workflows/workflows/${prior.workflow_id}')) {
            requestAnimationFrame(() => requestAnimationFrame(() => { window.__workflowOldReadDone = true; }));
          }
          return answer;
        }, original);
      })()`);
      await click(`[data-wf-open="${prior.workflow_id}"]`);
      await readingOld.promise;
      await click(`[data-wf-open="${workflow.workflow_id}"]`);
      await waitFor(`document.querySelector('[data-wf-open-instance="${instance.instance_id}"]')`);
      releaseOld.resolve(); await oldReturned.promise;
      await waitFor("window.__workflowOldReadDone === true");
      assert.equal(await evaluate(`document.querySelector('[data-wf-open-instance="${instance.instance_id}"]') !== null`), true, 'a late prior workflow cannot replace the user selection');
    } finally { releaseOld.resolve(); mock.mock.restore(); }
    assert.match(await evaluate("document.querySelector('[data-wf-action=edit-step]').textContent"), /保存长结果/);
    await click(`[data-wf-open-instance="${instance.instance_id}"]`);
    await waitFor("document.querySelector('[data-wf-result-summary] h3')?.textContent === '长结果已保存'");
    assert.equal(await evaluate("document.querySelector('.wf-result-details summary').textContent"), 'Technical details');
    assert.equal(await evaluate("document.querySelector('.wf-result-text').textContent"), note.slice(0, 4000));
    assert.equal(await evaluate("document.querySelector('.wf-result-text script') !== null"), false);
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("window.innerWidth === 390");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
    assert.equal(await evaluate("document.querySelector('.wf-result-details').open"), false);
    assert.match(await evaluate("document.querySelector('.wf-stage__result').innerText"), /Showing an excerpt\./);
    const long = await command('Page.captureScreenshot', { format: 'png' }, sessionId) as { data: string };
    await writeFile('/tmp/action-workflow-result-review/long-narrow.png', Buffer.from(long.data, 'base64'));
  } finally { await runtime.stop(installed.install_id); }
});
