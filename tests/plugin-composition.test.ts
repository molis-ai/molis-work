import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePluginPresentation } from '../packages/design-system/src/plugin-presentation.js';
import { readingContract, readingNodes, readingPresentation } from './fixtures/plugin-composition.js';
import { sandboxedPluginDefinition } from '../apps/local-host/src/plugin-builder/installed.js';
import { resolvePluginActivation } from '@molis-ai/molis-work-plugin-runtime';
import { PLUGIN_PRESENTATION_CAPABILITY } from '../packages/design-system/src/plugin-presentation.js';
import type { AgentDesign, AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import { acceptPresentation, presentationTask } from '../plugins/native/plugin-builder/src/agent-presentation.js';

test('presentation references all parts exactly once and cannot acquire operations or scripts', () => {
  assert.equal(validatePluginPresentation(readingPresentation, readingNodes, readingContract), readingPresentation);
  const invalid = (change: (value: any) => void, reason: RegExp) => { const copy = structuredClone(readingPresentation); change(copy); assert.throws(() => validatePluginPresentation(copy, readingNodes, readingContract), reason); };
  invalid(p => p.pages[0].layout.children.pop(), /遗漏/);
  invalid(p => p.pages[0].layout.children.push({ part: 'notes' }), /重复/);
  invalid(p => p.pages[0].layout.children[0] = { part: 'other-page' }, /跨页/);
  invalid(p => p.parts.editor.kind = 'table', /不支持组件/);
  invalid(p => p.parts.editor.detail = true, /详情/);
  invalid(p => p.parts.notes.onclick = 'fetch("/secret")', /不支持属性/);
  invalid(p => p.version = 99, /版本/);
  invalid(p => p.parts.remove.emphasis = 'primary', /最多一个主操作/);
});

test('installation requires the versioned renderer; legacy releases still activate without it', () => {
  const release = { pluginId: readingContract.pluginId, buildId: 'compatibility', version: 1,
    design: { title: '阅读摘记', contract: readingContract, parts: readingNodes, presentation: readingPresentation }, nodes: readingNodes } as unknown as AgentRelease;
  const manifest = sandboxedPluginDefinition(release, {}, []).manifest;
  assert.deepEqual(resolvePluginActivation({ manifests: [manifest] }).blocked, [readingContract.pluginId]);
  assert.deepEqual(resolvePluginActivation({ manifests: [manifest], hostCapabilities: [PLUGIN_PRESENTATION_CAPABILITY] }).order, [readingContract.pluginId]);
  const legacy = structuredClone(release); delete legacy.design.presentation;
  assert.deepEqual(resolvePluginActivation({ manifests: [sandboxedPluginDefinition(legacy, {}, []).manifest] }).order, [readingContract.pluginId]);
});

test('new UI composition cannot hide a selected record action behind a second reading mode; historical layouts still load', () => {
  const contract = structuredClone(readingContract), parts = readingNodes.map(({ kind: _kind, ...plan }) => structuredClone(plan));
  contract.operations.push({ id: 'notes.read', kind: 'query', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    output: { type: 'object', properties: { title: { type: 'string' }, text: { type: 'string' } } }, effects: {}, examples: [], errors: [] });
  contract.pages[0]!.regions[0]!.operationIds.push('notes.read');
  parts.push({ id: 'reader', pageId: 'home', regionId: 'main', intent: 'description', purpose: '读取选中摘记的全文', props: { titleField: 'title', textField: 'text' },
    read: { operationId: 'notes.read', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } });
  const design: AgentDesign = { id: 'reading', title: '阅读', description: '阅读摘记', rationale: '', journey: ['打开全文'], contract, parts, acceptance: [] };
  const presentation = structuredClone(readingPresentation);
  presentation.pages[0]!.layout = { layout: 'stack', children: parts.map(part => ({ part: part.id })) };
  const answer = { summary: '正文独立呈现', presentation };
  assert.match(presentationTask({ brief: '读全文', design }, '整理').parts.find(part => part.id === 'notes')!.detailUnavailableBecause!, /reader/);
  assert.equal(validatePluginPresentation(presentation, parts, contract), presentation, 'the shared reader continues to accept historical layouts');
  assert.throws(() => acceptPresentation(JSON.stringify(answer), design), /已有独立正文 reader/);
  assert.throws(() => acceptPresentation(JSON.stringify({ ...answer, props: { reader: {} } }), design), /已有独立正文 reader/, 'dropping the text mapping cannot evade the reading contract');
  presentation.parts.notes!.detail = false;
  const accepted = acceptPresentation(JSON.stringify(answer), design);
  assert.deepEqual(accepted.design.parts, parts); assert.deepEqual(accepted.design.contract, contract);
  const metadata = structuredClone(design); delete metadata.parts.find(part => part.id === 'reader')!.props.textField;
  presentation.parts.notes!.detail = true;
  assert.doesNotThrow(() => acceptPresentation(JSON.stringify(answer), metadata), 'metadata and ordinary record commands can coexist with collection detail');
});
