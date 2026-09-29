import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { PLUGIN_COMPONENT_STYLES, VISUAL_FOUNDATION_STYLES } from '@molis-ai/molis-work-design-system';
import { AGENT_STUDIO_CLIENT_FACTORY_SCRIPT } from '../plugins/native/plugin-builder/src/agent-studio.js';
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from '@molis-ai/molis-work-ui-host';
import { runBuilderBrowserAcceptance } from '../apps/local-host/src/plugin-builder/browser.js';
import { ChromeHarness } from './fixtures/plugin-builder-browser.js';
import { readingContract, readingNodes, readingSamples } from './fixtures/plugin-composition.js';

test('Builder diagnoses accepted reads with current selection, without another call or a stale response', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'molis-builder-diagnostics-')), browser = await ChromeHarness.start(directory);
  assert.ok(browser, 'Chrome is required');
  const compiled = await build({ entryPoints: ['packages/design-system/src/plugin-component-client.ts'], bundle: true, write: false, format: 'iife', globalName: 'PluginUi', platform: 'browser', target: 'es2022' });
  const notes = readingNodes.find(node => node.id === 'notes')!;
  const reader = { id: 'reader', pageId: notes.pageId, regionId: notes.regionId, intent: 'description', kind: 'card', purpose: '完整阅读', props: { titleField: 'title', textField: 'text' },
    read: { operationId: 'notes.read', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } };
  const contract = structuredClone(readingContract);
  contract.operations.push({ ...contract.operations.find(op => op.id === 'notes.list')!, id: 'notes.read', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: contract.operations.find(op => op.id === 'notes.list')!.output.items! });
  const view = { contract, nodes: [notes, reader], connected: contract.operations.map(op => op.id) };
  const draft = { design: { contract }, nodes: view.nodes, connected: view.connected };
  let reads = 0, fail = false, hold = false, release: (() => void) | undefined, entered: (() => void) | undefined;
  const html = '<!doctype html><meta charset="utf-8"><style>' + VISUAL_FOUNDATION_STYLES + PLUGIN_COMPONENT_STYLES + '</style><main data-studio-preview></main><script>' + compiled.outputFiles[0]!.text + '\n(' + AGENT_STUDIO_CLIENT_FACTORY_SCRIPT + ')({mountPluginClient:(' + UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT + ')(),mode:"preview",build:"probe",api:path=>path,components:options=>{globalThis.app=PluginUi.createPluginComponentClient(options);return app;}})</script>';
  const server = createServer(async (request, response) => {
    if (request.url === '/preview') { response.setHeader('content-type', 'text/html'); response.end(html); return; }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/builds/probe') { response.end(JSON.stringify({ build: draft })); return; }
    if (request.url !== '/builds/probe/call') { response.writeHead(404); response.end('{}'); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()); reads++;
    if (body.componentId === 'notes') { response.end(JSON.stringify({ value: readingSamples })); return; }
    const id = body.payload.selection?.notes?.id;
    if (!id || fail) { response.writeHead(400); response.end(JSON.stringify({ error: fail ? '读取暂时不可用' : 'missing id' })); return; }
    if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve; entered?.(); }); }
    response.end(JSON.stringify({ value: readingSamples.find(row => row.id === id) }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/preview';
  try {
    const page = await browser.page(); await page.command('Page.navigate', { url }); await page.wait('globalThis.__molisPluginReady');
    await page.click('[data-record-id=one] [data-pc-select]'); await page.wait('globalThis.__molisPluginPending===0');
    const before = reads;
    assert.deepEqual(await page.evaluate('globalThis.__molisPluginRead("reader")'), readingSamples[0]);
    assert.equal(reads, before, 'a diagnosis never starts an unbound query');
    hold = true; const started = new Promise<void>(resolve => { entered = resolve; });
    await page.evaluate('void app.refresh()'); await started;
    await page.click('[data-record-id=two] [data-pc-select]');
    await page.wait('document.querySelector("[data-component-id=reader]").innerText.includes("散步")');
    release!(); await page.wait('globalThis.__molisPluginPending===0');
    assert.deepEqual(await page.evaluate('globalThis.__molisPluginRead("reader")'), readingSamples[1], 'late results do not replace the current diagnostic data');
    fail = true; await page.evaluate('app.refresh()'); const afterFailure = reads;
    assert.equal(await page.evaluate('globalThis.__molisPluginRead("reader").catch(error=>error.message)'), '读取暂时不可用');
    assert.equal(reads, afterFailure, 'a failed query is also diagnosed without retrying it'); fail = false;

    // Exercise the production G7 diagnosis with an immediate failed assertion.
    const acceptance = [{ id: 'probe', description: '诊断选中记录', steps: [{ action: 'select', componentId: 'notes', text: readingSamples[0]!.title }, { action: 'expectAbsent', componentId: 'reader', text: readingSamples[0]!.title }] }];
    const result = await runBuilderBrowserAcceptance({ ...draft, design: { ...draft.design, acceptance } } as any, { url, signal: new AbortController().signal });
    assert.equal(result.passed, false);
    const diagnosis = JSON.parse(result.cases[0]!.detail);
    assert.equal(diagnosis.componentId, 'reader');
    assert.deepEqual(JSON.parse(diagnosis.data), readingSamples[0], 'G7 receives the actual selected record, including fields not rendered');
    assert.doesNotMatch(diagnosis.data, /missing id/);
  } finally {
    release?.(); await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  }
});
