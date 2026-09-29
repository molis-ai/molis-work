import type { PluginComponentNode } from './plugin-components.js';
import type { PluginPresentation } from './plugin-presentation.js';
import { PLUGIN_COMPONENT_STYLES } from './plugin-components.js';
import { PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT } from './plugin-component-client.js';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

export const readingContract: SandboxPluginContract = {
  version: 1, pluginId: 'test.reading', revision: 'reading-v1', entities: [], acceptance: [],
  pages: [{ id: 'home', title: '阅读摘记', regions: [{ id: 'main', title: '摘记', operationIds: ['notes.list', 'notes.add', 'notes.remove'] }] }],
  operations: [
    { id: 'notes.list', kind: 'query', input: { type: 'object', properties: { query: { type: 'string', description: '摘记' } } }, output: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, text: { type: 'string' }, source: { type: 'string' } } } }, effects: {}, examples: [], errors: [] },
    { id: 'notes.add', kind: 'command', input: { type: 'object', properties: { title: { type: 'string', description: '标题', maxLength: 100 }, text: { type: 'string', description: '摘记正文', maxLength: 4000 }, source: { type: 'string', description: '来源' } }, required: ['title', 'text'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
    { id: 'notes.remove', kind: 'command', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, output: { type: 'object' }, effects: {}, examples: [], errors: [] },
  ],
};
export const readingNodes: PluginComponentNode[] = [
  { id: 'heading', pageId: 'home', regionId: 'main', intent: 'heading', purpose: '读过的文字，留下自己的想法', props: { title: '阅读摘记', description: '读过的文字，留下自己的想法' }, kind: 'frame' },
  { id: 'notes', pageId: 'home', regionId: 'main', intent: 'collection', purpose: '浏览与阅读摘记', props: { titleField: 'title', textField: 'text', idField: 'id', emptyText: '还没有摘记，写下第一段触动你的文字', columns: [{ field: 'source', label: '来源' }] }, kind: 'directory', read: { operationId: 'notes.list', input: { query: { source: 'form', field: 'query' } } } },
  { id: 'editor', pageId: 'home', regionId: 'main', intent: 'input', purpose: '新建摘记', props: { title: '新建摘记', submitLabel: '保存摘记' }, kind: 'sheet', submit: { operationId: 'notes.add', input: { title: { source: 'form', field: 'title' }, text: { source: 'form', field: 'text' }, source: { source: 'form', field: 'source' } } } },
  { id: 'remove', pageId: 'home', regionId: 'main', intent: 'action', purpose: '删除摘记', props: { submitLabel: '删除这条摘记' }, kind: 'alert-dialog', submit: { operationId: 'notes.remove', input: { id: { source: 'selection', componentId: 'notes', field: 'id' } } } },
];
export const readingPresentation: PluginPresentation = {
  version: 1, pages: [{ pageId: 'home', layout: { layout: 'stack', gap: 'roomy', children: readingNodes.map(node => ({ part: node.id })) } }],
  parts: { notes: { detail: true, density: 'reading', kind: 'directory' }, editor: { kind: 'sheet', emphasis: 'primary' }, remove: { kind: 'alert-dialog' } },
};
export const readingSamples = [
  { id: 'one', title: '把注意力放回眼前的事', source: '阅读札记 · 注意力', text: '一段完整的时间，比许多零碎的空隙更适合深入思考。\n\n今天试着把手机放到另一个房间，只留书、纸和一杯水。读到一半时，想查资料的冲动来了三次。我把问题写在纸边，继续往下读。\n\n等到这一章结束，那些问题有两个已经自己找到了答案。值得保留的习惯：先走完一段路，再回头补地图。' },
  { id: 'two', title: '散步之后，问题变小了', source: '阅读札记 · 日常', text: '把难题暂时留在桌上，出门走一圈。回来时，先写下最小的一步。' },
  { id: 'three', title: '设计也需要安静的地方', source: '阅读札记 · 设计', text: '层次来自每个元素各有位置。留白让相邻的想法可以被分开理解。' },
];

/** The catalogue uses the production renderer; this clearly labelled sample never reaches plugin storage. */
export function renderPluginPresentationExample() {
  const view = { contract: readingContract, nodes: readingNodes, connected: readingContract.operations.map(operation => operation.id), presentation: readingPresentation };
  return '<style>' + PLUGIN_COMPONENT_STYLES + '</style><p class="mw-catalog__hint">可交互示例 · 数据只保留在此页内存。试用新建、搜索、阅读详情和删除；缩窄窗口可返回目录。</p><div data-presentation-example></div><script>(()=>{let rows=' + JSON.stringify(readingSamples) + ';const root=document.querySelector("[data-presentation-example]");const app=(' + PLUGIN_COMPONENT_CLIENT_FACTORY_SCRIPT + ')({root,call:async(id,binding,payload)=>{if(binding==="read")return rows.filter(row=>row.title.includes(payload.form.query||""));if(id==="remove"){rows=rows.filter(row=>row.id!==payload.selection.notes.id);return {removed:true}}const row={...payload.form,id:crypto.randomUUID()};rows.unshift(row);return row}});app.update(' + JSON.stringify(view) + ');})()</script>';
}
